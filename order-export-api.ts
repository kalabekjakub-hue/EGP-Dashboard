import JSZip from "jszip";
import { passageDisplay } from "./src/passageCatalog";
import { loadServerConfig } from "./server-config";

const statusLabels: Record<string, string> = {
  awaiting_payment: "Čeká na platbu",
  plus: "Plus",
  waiting: "Čeká na zpracování",
  processing: "Zpracovává se",
  fulfilled: "Dokončeno",
  failed: "Neúspěšná",
};

type RawOrder = {
  id: string;
  status: string;
  currency: string;
  amount_total_minor: number;
  processing_fee_minor: number;
  email: string;
  locale: string;
  registration_country: string;
  plate: string;
  created_at: string;
  paid_at?: string;
  fulfilled_at?: string;
  flex_enabled: boolean;
  order_number: string;
  fulfillment_status?: string;
  vehicle_type?: string;
  fuel_type?: string;
  vehicle_vin?: string;
  invoice_pdf_path?: string;
  last_error?: string;
};

type RawItem = {
  id: string;
  order_id: string;
  country_code: string;
  validity?: string;
  start_date?: string;
  end_date?: string;
  price_eur_minor: number;
  status: string;
  fulfilled_at?: string;
  failed_at?: string;
  last_error?: string;
  engine_submitted_at?: string;
  state_reference?: string;
  pdf_storage_path?: string;
  fulfillment_screenshots_meta?: {
    bucket: string;
    storagePrefix: string;
    country: string;
    plate?: string;
    steps: Array<{ index: number; name: string; file: string }>;
  } | null;
  toll_id?: string;
  pass_count?: number;
  pass_date?: string;
  source?: "order_items" | "order_bridge_toll_items";
};

type OfficialDocument = {
  id: string;
  filename: string;
  content_type: string;
  storage_bucket: string;
  storage_path: string;
  country_code?: string;
  document_type: string;
};

function loadWorkerEnv() {
  const config = loadServerConfig();
  return { url: config.supabaseUrl, key: config.supabaseServiceKey };
}

function supabaseHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function formatDate(value?: string, dateOnly = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("cs-CZ", dateOnly
    ? { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }
    : { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }
  ).format(new Date(value));
}

function itemStatus(item: RawItem, flexEnabled = false) {
  const raw = item.status.toLowerCase().replace(/[\s-]+/g, "_");
  if (raw === "fulfilled") return "fulfilled";
  if (raw === "failed" || item.failed_at) return "failed";
  if (raw === "held" || (raw === "waiting" && flexEnabled)) return "plus";
  if (item.engine_submitted_at || raw === "pending" || raw === "processing") return "processing";
  return "waiting";
}

function orderUiStatus(rawOrderStatus: string, fulfillmentStatus: string | undefined, items: Array<{ status: string }>) {
  if (["pending", "awaiting_payment"].includes(rawOrderStatus)) return "awaiting_payment";
  if (items.some(item => item.status === "failed")) return "failed";
  if (items.some(item => item.status === "processing")) return "processing";
  if (items.some(item => item.status === "plus")) return "plus";
  if (items.length && items.every(item => item.status === "fulfilled")) return "fulfilled";
  if ((fulfillmentStatus ?? "").toLowerCase() === "held") return "plus";
  return "waiting";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] ?? ch));
}

function safeFilename(value: string) {
  const cleaned = value.normalize("NFKD").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 80) || "soubor";
}

