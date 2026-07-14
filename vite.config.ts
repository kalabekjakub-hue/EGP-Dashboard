import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type RawOrder = {
  id: string; status: string; currency: string; amount_total_minor: number; email: string;
  locale: string; registration_country: string; plate: string; created_at: string;
  paid_at?: string; fulfilled_at?: string; flex_enabled: boolean; order_number: string; fulfillment_status?: string;
  vehicle_type?: string; fuel_type?: string; vehicle_vin?: string;
  invoice_pdf_path?: string; last_error?: string;
};
type RawItem = {
  id: string; order_id: string; country_code: string; validity?: string; start_date?: string;
  end_date?: string; price_eur_minor: number; status: string; fulfilled_at?: string;
  failed_at?: string; last_error?: string; engine_submitted_at?: string; state_reference?: string;
  created_at?: string; pdf_storage_path?: string; fulfillment_screenshots_meta?: ScreenshotMeta | null;
  source?: "order_items" | "order_bridge_toll_items";
};
type ScreenshotMeta = {
  bucket: string;
  storagePrefix: string;
  date: string;
  orderId?: string;
  orderItemId?: string;
  country: string;
  plate?: string;
  success: boolean;
  uploadedAt: string;
  steps: Array<{ index: number; name: string; file: string }>;
};
type ScreenshotRow = {
  id: string;
  order_id: string;
  country_code: string;
  fulfillment_screenshots_meta: ScreenshotMeta | null;
};

function loadWorkerEnv() {
  const file = process.env.EGP_WORKER_ENV_PATH ?? "C:/Users/Jakub/eurogopass-fulfillment-worker/.env";
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
  return {
    url: values.SUPABASE_URL?.replace(/\/$/, ""),
    key: values.SUPABASE_SERVICE_ROLE_KEY,
    monitorUrl: (process.env.EGP_WORKER_MONITOR_URL ?? "http://127.0.0.1:3090").replace(/\/$/, ""),
    monitorToken: process.env.EGP_WORKER_MONITOR_TOKEN ?? values.MONITOR_READ_TOKEN,
  };
}

