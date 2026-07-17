import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { simpleParser, type Attachment } from "mailparser";
import { config as loadDotenv } from "dotenv";
import { PDFParse } from "pdf-parse";
import { loadServerEnvironment } from "./server-config";

loadDotenv({ path: process.env.GMAIL_ENV_PATH || "secrets/gmail.env", quiet: true });

type Config = {
  supabaseUrl: string;
  supabaseKey: string;
  gmailClientId: string;
  gmailClientSecret: string;
  gmailRefreshToken: string;
  gmailUserId: string;
  intervalMs: number;
  lookbackDays: number;
  reviewRetryMs: number;
  maxMessagesPerCycle: number;
  orderWaitMs: number;
  senderCountries: Record<string, string>;
  backfillAll: boolean;
};

type GmailList = { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string };
type GmailMessage = { id: string; threadId: string; raw: string; internalDate?: string };
type RecentOrder = { id: string; order_number?: string; plate: string; created_at: string; paid_at?: string; itemCountries: Set<string> };
type OrderTrigger = { orderIds: Set<string>; countries: Set<string>; searchAfter: Date };

function requireValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function loadConfig(): Config {
  const env = loadServerEnvironment("production");
  let senderCountries: Record<string, string>;
  try {
    const file = env.MAIL_SENDER_COUNTRY_MAP_FILE || "config/mail-senders.json";
    const fromFile = JSON.parse(readFileSync(file, "utf8")) as Record<string, string>;
    const fromEnv = JSON.parse(env.MAIL_SENDER_COUNTRY_MAP || "{}") as Record<string, string>;
    senderCountries = { ...fromFile, ...fromEnv };
  } catch {
    throw new Error("Mail sender map must be a valid JSON object");
  }
  return {
    supabaseUrl: requireValue(env.SUPABASE_URL, "SUPABASE_URL").replace(/\/$/, ""),
    supabaseKey: requireValue(env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY"),
    gmailClientId: requireValue(env.GMAIL_CLIENT_ID, "GMAIL_CLIENT_ID"),
    gmailClientSecret: requireValue(env.GMAIL_CLIENT_SECRET, "GMAIL_CLIENT_SECRET"),
    gmailRefreshToken: requireValue(env.GMAIL_REFRESH_TOKEN, "GMAIL_REFRESH_TOKEN"),
    gmailUserId: env.GMAIL_USER_ID || "me",
    intervalMs: Math.max(15_000, Number(env.MAIL_INGEST_INTERVAL_MS || 60_000)),
    lookbackDays: Math.max(1, Number(env.MAIL_INGEST_LOOKBACK_DAYS || 30)),
    reviewRetryMs: Math.max(60_000, Number(env.MAIL_REVIEW_RETRY_MS || 6 * 60 * 60_000)),
    maxMessagesPerCycle: Math.max(1, Number(env.MAIL_INGEST_MAX_MESSAGES_PER_CYCLE || 40)),
    orderWaitMs: Math.max(15 * 60_000, Number(env.MAIL_ORDER_WAIT_MS || 6 * 60 * 60_000)),
    senderCountries: Object.fromEntries(Object.entries(senderCountries).map(([key, value]) => [key.toLowerCase(), value.toUpperCase()])),
    backfillAll: process.argv.includes("--all"),
  };
}

function base64UrlDecode(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function normalizePlate(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizedSearchText(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function senderCountry(address: string, mapping: Record<string, string>) {
  const normalized = address.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  return mapping[normalized] ?? mapping[domain];
}

function safeFilename(value: string) {
  return value.normalize("NFKD").replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 160) || "document";
}

function sha256(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}

async function gmailFetch(url: string, token: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status !== 429 && response.status < 500) return response;
    const retryAfter = Number(response.headers.get("retry-after"));
    const payload = await response.clone().json().catch(() => undefined) as { error?: { message?: string } } | undefined;
    const retryAt = payload?.error?.message?.match(/Retry after ([0-9T:.+-]+Z?)/i)?.[1];
    const retryAtMs = retryAt ? Date.parse(retryAt) - Date.now() : Number.NaN;
    const delayMs = Number.isFinite(retryAtMs) && retryAtMs > 0
      ? Math.min(retryAtMs + 1_000, 60 * 60_000)
      : Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 2 ** attempt * 1000;
    console.warn("Gmail API throttled", { status: response.status, retryInMs: delayMs, attempt: attempt + 1 });
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function supabaseHeaders(config: Config, json = true) {
  return {
    apikey: config.supabaseKey,
    Authorization: `Bearer ${config.supabaseKey}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function gmailAccessToken(config: Config) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.gmailClientId,
      client_secret: config.gmailClientSecret,
      refresh_token: config.gmailRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Gmail OAuth ${response.status}`);
  const payload = await response.json() as { access_token?: string };
  return requireValue(payload.access_token, "Gmail access token");
}

async function gmailMessages(config: Config, token: string, trigger?: OrderTrigger) {
  const output: Array<{ id: string; threadId: string }> = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ maxResults: "500" });
    if (!config.backfillAll) {
      // Do not scan the entire mailbox every minute. Restrict the Gmail-side
      // search to senders that can actually produce fulfillment documents.
      const senders = Object.entries(config.senderCountries)
        .filter(([, country]) => !trigger || trigger.countries.has(country))
        .map(([sender]) => sender);
      const senderQuery = senders.length ? ` from:(${senders.join(" OR ")})` : "";
      const timeQuery = trigger
        ? `after:${Math.floor(trigger.searchAfter.getTime() / 1000)}`
        : `newer_than:${config.lookbackDays}d`;
      query.set("q", `${timeQuery}${senderQuery}`);
    }
    if (pageToken) query.set("pageToken", pageToken);
    const response = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(config.gmailUserId)}/messages?${query}`, token);
    if (!response.ok) throw new Error(`Gmail list ${response.status}`);
    const payload = await response.json() as GmailList;
    output.push(...(payload.messages ?? []));
    pageToken = payload.nextPageToken;
  } while (pageToken);
  return output;
}

async function processedIds(config: Config, ids: string[]) {
  if (!ids.length) return new Set<string>();
  const rows: Array<{ gmail_message_id: string; status: string; processed_at: string }> = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const chunk = ids.slice(offset, offset + 200);
    const encoded = encodeURIComponent(`(${chunk.map(id => `"${id.replace(/"/g, "")}"`).join(",")})`);
    const response = await fetch(`${config.supabaseUrl}/rest/v1/email_ingest_messages?select=gmail_message_id,status,processed_at&gmail_message_id=in.${encoded}`, { headers: supabaseHeaders(config) });
    if (!response.ok) throw new Error(`Ingest state ${response.status}`);
    rows.push(...await response.json() as Array<{ gmail_message_id: string; status: string; processed_at: string }>);
  }
  const retryBefore = Date.now() - config.reviewRetryMs;
  return new Set(rows
    .filter(row => ["matched", "ignored"].includes(row.status) || Date.parse(row.processed_at) > retryBefore)
    .map(row => row.gmail_message_id));
}

async function getRawMessage(config: Config, token: string, id: string) {
  const response = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/${encodeURIComponent(config.gmailUserId)}/messages/${encodeURIComponent(id)}?format=raw`, token);
  if (!response.ok) throw new Error(`Gmail message ${response.status}`);
  return response.json() as Promise<GmailMessage>;
}