function money(amount: number, currency = "EUR") {
  return amount.toLocaleString("cs-CZ", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function vehicleLabel(value?: string) {
  return ({ passenger: "Osobní automobil", "van-large": "Dodávka", motorcycle: "Motocykl" } as Record<string, string>)[value ?? ""] ?? value ?? "Neuvedeno";
}

function fuelLabel(value?: string) {
  return ({ standard: "Benzín / nafta", "electric-hydrogen": "Elektřina / vodík", "plugin-hybrid": "Plug-in hybrid", biomethane: "Biometan", "natural-gas": "Zemní plyn" } as Record<string, string>)[value ?? ""] ?? value ?? "Neuvedeno";
}

function requestOrderId(req: import("node:http").IncomingMessage) {
  const orderId = new URL(req.url ?? "/", "http://dashboard.local").searchParams.get("orderId")?.trim() ?? "";
  if (!orderId || orderId.length > 80) return "";
  return orderId;
}

async function fetchJson<T>(url: string, key: string, path: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: supabaseHeaders(key) });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchStorage(url: string, key: string, bucket: string, objectPath: string) {
  const encoded = objectPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const upstream = await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encoded}`, { headers: supabaseHeaders(key) });
  if (!upstream.ok) return null;
  return Buffer.from(await upstream.arrayBuffer());
}

async function loadOrderBundle(orderId: string) {
  const { url, key } = loadWorkerEnv();
  if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
  const orders = await fetchJson<RawOrder[]>(url, key, `orders?select=id,status,currency,amount_total_minor,processing_fee_minor,email,locale,registration_country,plate,created_at,paid_at,fulfilled_at,flex_enabled,order_number,fulfillment_status,vehicle_type,fuel_type,vehicle_vin,invoice_pdf_path,last_error&id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const order = orders[0];
  if (!order) return null;
  const vignetteSelect = "id,order_id,country_code,validity,start_date,end_date,price_eur_minor,status,fulfilled_at,failed_at,last_error,engine_submitted_at,state_reference,pdf_storage_path,fulfillment_screenshots_meta";
  const tollSelect = "id,order_id,toll_id,country_code,pass_count,pass_date,price_eur_minor,status,fulfilled_at,failed_at,last_error,engine_submitted_at,state_reference,pdf_storage_path,fulfillment_screenshots_meta";
  const [vignettes, tolls, official] = await Promise.all([
    fetchJson<RawItem[]>(url, key, `order_items?select=${vignetteSelect}&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`),
    fetchJson<RawItem[]>(url, key, `order_bridge_toll_items?select=${tollSelect}&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`),
    fetchJson<OfficialDocument[]>(url, key, `order_documents?select=id,filename,content_type,storage_bucket,storage_path,country_code,document_type&order_id=eq.${encodeURIComponent(orderId)}&order=created_at.asc`),
  ]);
  const items: RawItem[] = [
    ...vignettes.map(item => ({ ...item, source: "order_items" as const })),
    ...tolls.map(item => ({ ...item, source: "order_bridge_toll_items" as const })),
  ];
  return { url, key, order, items, official };
}

function mappedItems(order: RawOrder, items: RawItem[]) {
  return items.map(item => {
    const status = itemStatus(item, order.flex_enabled);
    const passage = item.source === "order_bridge_toll_items" ? passageDisplay(item.toll_id) : undefined;
    return {
      country: item.country_code,
      product: passage
        ? `${passage.name}${(item.pass_count ?? 1) > 1 ? ` · ${item.pass_count} průjezdy` : ""}`
        : item.validity ?? "Dálniční známka",
      validFrom: formatDate(item.pass_date ?? item.start_date, true),
      validTo: formatDate(item.pass_date ?? item.end_date, true),
      price: item.price_eur_minor / 100,
      status,
      reference: item.state_reference,
      lastError: item.last_error,
    };
  });
}

function summaryHtml(order: RawOrder, items: ReturnType<typeof mappedItems>) {
  const uiStatus = orderUiStatus(order.status.toLowerCase().replace(/[\s-]+/g, "_"), order.fulfillment_status, items);
  const currency = order.currency || "EUR";
  const rows = items.map(item => `<tr>
    <td>${escapeHtml(item.country)}</td>
    <td>${escapeHtml(item.product)}</td>
    <td>${escapeHtml(item.validFrom)} – ${escapeHtml(item.validTo)}</td>
    <td>${escapeHtml(statusLabels[item.status] ?? item.status)}</td>
    <td>${escapeHtml(item.reference || "—")}</td>
    <td class="num">${escapeHtml(money(item.price, currency))}</td>
  </tr>${item.lastError ? `<tr class="error"><td colspan="6">${escapeHtml(item.lastError)}</td></tr>` : ""}`).join("");
  return `<!doctype html>
<html lang="cs">
<head>
  <meta charset="utf-8" />
  <title>Souhrn ${escapeHtml(order.plate)} · ${escapeHtml(order.order_number || order.id)}</title>
  <style>
    :root { font-family: "DM Sans", Arial, sans-serif; color: #1c1c1c; }
    body { margin: 28px; }
    h1 { font-size: 26px; margin: 0 0 4px; }
    .meta { color: #667068; margin: 0 0 22px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { text-align: left; padding: 8px 7px; border-bottom: 1px solid #e4ece5; vertical-align: top; }
    th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #667068; }
    .num { text-align: right; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin: 18px 0 24px; font-size: 13px; }
    .grid small { display: block; color: #667068; font-size: 11px; }
    .totals { margin-top: 18px; text-align: right; }
    .error td { color: #b43d39; background: #fff6f5; }
    .print { margin: 18px 0 0; }
    @media print { .print { display: none; } body { margin: 12mm; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(order.plate)}</h1>
  <p class="meta">${escapeHtml(order.registration_country)} · ${escapeHtml(order.order_number || order.id)} · ${escapeHtml(statusLabels[uiStatus] ?? uiStatus)}</p>
  <div class="grid">
    <div><small>E-mail</small><strong>${escapeHtml(order.email)}</strong></div>
    <div><small>Vytvořeno</small><strong>${escapeHtml(formatDate(order.created_at))}</strong></div>
    <div><small>Zaplaceno</small><strong>${escapeHtml(formatDate(order.paid_at))}</strong></div>
    <div><small>Typ vozidla</small><strong>${escapeHtml(vehicleLabel(order.vehicle_type))}</strong></div>
    <div><small>Palivo</small><strong>${escapeHtml(fuelLabel(order.fuel_type))}</strong></div>
    ${order.vehicle_vin ? `<div><small>VIN</small><strong>${escapeHtml(order.vehicle_vin)}</strong></div>` : ""}
    ${order.flex_enabled ? "<div><small>Plus</small><strong>ano</strong></div>" : ""}
  </div>
  <table>
    <thead><tr><th>Země</th><th>Položka</th><th>Platnost</th><th>Stav</th><th>Reference</th><th class="num">Cena</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="6">Bez položek</td></tr>`}</tbody>
  </table>
  <p class="totals"><strong>Celkem ${escapeHtml(money(order.amount_total_minor / 100, currency))}</strong><br /><span>servis ${escapeHtml(money(order.processing_fee_minor / 100, currency))}</span></p>
  <p class="print"><button type="button" onclick="window.print()">Tisk / uložit jako PDF</button></p>
  <script>window.addEventListener("load", () => { window.focus(); window.print(); });</script>