function formatDate(value?: string, dateOnly = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("cs-CZ", dateOnly
    ? { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }
    : { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(new Date(value));
}

function duration(start?: string, end?: string) {
  if (!start) return undefined;
  const seconds = Math.max(0, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function itemStatus(item: RawItem) {
  if (item.status === "fulfilled") return "fulfilled";
  if (item.status === "failed" || item.failed_at) return "failed";
  if (item.engine_submitted_at) return "processing";
  return "waiting";
}

function supabaseReadApi() {
  return {
    name: "eurogopass-read-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/orders", async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          const { url, key } = loadWorkerEnv();
          if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
          const headers = { apikey: key, Authorization: `Bearer ${key}` };
          const orderSelect = "id,status,currency,amount_total_minor,email,locale,registration_country,plate,created_at,paid_at,fulfilled_at,flex_enabled,order_number,fulfillment_status,invoice_pdf_path,last_error,vehicle_type,fuel_type,vehicle_vin";
          const orderResponse = await fetch(`${url}/rest/v1/orders?select=${orderSelect}&order=created_at.desc&limit=50`, { headers });
          if (!orderResponse.ok) throw new Error(`Orders API ${orderResponse.status}`);
          const rawOrders = await orderResponse.json() as RawOrder[];
          const ids = rawOrders.map(order => order.id);
          const itemSelect = "id,order_id,country_code,validity,start_date,end_date,price_eur_minor,status,created_at,fulfilled_at,failed_at,last_error,engine_submitted_at,state_reference,pdf_storage_path,fulfillment_screenshots_meta";
          const encodedIds = encodeURIComponent(`(${ids.join(",")})`);
          const loadItems = async (table: string) => {
            if (!ids.length) return [] as RawItem[];
            const response = await fetch(`${url}/rest/v1/${table}?select=${itemSelect}&order=created_at.asc&order_id=in.${encodedIds}`, { headers });
            if (!response.ok) return [] as RawItem[];
            return response.json() as Promise<RawItem[]>;
          };
          const [vignettes, tolls] = await Promise.all([loadItems("order_items"), loadItems("order_bridge_toll_items")]);
          const allItems: RawItem[] = [
            ...vignettes.map(item => ({ ...item, source: "order_items" as const })),
            ...tolls.map(item => ({ ...item, source: "order_bridge_toll_items" as const })),
          ];
          const data = rawOrders.map(order => {
            const items = allItems.filter(item => item.order_id === order.id).map(item => {
              const status = itemStatus(item);
              return {
                id: item.id,
                source: item.source,
                country: item.country_code,
                flag: "",
                product: item.validity ?? "Mýtný produkt",
                validFrom: formatDate(item.start_date, true),
                validTo: formatDate(item.end_date, true),
                price: item.price_eur_minor / 100,
                status,
                duration: duration(item.engine_submitted_at, item.fulfilled_at ?? item.failed_at),
                currentStep: status === "processing" ? "Zpracování" : undefined,
                reference: item.state_reference,
                invoice: item.status === "fulfilled" ? "ready" : "waiting",
                engineSubmittedAt: item.engine_submitted_at,
                fulfilledAt: item.fulfilled_at,
                failedAt: item.failed_at,
                lastError: item.last_error,
                createdAtIso: item.created_at,
                pdfAvailable: Boolean(item.pdf_storage_path),
                screenshotsAvailable: Boolean(item.fulfillment_screenshots_meta?.steps?.length),
              };
            });
            const rawOrderStatus = order.status.toLowerCase().replace(/[\s-]+/g, "_");
            const status = ["pending", "awaiting_payment"].includes(rawOrderStatus) ? "awaiting_payment"
              : items.some(item => item.status === "failed") ? "failed"
              : items.some(item => item.status === "processing") ? "processing"
              : items.length && items.every(item => item.status === "fulfilled") ? "fulfilled" : "waiting";
            return {
              id: order.id, number: order.order_number, plate: order.plate,
              registrationCountry: order.registration_country, registrationCode: order.registration_country.toLowerCase(),
              email: order.email, createdAt: formatDate(order.created_at), paidAt: formatDate(order.paid_at),
              total: order.amount_total_minor / 100, plus: order.flex_enabled,
              vehicleType: order.vehicle_type, fuelType: order.fuel_type, vin: order.vehicle_vin,
              locale: order.locale,
              status, items,
              createdAtIso: order.created_at,
              paidAtIso: order.paid_at,
              fulfilledAtIso: order.fulfilled_at,
              invoiceAvailable: Boolean(order.invoice_pdf_path),
              lastError: order.last_error,
            };
          });
          res.statusCode = 200;
          res.end(JSON.stringify({ mode: "live", data }));
        } catch (error) {
          res.statusCode = 503;
          res.end(JSON.stringify({ mode: "demo", error: error instanceof Error ? error.message : "Supabase není dostupná" }));
        }
      });
    },
  };
}

function manualFulfillmentApi() {
  return {
    name: "eurogopass-manual-fulfillment-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/orders/fulfill-item", async (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, error: "Method not allowed" }));
          return;
        }
        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { orderId?: string; itemId?: string; source?: string };
          const allowedSources = new Set(["order_items", "order_bridge_toll_items"]);
          if (!body.orderId || !body.itemId || !body.source || !allowedSources.has(body.source)) throw new Error("Neplatná položka objednávky");
          const { url, key } = loadWorkerEnv();
          if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
          const target = `${url}/rest/v1/${body.source}?id=eq.${encodeURIComponent(body.itemId)}&order_id=eq.${encodeURIComponent(body.orderId)}`;
          const upstream = await fetch(target, {
            method: "PATCH",
            headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=representation" },
            body: JSON.stringify({ status: "fulfilled", fulfilled_at: new Date().toISOString(), failed_at: null, last_error: null }),
          });
          if (!upstream.ok) throw new Error(`Supabase API ${upstream.status}`);
          const updated = await upstream.json() as Array<{ id: string; fulfilled_at: string }>;
          if (updated.length !== 1) throw new Error("Položka nebyla nalezena nebo nebyla jednoznačná");
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, fulfilledAt: updated[0].fulfilled_at }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Ruční dokončení selhalo" }));
        }
      });
    },
  };
}