async function loadRecentOrders(config: Config, orderIds?: Set<string>): Promise<RecentOrder[]> {
  const since = new Date(Date.now() - config.lookbackDays * 86_400_000).toISOString();
  const headers = supabaseHeaders(config);
  const orders: Array<{ id: string; order_number?: string; plate: string; created_at: string; paid_at?: string }> = [];
  for (let offset = 0;; offset += 1000) {
    const dateFilter = orderIds?.size
      ? `&id=in.${encodeURIComponent(`(${[...orderIds].join(",")})`)}`
      : config.backfillAll ? "" : `&created_at=gte.${encodeURIComponent(since)}`;
    const ordersResponse = await fetch(`${config.supabaseUrl}/rest/v1/orders?select=id,order_number,plate,created_at,paid_at${dateFilter}&order=created_at.desc&limit=1000&offset=${offset}`, { headers });
    if (!ordersResponse.ok) throw new Error(`Orders lookup ${ordersResponse.status}`);
    const page = await ordersResponse.json() as typeof orders;
    orders.push(...page);
    if (page.length < 1000) break;
  }
  if (!orders.length) return [];
  const ids = encodeURIComponent(`(${orders.map(order => order.id).join(",")})`);
  const [itemsResponse, tollsResponse] = await Promise.all([
    fetch(`${config.supabaseUrl}/rest/v1/order_items?select=order_id,country_code&order_id=in.${ids}`, { headers }),
    fetch(`${config.supabaseUrl}/rest/v1/order_bridge_toll_items?select=order_id,country_code&order_id=in.${ids}`, { headers }),
  ]);
  if (!itemsResponse.ok || !tollsResponse.ok) throw new Error("Order item lookup failed");
  const rows = [
    ...await itemsResponse.json() as Array<{ order_id: string; country_code: string }>,
    ...await tollsResponse.json() as Array<{ order_id: string; country_code: string }>,
  ];
  return orders.map(order => ({
    ...order,
    itemCountries: new Set(rows.filter(row => row.order_id === order.id).map(row => row.country_code.toUpperCase())),
  }));
}