</body>
</html>`;
}

async function sendBundle(orderId: string, res: import("node:http").ServerResponse) {
  const loaded = await loadOrderBundle(orderId);
  if (!loaded) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Objednávka nebyla nalezena" }));
    return;
  }
  const { url, key, order, items, official } = loaded;
  const zip = new JSZip();
  const root = safeFilename(`${order.plate}-${order.order_number || order.id.slice(0, 8)}`);
  zip.file(`${root}/souhrn.html`, summaryHtml(order, mappedItems(order, items)));
  if (order.invoice_pdf_path) {
    const bytes = await fetchStorage(url, key, "invoices", order.invoice_pdf_path);
    if (bytes) zip.file(`${root}/doklady/${safeFilename(`faktura-EGP-${order.order_number || order.id}.pdf`)}`, bytes);
  }
  for (const document of official) {
    const bytes = await fetchStorage(url, key, document.storage_bucket, document.storage_path);
    if (!bytes) continue;
    const country = document.country_code ? `${document.country_code}-` : "";
    zip.file(`${root}/doklady/${safeFilename(`${country}${document.filename}`)}`, bytes);
  }
  for (const item of items) {
    const meta = item.fulfillment_screenshots_meta;
    if (!meta?.storagePrefix || !Array.isArray(meta.steps)) continue;
    const country = safeFilename(item.country_code || meta.country || "xx");
    for (const step of meta.steps.filter(entry => typeof entry.file === "string" && entry.file.toLowerCase().endsWith(".png"))) {
      const objectPath = `${meta.storagePrefix.replace(/\/$/, "")}/${step.file}`;
      const bytes = await fetchStorage(url, key, meta.bucket, objectPath);
      if (!bytes) continue;
      const name = `${String(step.index).padStart(2, "0")}-${safeFilename(step.name || step.file)}.png`;
      zip.file(`${root}/screenshoty/${country}/${name}`, bytes);
    }
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const filename = `${root}.zip`;
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/[^\x20-\x7E]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
}

async function sendSummary(orderId: string, res: import("node:http").ServerResponse) {
  const loaded = await loadOrderBundle(orderId);
  if (!loaded) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Objednávka nebyla nalezena" }));
    return;
  }
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "private, no-store");
  res.end(summaryHtml(loaded.order, mappedItems(loaded.order, loaded.items)));
}

export function orderExportApi() {
  return {
    name: "eurogopass-order-export-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/orders/bundle", async (req, res) => {
        try {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const orderId = requestOrderId(req);
          if (!orderId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Chybí orderId" }));
            return;
          }
          await sendBundle(orderId, res);
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Balíček se nepodařilo připravit" }));
          }
        }
      });
      server.middlewares.use("/api/orders/summary", async (req, res) => {
        try {
          if (req.method !== "GET") {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: "Method not allowed" }));
            return;
          }
          const orderId = requestOrderId(req);
          if (!orderId) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: "Chybí orderId" }));
            return;
          }
          await sendSummary(orderId, res);
        } catch (error) {
          if (!res.headersSent) {
            res.statusCode = 502;
            res.setHeader("Content-Type", "application/json; charset=utf-8");
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Souhrn se nepodařilo připravit" }));
          }
        }
      });
    },
  };
}