function affiliateAnalyticsApi() {
  return {
    name: "eurogopass-affiliate-analytics-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/affiliates/summary", async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          const { url, key } = loadWorkerEnv();
          if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
          const headers = { apikey: key, Authorization: `Bearer ${key}` };
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const [affiliateResponse, orderResponse] = await Promise.all([
            fetch(`${url}/rest/v1/affiliates?select=id,code,display_name,commission_rate_bps,status&order=created_at.asc`, { headers }),
            fetch(`${url}/rest/v1/orders?select=id,affiliate_id,affiliate_commission_minor,affiliate_commission_status,amount_total_minor,currency,status,created_at,paid_at&affiliate_id=not.is.null&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=5000`, { headers }),
          ]);
          if (!affiliateResponse.ok || !orderResponse.ok) throw new Error("Affiliate data nejsou dostupná");
          const affiliates = await affiliateResponse.json() as Array<{ id: string; code: string; display_name: string; commission_rate_bps: number; status: string }>;
          const orders = await orderResponse.json() as Array<{ id: string; affiliate_id: string; affiliate_commission_minor?: number; affiliate_commission_status?: string; amount_total_minor: number; status: string; created_at: string; paid_at?: string }>;
          const partners = affiliates.map(affiliate => {
            const partnerOrders = orders.filter(order => order.affiliate_id === affiliate.id);
            return {
              id: affiliate.id,
              code: affiliate.code,
              name: affiliate.display_name,
              status: affiliate.status,
              commissionRate: affiliate.commission_rate_bps / 100,
              orders: partnerOrders.length,
              paidOrders: partnerOrders.filter(order => Boolean(order.paid_at)).length,
              revenue: partnerOrders.reduce((sum, order) => sum + order.amount_total_minor, 0) / 100,
              commission: partnerOrders.reduce((sum, order) => sum + (order.affiliate_commission_minor ?? 0), 0) / 100,
            };
          }).sort((a, b) => b.revenue - a.revenue);
          res.statusCode = 200;
          res.end(JSON.stringify({
            periodDays: 30,
            generatedAt: new Date().toISOString(),
            summary: {
              orders: orders.length,
              paidOrders: orders.filter(order => Boolean(order.paid_at)).length,
              revenue: orders.reduce((sum, order) => sum + order.amount_total_minor, 0) / 100,
              commission: orders.reduce((sum, order) => sum + (order.affiliate_commission_minor ?? 0), 0) / 100,
              pendingCommission: orders.filter(order => !["paid", "settled"].includes(order.affiliate_commission_status ?? "")).reduce((sum, order) => sum + (order.affiliate_commission_minor ?? 0), 0) / 100,
              activePartners: affiliates.filter(affiliate => affiliate.status === "active").length,
            },
            partners,
          }));
        } catch (error) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Affiliate data nejsou dostupná" }));
        }
      });
    },
  };
}