async function pendingOrderTrigger(config: Config): Promise<OrderTrigger | undefined> {
  if (config.backfillAll) return undefined;
  const headers = supabaseHeaders(config);
  const since = new Date(Date.now() - config.orderWaitMs).toISOString();
  const response = await fetch(`${config.supabaseUrl}/rest/v1/orders?select=id,paid_at&paid_at=gte.${encodeURIComponent(since)}&order=paid_at.desc&limit=200`, { headers });
  if (!response.ok) throw new Error(`Order trigger lookup ${response.status}`);
  const orders = await response.json() as Array<{ id: string; paid_at: string }>;
  if (!orders.length) return undefined;

  const ids = encodeURIComponent(`(${orders.map(order => order.id).join(",")})`);
  const [itemsResponse, tollsResponse, documentsResponse] = await Promise.all([
    fetch(`${config.supabaseUrl}/rest/v1/order_items?select=order_id,country_code&order_id=in.${ids}`, { headers }),
    fetch(`${config.supabaseUrl}/rest/v1/order_bridge_toll_items?select=order_id,country_code&order_id=in.${ids}`, { headers }),
    fetch(`${config.supabaseUrl}/rest/v1/order_documents?select=order_id,country_code&source=eq.email&document_type=eq.original_email&order_id=in.${ids}`, { headers }),
  ]);
  if (!itemsResponse.ok || !tollsResponse.ok || !documentsResponse.ok) throw new Error("Order trigger item lookup failed");
  const items = [
    ...await itemsResponse.json() as Array<{ order_id: string; country_code: string }>,
    ...await tollsResponse.json() as Array<{ order_id: string; country_code: string }>,
  ];
  const documents = await documentsResponse.json() as Array<{ order_id: string; country_code: string }>;
  const supportedCountries = new Set(Object.values(config.senderCountries));
  const pendingOrders = orders.filter(order => items.some(item =>
    item.order_id === order.id
    && supportedCountries.has(item.country_code.toUpperCase())
    && !documents.some(document => document.order_id === order.id && document.country_code === item.country_code.toUpperCase())
  ));
  if (!pendingOrders.length) return undefined;
  const orderIds = new Set(pendingOrders.map(order => order.id));
  const countries = new Set(items.filter(item => orderIds.has(item.order_id)).map(item => item.country_code.toUpperCase()).filter(country => supportedCountries.has(country)));
  const earliestPaidAt = Math.min(...pendingOrders.map(order => Date.parse(order.paid_at)));
  return { orderIds, countries, searchAfter: new Date(earliestPaidAt - 60 * 60_000) };
}