function screenshotReadApi() {
  const tables = new Set(["order_items", "order_bridge_toll_items"]);
  return {
    name: "eurogopass-screenshot-read-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/screenshots/file", async (req, res) => {
        const controller = new AbortController();
        res.on("close", () => controller.abort());
        try {
          const query = new URL(req.url ?? "/", "http://dashboard.local").searchParams;
          const source = query.get("source") ?? "";
          const itemId = query.get("id") ?? "";
          const file = query.get("file") ?? "";
          if (!tables.has(source) || !itemId || !file || file.includes("/") || file.includes("\\")) {
            res.writeHead(400).end("Invalid screenshot request");
            return;
          }
          const { url, key } = loadWorkerEnv();
          if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
          const headers = { apikey: key, Authorization: `Bearer ${key}` };
          const select = "id,fulfillment_screenshots_meta";
          const response = await fetch(`${url}/rest/v1/${source}?select=${select}&id=eq.${encodeURIComponent(itemId)}&limit=1`, { headers });
          if (!response.ok) throw new Error(`Screenshot metadata API ${response.status}`);
          const rows = await response.json() as Array<Pick<ScreenshotRow, "id" | "fulfillment_screenshots_meta">>;
          const meta = rows[0]?.fulfillment_screenshots_meta;
          if (!meta || !meta.steps.some((step) => step.file === file)) {
            res.writeHead(404).end("Screenshot not found");
            return;
          }
          const objectPath = `${meta.storagePrefix.replace(/\/$/, "")}/${file}`
            .split("/").map(encodeURIComponent).join("/");
          const upstream = await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(meta.bucket)}/${objectPath}`, {
            headers,
            signal: controller.signal,
          });
          if (!upstream.ok || !upstream.body) throw new Error(`Screenshot Storage ${upstream.status}`);
          const contentType = upstream.headers.get("content-type") ?? "image/png";
          res.writeHead(200, {
            "Content-Type": contentType,
            "Cache-Control": "private, max-age=300",
            ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
          });
          const reader = upstream.body.getReader();
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          if (!res.writableEnded) res.end();
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Screenshot není dostupný" }));
        }
      });

      server.middlewares.use("/api/screenshots", async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        try {
          const { url, key } = loadWorkerEnv();
          if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
          const headers = { apikey: key, Authorization: `Bearer ${key}` };
          const select = "id,order_id,country_code,fulfillment_screenshots_meta";
          const loadRows = async (table: string) => {
            const response = await fetch(`${url}/rest/v1/${table}?select=${select}&fulfillment_screenshots_meta=not.is.null&limit=1000`, { headers });
            if (!response.ok) throw new Error(`Screenshot list API ${response.status}`);
            return response.json() as Promise<ScreenshotRow[]>;
          };
          const [items, tolls] = await Promise.all([loadRows("order_items"), loadRows("order_bridge_toll_items")]);
          const runs = [
            ...items.map((row) => ({ row, source: "order_items" })),
            ...tolls.map((row) => ({ row, source: "order_bridge_toll_items" })),
          ].flatMap(({ row, source }) => {
            const meta = row.fulfillment_screenshots_meta;
            if (!meta?.storagePrefix || !Array.isArray(meta.steps)) return [];
            return [{
              id: `${source}:${row.id}`,
              source,
              itemId: row.id,
              orderId: row.order_id,
              country: row.country_code || meta.country,
              plate: meta.plate ?? "",
              date: meta.date,
              success: meta.success,
              uploadedAt: meta.uploadedAt,
              files: meta.steps
                .filter((step) => typeof step.file === "string" && step.file.toLowerCase().endsWith(".png"))
                .sort((a, b) => a.index - b.index)
                .map((step) => ({
                  index: step.index,
                  name: step.name,
                  file: step.file,
                  url: `/api/screenshots/file?source=${encodeURIComponent(source)}&id=${encodeURIComponent(row.id)}&file=${encodeURIComponent(step.file)}`,
                })),
            }];
          }).sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
          res.statusCode = 200;
          res.end(JSON.stringify({ mode: "live", runs }));
        } catch (error) {
          res.statusCode = 503;
          res.end(JSON.stringify({ mode: "unavailable", runs: [], error: error instanceof Error ? error.message : "Screenshoty nejsou dostupné" }));
        }
      });
    },
  };
}

let workerVersionsCache: { at: number; egpImage?: string; egpCreatedAt?: string; wiseCommit?: string } | null = null;
let remoteEgpHealthCache: { at: number; data: Record<string, unknown> | null } | null = null;
let remoteWiseHealthCache: { at: number; data: Record<string, unknown> | null } | null = null;

function vpsConnection() {
  return {
    key: process.env.EGP_VPS_SSH_KEY ?? "C:/Users/Jakub/eurogopass-fulfillment-worker/.ssh-deploy/egp_vps",
    host: process.env.EGP_VPS_SSH_HOST ?? "root@212.192.2.80",
  };
}

async function loadRemoteEgpHealth() {
  if (remoteEgpHealthCache && Date.now() - remoteEgpHealthCache.at < 15_000) return remoteEgpHealthCache.data;
  const { key, host } = vpsConnection();
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host, "curl -fsS --max-time 4 http://127.0.0.1:3080/health"], { timeout: 8_000 });
    const data = JSON.parse(stdout) as Record<string, unknown>;
    remoteEgpHealthCache = { at: Date.now(), data };
    return data;
  } catch {
    remoteEgpHealthCache = { at: Date.now(), data: null };
    return null;
  }
}

async function loadRemoteWiseHealth() {
  if (remoteWiseHealthCache && Date.now() - remoteWiseHealthCache.at < 15_000) return remoteWiseHealthCache.data;
  const { key, host } = vpsConnection();
  try {
    const { stdout } = await execFileAsync("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host, "curl -fsS --max-time 4 http://127.0.0.1:3081/health"], { timeout: 8_000 });
    const data = JSON.parse(stdout) as Record<string, unknown>;
    remoteWiseHealthCache = { at: Date.now(), data };
    return data;
  } catch {
    remoteWiseHealthCache = { at: Date.now(), data: null };
    return null;
  }
}

async function loadWorkerVersions() {
  if (workerVersionsCache && Date.now() - workerVersionsCache.at < 60_000) return workerVersionsCache;
  const { key, host } = vpsConnection();
  try {
    const remote = "printf 'EGP='; docker inspect egp-worker --format '{{.Image}}|{{.Created}}'; printf 'WISE='; cd /opt/3DWorker && git rev-parse --short HEAD";
    const { stdout } = await execFileAsync("ssh", ["-i", key, "-o", "BatchMode=yes", "-o", "ConnectTimeout=5", host, remote], { timeout: 8_000 });
    const egp = stdout.match(/^EGP=(sha256:[a-f0-9]+)\|([^\r\n]+)/m);
    const wise = stdout.match(/^WISE=([a-f0-9]+)/m);
    workerVersionsCache = { at: Date.now(), egpImage: egp?.[1], egpCreatedAt: egp?.[2], wiseCommit: wise?.[1] };
  } catch {
    workerVersionsCache = { at: Date.now() };
  }
  return workerVersionsCache;
}

function workerStatusApi() {
  return {
    name: "eurogopass-worker-status-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/workers/status", async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");
        const { monitorUrl, monitorToken } = loadWorkerEnv();
        const versionsPromise = loadWorkerVersions();
        const egpPromise = monitorToken
          ? fetch(`${monitorUrl}/api/config`, { headers: { "X-Monitor-Token": monitorToken }, signal: AbortSignal.timeout(3_500) })
              .then(async response => response.ok ? response.json() as Promise<Record<string, unknown>> : Promise.reject())
              .catch(() => loadRemoteEgpHealth())
          : loadRemoteEgpHealth();
        const wisePromise = fetch(process.env.WISE_WORKER_HEALTH_URL ?? "http://127.0.0.1:3081/health", { signal: AbortSignal.timeout(3_500) })
          .then(async response => response.ok ? response.json() as Promise<Record<string, unknown>> : Promise.reject())
          .catch(() => loadRemoteWiseHealth());
        const [egp, wise, versions] = await Promise.all([egpPromise, wisePromise, versionsPromise]);
        res.statusCode = 200;
        res.end(JSON.stringify({
          checkedAt: new Date().toISOString(),
          egp: {
            ok: egp?.ok === true || Boolean(egp && !("ok" in egp)),
            countries: egp?.fulfillmentCountries ?? [],
            passageCountries: egp?.passageFulfillmentCountries ?? [],
            itemFulfillmentEnabled: egp?.itemFulfillmentEnabled ?? false,
            image: versions.egpImage ? versions.egpImage.replace(/^sha256:/, "").slice(0, 12) : null,
            builtAt: versions.egpCreatedAt ?? null,
          },
          wise: {
            ok: wise?.ok === true,
            authenticated: wise?.authenticated === true,
            cdpConnected: wise?.cdpConnected === true,
            armed: wise?.armed === true,
            lastActivityAt: wise?.lastActivityAt ?? null,
            lastError: wise?.lastError ?? null,
            pendingNewOrders: wise?.pendingNewOrders ?? null,
            paymentWatchOrders: wise?.paymentWatchOrders ?? null,
            commit: versions.wiseCommit ?? null,
          },
        }));
      });
    },
  };
}

function workerLogProxy() {
  return {
    name: "eurogopass-worker-log-proxy",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/worker/logs", async (_req, res) => {
        try {
          const { monitorUrl, monitorToken } = loadWorkerEnv();
          if (!monitorToken) throw new Error("Monitor read token nebyl nalezen");
          const upstream = await fetch(`${monitorUrl}/api/logs`, {
            headers: {
              Accept: "application/json",
              "X-Monitor-Token": monitorToken,
            },
          });
          if (!upstream.ok) throw new Error(`Worker monitor odpověděl ${upstream.status}`);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(await upstream.text());
        } catch (error) {
          res.writeHead(502, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Worker monitor není dostupný",
          }));
        }
      });

      server.middlewares.use("/api/worker/events", async (req, res) => {
        const controller = new AbortController();
        req.on("close", () => controller.abort());
        try {
          const { monitorUrl, monitorToken } = loadWorkerEnv();
          if (!monitorToken) throw new Error("Monitor read token nebyl nalezen");
          const target = new URL(`${monitorUrl}/api/events`);
          target.searchParams.set("token", monitorToken);
          const upstream = await fetch(target, {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          });
          if (!upstream.ok || !upstream.body) {
            throw new Error(`Worker monitor odpověděl ${upstream.status}`);
          }
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          res.flushHeaders();
          const reader = upstream.body.getReader();
          while (!controller.signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
          if (!res.writableEnded) res.end();
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!res.headersSent) {
            res.writeHead(502, {
              "Content-Type": "application/json; charset=utf-8",
              "Cache-Control": "no-store",
            });
          }
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : "Worker monitor není dostupný",
          }));
        }
      });
    },
  };
}

type PostHogQueryResponse = {
  results?: unknown[][];
};

type PostHogAnalytics = {
  periodDays: number;
  generatedAt: string;
  summary: {
    visitors: number;
    pageviews: number;
    sessions: number;
    checkouts: number;
    paymentStarted: number;
    paidOrders: number;
    totalEvents: number;
    conversion: number;
    revenue: number;
    averageOrder: number;
    flexOrders: number;
    vignettes: number;
    bridgeTolls: number;
    routeSearches: number;
    routesCalculated: number;
    checkoutLeft: number;
    checkoutReturned: number;
    validationFailures: number;
    paymentFailures: number;
    rageClicks: number;
    warnings: number;
  };
  previous: { visitors: number; checkouts: number; paidOrders: number; revenue: number };
  daily: Array<{ date: string; visitors: number; checkouts: number; paidOrders: number }>;
  sources: Array<{ name: string; visitors: number }>;
  devices: Array<{ name: string; visitors: number }>;
  pages: Array<{ path: string; views: number }>;
  browsers: Array<{ name: string; visitors: number }>;
  countries: Array<{ name: string; visitors: number }>;
  languages: Array<{ name: string; visitors: number }>;
  checkoutSteps: Array<{ name: string; views: number }>;
  validationIssues: Array<{ step: string; reason: string; count: number }>;
};

let postHogCache: { at: number; data: PostHogAnalytics } | null = null;

function postHogReadApi(env: Record<string, string>) {
  const host = (env.POSTHOG_HOST || "https://eu.posthog.com").replace(/\/$/, "");
  const projectId = env.POSTHOG_PROJECT_ID;
  const personalApiKey = env.POSTHOG_PERSONAL_API_KEY;

  const runQuery = async (query: string) => {
    if (!projectId || !personalApiKey) throw new Error("PostHog konfigurace není kompletní");
    const response = await fetch(`${host}/api/projects/${encodeURIComponent(projectId)}/query/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${personalApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`PostHog API ${response.status}`);
    const payload = await response.json() as PostHogQueryResponse;
    if (!Array.isArray(payload.results)) throw new Error("PostHog vrátil neplatná data");
    return payload.results;
  };

  return {
    name: "eurogopass-posthog-read-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/posthog/summary", async (_req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "private, max-age=30");
        if (postHogCache && Date.now() - postHogCache.at < 60_000) {
          res.statusCode = 200;
          res.end(JSON.stringify({ mode: "live", cached: true, data: postHogCache.data }));
          return;
        }
        try {
          const [summaryRows, orderRows, previousRows, previousOrderRows, dailyRows, sourceRows, deviceRows, pageRows, browserRows, countryRows, languageRows, stepRows, validationRows] = await Promise.all([
            runQuery("SELECT uniqExactIf(distinct_id, event = '$pageview') AS visitors, countIf(event = '$pageview') AS pageviews, uniqExactIf(properties.$session_id, event = '$pageview') AS sessions, countIf(event = 'checkout_entered') AS checkouts, countIf(event = 'checkout_payment_started') AS payment_started, countIf(event = 'order_paid') AS paid, count() AS events, countIf(event = 'route_search_started') AS route_searches, countIf(event = 'route_calculated') AS routes_calculated, countIf(event = 'checkout_left') AS checkout_left, countIf(event = 'checkout_returned') AS checkout_returned, countIf(event = 'checkout_validation_failed') AS validation_failures, countIf(event = 'checkout_payment_failed') AS payment_failures, countIf(event = '$rageclick') AS rage_clicks, countIf(event = 'checkout_warning_shown') AS warnings FROM events WHERE timestamp >= now() - INTERVAL 30 DAY"),
            runQuery("SELECT count() AS orders, sum(toFloat(properties.amount_minor)) / 100 AS revenue, avg(toFloat(properties.amount_minor)) / 100 AS average_order, countIf(properties.has_flex = true) AS flex_orders, sum(toInt(properties.vignette_count)) AS vignettes, sum(toInt(properties.bridge_toll_count)) AS tolls FROM events WHERE event = 'order_paid' AND timestamp >= now() - INTERVAL 30 DAY"),
            runQuery("SELECT uniqExactIf(distinct_id, event = '$pageview') AS visitors, countIf(event = 'checkout_entered') AS checkouts, countIf(event = 'order_paid') AS paid FROM events WHERE timestamp >= now() - INTERVAL 60 DAY AND timestamp < now() - INTERVAL 30 DAY"),
            runQuery("SELECT sum(toFloat(properties.amount_minor)) / 100 AS revenue FROM events WHERE event = 'order_paid' AND timestamp >= now() - INTERVAL 60 DAY AND timestamp < now() - INTERVAL 30 DAY"),
            runQuery("SELECT toDate(timestamp) AS day, uniqExactIf(distinct_id, event = '$pageview') AS visitors, countIf(event = 'checkout_entered') AS checkouts, countIf(event = 'order_paid') AS paid FROM events WHERE timestamp >= now() - INTERVAL 30 DAY GROUP BY day ORDER BY day"),
            runQuery("SELECT properties.$referring_domain AS source, uniqExact(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY source ORDER BY visitors DESC LIMIT 6"),
            runQuery("SELECT properties.$device_type AS device, uniqExact(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY device ORDER BY visitors DESC LIMIT 6"),
            runQuery("SELECT properties.$pathname AS path, count() AS views FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY path ORDER BY views DESC LIMIT 6"),
            runQuery("SELECT properties.$browser AS browser, uniqExact(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY browser ORDER BY visitors DESC LIMIT 6"),
            runQuery("SELECT properties.$geoip_country_code AS country, uniqExact(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY country ORDER BY visitors DESC LIMIT 8"),
            runQuery("SELECT properties.$browser_language_prefix AS language, uniqExact(distinct_id) AS visitors FROM events WHERE event = '$pageview' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY language ORDER BY visitors DESC LIMIT 8"),
            runQuery("SELECT properties.step AS step, count() AS views FROM events WHERE event = 'checkout_step_viewed' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY step ORDER BY views DESC"),
            runQuery("SELECT properties.step AS step, properties.reason AS reason, count() AS failures FROM events WHERE event = 'checkout_validation_failed' AND timestamp >= now() - INTERVAL 30 DAY GROUP BY step, reason ORDER BY failures DESC LIMIT 10"),
          ]);
          const row = summaryRows[0] ?? [];
          const orders = orderRows[0] ?? [];
          const previous = previousRows[0] ?? [];
          const previousOrders = previousOrderRows[0] ?? [];
          const checkouts = Number(row[3] ?? 0);
          const paidOrders = Number(row[5] ?? 0);
          const data: PostHogAnalytics = {
            periodDays: 30,
            generatedAt: new Date().toISOString(),
            summary: {
              visitors: Number(row[0] ?? 0),
              pageviews: Number(row[1] ?? 0),
              sessions: Number(row[2] ?? 0),
              checkouts,
              paymentStarted: Number(row[4] ?? 0),
              paidOrders,
              totalEvents: Number(row[6] ?? 0),
              conversion: checkouts ? Math.round((paidOrders / checkouts) * 1000) / 10 : 0,
              revenue: Math.round(Number(orders[1] ?? 0) * 100) / 100,
              averageOrder: Math.round(Number(orders[2] ?? 0) * 100) / 100,
              flexOrders: Number(orders[3] ?? 0),
              vignettes: Number(orders[4] ?? 0),
              bridgeTolls: Number(orders[5] ?? 0),
              routeSearches: Number(row[7] ?? 0),
              routesCalculated: Number(row[8] ?? 0),
              checkoutLeft: Number(row[9] ?? 0),
              checkoutReturned: Number(row[10] ?? 0),
              validationFailures: Number(row[11] ?? 0),
              paymentFailures: Number(row[12] ?? 0),
              rageClicks: Number(row[13] ?? 0),
              warnings: Number(row[14] ?? 0),
            },
            previous: {
              visitors: Number(previous[0] ?? 0),
              checkouts: Number(previous[1] ?? 0),
              paidOrders: Number(previous[2] ?? 0),
              revenue: Math.round(Number(previousOrders[0] ?? 0) * 100) / 100,
            },
            daily: dailyRows.map(([date, visitors, dailyCheckouts, dailyPaid]) => ({
              date: String(date),
              visitors: Number(visitors ?? 0),
              checkouts: Number(dailyCheckouts ?? 0),
              paidOrders: Number(dailyPaid ?? 0),
            })),
            sources: sourceRows.map(([name, visitors]) => ({
              name: String(name || "$direct"),
              visitors: Number(visitors ?? 0),
            })),
            devices: deviceRows.map(([name, visitors]) => ({
              name: String(name || "Unknown"),
              visitors: Number(visitors ?? 0),
            })),
            pages: pageRows.map(([path, views]) => ({
              path: String(path || "/"),
              views: Number(views ?? 0),
            })),
            browsers: browserRows.map(([name, visitors]) => ({ name: String(name || "Unknown"), visitors: Number(visitors ?? 0) })),
            countries: countryRows.map(([name, visitors]) => ({ name: String(name || "Unknown"), visitors: Number(visitors ?? 0) })),
            languages: languageRows.map(([name, visitors]) => ({ name: String(name || "Unknown"), visitors: Number(visitors ?? 0) })),
            checkoutSteps: stepRows.map(([name, views]) => ({ name: String(name || "Unknown"), views: Number(views ?? 0) })),
            validationIssues: validationRows.map(([step, reason, count]) => ({ step: String(step || "Unknown"), reason: String(reason || "Unknown"), count: Number(count ?? 0) })),
          };
          postHogCache = { at: Date.now(), data };
          res.statusCode = 200;
          res.end(JSON.stringify({ mode: "live", cached: false, data }));
        } catch (error) {
          if (postHogCache) {
            res.statusCode = 200;
            res.end(JSON.stringify({ mode: "live", cached: true, stale: true, data: postHogCache.data }));
            return;
          }
          res.statusCode = 503;
          res.end(JSON.stringify({
            mode: "unavailable",
            error: error instanceof Error ? error.message : "PostHog není dostupný",
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    plugins: [react(), manualFulfillmentApi(), affiliateAnalyticsApi(), supabaseReadApi(), screenshotReadApi(), workerStatusApi(), workerLogProxy(), postHogReadApi(env)],
  };
});