function matchOrder(orders: RecentOrder[], country: string, searchable: string, receivedAt: Date) {
  const exactOrderNumberMatches = orders.filter(order => {
    const orderNumber = normalizedSearchText(order.order_number ?? "");
    return order.itemCountries.has(country) && orderNumber.length >= 4 && searchable.includes(orderNumber);
  });
  if (exactOrderNumberMatches.length === 1) return { order: exactOrderNumberMatches[0], candidates: exactOrderNumberMatches };

  const candidates = orders.filter(order => {
    const plate = normalizePlate(order.plate);
    const orderNumber = normalizedSearchText(order.order_number ?? "");
    const plateMatches = plate.length >= 4 && searchable.includes(plate);
    const orderNumberMatches = orderNumber.length >= 4 && searchable.includes(orderNumber);
    if (!plateMatches && !orderNumberMatches) return false;
    if (!order.itemCountries.has(country)) return false;
    const orderTime = Date.parse(order.paid_at ?? order.created_at);
    const delta = receivedAt.getTime() - orderTime;
    return delta >= -60 * 60_000 && delta <= 7 * 86_400_000;
  }).sort((a, b) => Math.abs(receivedAt.getTime() - Date.parse(a.paid_at ?? a.created_at)) - Math.abs(receivedAt.getTime() - Date.parse(b.paid_at ?? b.created_at)));
  if (candidates.length > 1) {
    const distance = (order: RecentOrder) => Math.abs(receivedAt.getTime() - Date.parse(order.paid_at ?? order.created_at));
    const closest = distance(candidates[0]);
    const second = distance(candidates[1]);
    if (closest <= 24 * 60 * 60_000 && second - closest >= 30 * 60_000) {
      return { order: candidates[0], candidates };
    }
  }
  if (candidates.length !== 1) return { order: undefined, candidates };
  return { order: candidates[0], candidates };
}

async function uploadObject(config: Config, bucket: string, path: string, body: Buffer, contentType: string) {
  const objectPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(`${config.supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${objectPath}`, {
    method: "POST",
    headers: { ...supabaseHeaders(config, false), "Content-Type": contentType, "x-upsert": "false" },
    body: new Uint8Array(body),
  });
  if (!response.ok && response.status !== 409) throw new Error(`Storage upload ${response.status}`);
}

async function insertDocument(config: Config, row: Record<string, unknown>) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/order_documents`, {
    method: "POST",
    headers: { ...supabaseHeaders(config), Prefer: "resolution=ignore-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Document insert ${response.status}`);
}

async function saveIngestState(config: Config, row: Record<string, unknown>) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/email_ingest_messages?on_conflict=gmail_message_id`, {
    method: "POST",
    headers: { ...supabaseHeaders(config), Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
  if (!response.ok) throw new Error(`Ingest state save ${response.status}`);
}

function pdfAttachments(attachments: Attachment[]) {
  return attachments.filter(attachment => attachment.contentType === "application/pdf" || attachment.filename?.toLowerCase().endsWith(".pdf"));
}

async function pdfSearchText(attachments: Attachment[]) {
  const texts: string[] = [];
  for (const attachment of pdfAttachments(attachments)) {
    const parser = new PDFParse({ data: new Uint8Array(attachment.content) });
    try {
      const result = await parser.getText();
      if (result.text) texts.push(result.text);
    } catch {
      // Scanned or malformed PDFs remain eligible for matching from mail text.
    } finally {
      await parser.destroy().catch(() => undefined);
    }
  }
  return texts.join("\n");
}

async function processMessage(config: Config, token: string, info: { id: string; threadId: string }, orders: RecentOrder[]) {
  const gmail = await getRawMessage(config, token, info.id);
  const raw = base64UrlDecode(gmail.raw);
  const parsed = await simpleParser(raw);
  const address = parsed.from?.value[0]?.address ?? "";
  const country = senderCountry(address, config.senderCountries);
  const receivedAt = parsed.date ?? (gmail.internalDate ? new Date(Number(gmail.internalDate)) : new Date());
  const subject = parsed.subject ?? "";
  if (!country) {
    await saveIngestState(config, { gmail_message_id: gmail.id, gmail_thread_id: gmail.threadId, status: "ignored", sender: address, subject, received_at: receivedAt.toISOString(), reason: "sender_not_allowlisted" });
    return;
  }
  const pdfText = await pdfSearchText(parsed.attachments);
  const searchable = normalizedSearchText(`${subject}\n${parsed.text ?? ""}\n${parsed.html || ""}\n${pdfText}`);
  const matched = matchOrder(orders, country, searchable, receivedAt);
  const matchingPlates = matched.candidates.map(order => normalizePlate(order.plate));
  if (!matched.order) {
    await saveIngestState(config, { gmail_message_id: gmail.id, gmail_thread_id: gmail.threadId, status: "review", sender: address, subject, received_at: receivedAt.toISOString(), country_code: country, extracted_plate: matchingPlates.join(",") || null, reason: matched.candidates.length ? "multiple_order_matches" : "no_order_match" });
    return;
  }

  const date = receivedAt.toISOString().slice(0, 10);
  const prefix = `${date}/${matched.order.id}/${country}/${gmail.id}`;
  const files: Array<{ body: Buffer; filename: string; contentType: string; type: "official_receipt" | "original_email" }> = [
    { body: raw, filename: `${gmail.id}.eml`, contentType: "message/rfc822", type: "original_email" },
    ...pdfAttachments(parsed.attachments).map((attachment, index) => ({
      body: attachment.content,
      filename: safeFilename(attachment.filename || `document-${index + 1}.pdf`),
      contentType: attachment.contentType || "application/pdf",
      type: "official_receipt" as const,
    })),
  ];
  for (const file of files) {
    const hash = sha256(file.body);
    const path = `${prefix}/${hash.slice(0, 12)}-${safeFilename(file.filename)}`;
    await uploadObject(config, "official-documents", path, file.body, file.contentType);
    await insertDocument(config, {
      order_id: matched.order.id,
      country_code: country,
      document_type: file.type,
      source: "email",
      filename: file.filename,
      content_type: file.contentType,
      storage_bucket: "official-documents",
      storage_path: path,
      source_message_id: gmail.id,
      sender: address,
      subject,
      received_at: receivedAt.toISOString(),
      sha256: hash,
      match_method: "sender_country+exact_plate+time_window",
    });
  }
  await saveIngestState(config, { gmail_message_id: gmail.id, gmail_thread_id: gmail.threadId, status: "matched", sender: address, subject, received_at: receivedAt.toISOString(), country_code: country, extracted_plate: normalizePlate(matched.order.plate), matched_order_id: matched.order.id, reason: `stored_${files.length}_documents` });
}

async function runOnce(config: Config) {
  const trigger = await pendingOrderTrigger(config);
  if (!config.backfillAll && !trigger) {
    console.log("Gmail idle", { reason: "no_paid_order_waiting_for_email" });
    return;
  }
  const token = await gmailAccessToken(config);
  const messages = await gmailMessages(config, token, trigger);
  const done = await processedIds(config, messages.map(message => message.id));
  const allPending = messages.filter(message => !done.has(message.id));
  // Gmail lists newest messages first; prioritize fresh confirmations while a
  // larger historical backlog is drained over subsequent cycles.
  const pending = config.backfillAll ? allPending : allPending.slice(0, config.maxMessagesPerCycle);
  console.log("Gmail scan", { messages: messages.length, alreadyProcessed: done.size, pending: pending.length });
  if (!pending.length) return;
  const orders = await loadRecentOrders(config, trigger?.orderIds);
  for (const message of pending.reverse()) {
    try {
      await processMessage(config, token, message, orders);
    } catch (error) {
      console.error("mail ingest message failed", { id: message.id, error: error instanceof Error ? error.message : String(error) });
      await saveIngestState(config, { gmail_message_id: message.id, gmail_thread_id: message.threadId, status: "error", reason: error instanceof Error ? error.message : String(error) }).catch(() => undefined);
    }
  }
}

async function saveHeartbeat(status: "ok" | "error", error?: unknown) {
  const path = resolve(process.env.GMAIL_HEALTH_FILE || "runtime/gmail-health.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ checkedAt: new Date().toISOString(), status, error: error instanceof Error ? error.message : error ? String(error) : null }), { encoding: "utf8", mode: 0o600 });
}

async function main() {
  const config = loadConfig();
  const lockPath = resolve("runtime", "gmail-backfill.lock");
  let lock: number | undefined;
  if (config.backfillAll) {
    mkdirSync(dirname(lockPath), { recursive: true });
    try {
      lock = openSync(lockPath, "wx");
      writeFileSync(lock, String(process.pid));
    } catch {
      throw new Error(`Jiný historický Gmail import už běží (${lockPath})`);
    }
  }
  console.log("Gmail document ingestor started", { intervalMs: config.intervalMs, lookbackDays: config.lookbackDays, backfillAll: config.backfillAll, senderRules: Object.keys(config.senderCountries).length });
  try {
    for (;;) {
      try {
        await runOnce(config);
        await saveHeartbeat("ok");
        if (process.argv.includes("--once")) return;
      } catch (error) {
        console.error("mail ingest cycle failed", error instanceof Error ? error.message : String(error));
        await saveHeartbeat("error", error).catch(() => undefined);
        if (process.argv.includes("--once")) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, config.intervalMs));
    }
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      unlinkSync(lockPath);
    }
  }
}

void main();
