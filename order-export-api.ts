import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import JSZip from "jszip";
import { passageDisplay } from "./src/passageCatalog";
import { loadServerConfig } from "./server-config";

const require = createRequire(import.meta.url);
const pdfkitModule = require("pdfkit") as typeof import("pdfkit") & { default?: typeof import("pdfkit") };
const PDFDocument = pdfkitModule.default ?? pdfkitModule;
const fontRoot = dirname(require.resolve("dejavu-fonts-ttf/package.json"));
const FONT_MONO = join(fontRoot, "ttf", "DejaVuSansMono.ttf");
const FONT_MONO_BOLD = join(fontRoot, "ttf", "DejaVuSansMono-Bold.ttf");

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
  plate_country_conflict?: boolean | null;
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
  created_at?: string;
  fulfilled_at?: string;
  failed_at?: string;
  last_error?: string;
  engine_submitted_at?: string;
  state_reference?: string;
  pdf_storage_path?: string;
  plate_country_conflict?: boolean | null;
  fulfillment_screenshots_meta?: {
    bucket: string;
    storagePrefix: string;
    country: string;
    plate?: string;
    success?: boolean;
    uploadedAt?: string;
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

type ItemNote = {
  item_id: string;
  item_source?: string;
  country_code?: string;
  actor_email?: string;
  body: string;
  created_at: string;
};

type ConflictAck = {
  actor_email?: string;
  previous_value?: boolean | null;
  created_at: string;
};

type ManualAudit = {
  item_id: string;
  item_source?: string;
  country_code?: string;
  actor_email?: string;
  previous_status?: string;
  note?: string;
  created_at: string;
};

type OrderBundle = {
  url: string;
  key: string;
  order: RawOrder;
  items: RawItem[];
  official: OfficialDocument[];
  notes: ItemNote[];
  acks: ConflictAck[];
  audits: ManualAudit[];
};

function loadWorkerEnv() {
  const config = loadServerConfig();
  return { url: config.supabaseUrl, key: config.supabaseServiceKey };
}

function supabaseHeaders(key: string) {
  return { apikey: key, Authorization: `Bearer ${key}` };
}

function formatPrague(value?: string, dateOnly = false) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("cs-CZ", dateOnly
    ? { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric" }
    : { timeZone: "Europe/Prague", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }
  ).format(new Date(value));
}

function formatIso(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatWhen(value?: string) {
  if (!value) return "—";
  return `${formatIso(value)}   |   ${formatPrague(value)}`;
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

function safeFilename(value: string) {
  const cleaned = value.normalize("NFKD").replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 120) || "soubor";
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

function vehicleLabelEn(value?: string) {
  return ({ passenger: "Passenger car", "van-large": "Van", motorcycle: "Motorcycle" } as Record<string, string>)[value ?? ""] ?? value ?? "Not provided";
}

function fuelLabelEn(value?: string) {
  return ({ standard: "Petrol / diesel", "electric-hydrogen": "Electric / hydrogen", "plugin-hybrid": "Plug-in hybrid", biomethane: "Biomethane", "natural-gas": "Natural gas" } as Record<string, string>)[value ?? ""] ?? value ?? "Not provided";
}

const PASSAGE_EN: Record<string, string> = {
  "at-a9-bosruck": "Bosruck Tunnel (A9)",
  "at-a9-gleinalm": "Gleinalm Tunnel (A9)",
  "at-a10-tauern": "Tauern Tunnel and Katschberg Tunnel (A10)",
  "at-a11-karawanken": "Karawanken Tunnel (A11)",
  "at-a11-karawanken-south": "Karawanken Tunnel (A11) · towards Slovenia",
  "at-a13-brenner": "Brenner Motorway (A13)",
  "at-s16-arlberg": "Arlberg Road Tunnel (S16)",
  "ro-fetesti-cernavoda": "Fetești–Cernavodă Bridges (A2)",
  "ro-fetesti-peaj": "Fetești–Cernavodă Bridges (A2)",
  "ro-giurgiu-ruse": "Giurgiu–Ruse Danube Bridge",
  "ro-ruse-giurgiu-to-bg": "Giurgiu–Ruse Danube Bridge",
  "bg-ruse-giurgiu": "Ruse–Giurgiu Danube Bridge",
  "bg-ruse-giurgiu-to-ro": "Ruse–Giurgiu Danube Bridge",
  "ro-calafat-vidin": "Calafat–Vidin Danube Bridge",
  "ro-vidin-calafat-to-bg": "Calafat–Vidin Danube Bridge",
  "bg-vidin-calafat": "Vidin–Calafat Danube Bridge",
  "bg-vidin-calafat-to-ro": "Vidin–Calafat Danube Bridge",
};

function itemProductEn(item: RawItem) {
  if (item.source === "order_bridge_toll_items") {
    const key = (item.toll_id ?? "").trim().toLowerCase();
    const name = PASSAGE_EN[key] ?? passageDisplay(item.toll_id).name;
    const count = (item.pass_count ?? 1) > 1 ? ` · ${item.pass_count} passages` : "";
    return `${name}${count}`;
  }
  return item.validity ?? "Vignette";
}

function itemStartDate(item: RawItem) {
  return item.source === "order_bridge_toll_items" ? item.pass_date : item.start_date;
}

function requestOrderId(req: import("node:http").IncomingMessage) {
  const orderId = new URL(req.url ?? "/", "http://dashboard.local").searchParams.get("orderId")?.trim() ?? "";
  if (!orderId || orderId.length > 80) return "";
  return orderId;
}

function exportRoot(order: RawOrder) {
  return safeFilename(`${order.plate}-${order.order_number || order.id}`);
}

function scalar(value: string | number | boolean | null | undefined) {
  if (value === null) return "null";
  if (value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

async function fetchJson<T>(url: string, key: string, path: string) {
  const response = await fetch(`${url}/rest/v1/${path}`, { headers: supabaseHeaders(key) });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  return response.json() as Promise<T>;
}

async function fetchOptional<T>(url: string, key: string, path: string, fallback: T) {
  try {
    const response = await fetch(`${url}/rest/v1/${path}`, { headers: supabaseHeaders(key) });
    if (!response.ok) return fallback;
    return await response.json() as T;
  } catch {
    return fallback;
  }
}

async function fetchStorage(url: string, key: string, bucket: string, objectPath: string) {
  const encoded = objectPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  const upstream = await fetch(`${url}/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${encoded}`, { headers: supabaseHeaders(key) });
  if (!upstream.ok) return null;
  return Buffer.from(await upstream.arrayBuffer());
}

async function loadOrderBundle(orderId: string): Promise<OrderBundle | null> {
  const { url, key } = loadWorkerEnv();
  if (!url || !key) throw new Error("Supabase konfigurace nebyla nalezena");
  const orders = await fetchJson<RawOrder[]>(url, key, `orders?select=id,status,currency,amount_total_minor,processing_fee_minor,email,locale,registration_country,plate,created_at,paid_at,fulfilled_at,flex_enabled,order_number,fulfillment_status,vehicle_type,fuel_type,vehicle_vin,invoice_pdf_path,last_error,plate_country_conflict&id=eq.${encodeURIComponent(orderId)}&limit=1`);
  const order = orders[0];
  if (!order) return null;
  const vignetteSelect = "id,order_id,country_code,validity,start_date,end_date,price_eur_minor,status,created_at,fulfilled_at,failed_at,last_error,engine_submitted_at,state_reference,pdf_storage_path,plate_country_conflict,fulfillment_screenshots_meta";
  const tollSelect = "id,order_id,toll_id,country_code,pass_count,pass_date,price_eur_minor,status,created_at,fulfilled_at,failed_at,last_error,engine_submitted_at,state_reference,pdf_storage_path,plate_country_conflict,fulfillment_screenshots_meta";
  const encodedId = encodeURIComponent(orderId);
  const [vignettes, tolls, official, notes, acks, audits] = await Promise.all([
    fetchJson<RawItem[]>(url, key, `order_items?select=${vignetteSelect}&order_id=eq.${encodedId}&order=created_at.asc`),
    fetchJson<RawItem[]>(url, key, `order_bridge_toll_items?select=${tollSelect}&order_id=eq.${encodedId}&order=created_at.asc`),
    fetchJson<OfficialDocument[]>(url, key, `order_documents?select=id,filename,content_type,storage_bucket,storage_path,country_code,document_type&order_id=eq.${encodedId}&order=created_at.asc`),
    fetchOptional<ItemNote[]>(url, key, `dashboard_order_item_notes?select=item_id,item_source,country_code,actor_email,body,created_at&order_id=eq.${encodedId}&order=created_at.desc`, []),
    fetchOptional<ConflictAck[]>(url, key, `dashboard_plate_country_conflict_acks?select=actor_email,previous_value,created_at&order_id=eq.${encodedId}&order=created_at.desc`, []),
    fetchOptional<ManualAudit[]>(url, key, `manual_fulfillment_audit?select=item_id,item_source,country_code,actor_email,previous_status,note,created_at&order_id=eq.${encodedId}&order=created_at.desc`, []),
  ]);
  return {
    url,
    key,
    order,
    items: [
      ...vignettes.map(item => ({ ...item, source: "order_items" as const })),
      ...tolls.map(item => ({ ...item, source: "order_bridge_toll_items" as const })),
    ],
    official,
    notes,
    acks,
    audits,
  };
}

function itemProduct(item: RawItem) {
  if (item.source === "order_bridge_toll_items") {
    const passage = passageDisplay(item.toll_id);
    const count = (item.pass_count ?? 1) > 1 ? ` · ${item.pass_count} průjezdy` : "";
    return passage ? `${passage.name}${count}` : (item.toll_id ?? "Most / tunel");
  }
  return item.validity ?? "Dálniční známka";
}

function attachmentFilename(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

class TechSheet {
  private readonly doc: PDFKit.PDFDocument;
  private readonly left: number;
  private readonly width: number;
  private readonly labelWidth = 168;

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
    this.left = doc.page.margins.left;
    this.width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  }

  private ensure(height: number) {
    const bottom = this.doc.page.height - this.doc.page.margins.bottom - 18;
    if (this.doc.y + height > bottom) this.doc.addPage();
  }

  title(order: RawOrder) {
    this.banner(
      "EGP DASHBOARD  ·  INTERNÍ TECHNICKÝ LIST",
      "Není určeno zákazníkovi. Časy: ISO UTC | Europe/Prague.",
      order.plate || "—",
      order.order_number || "bez order_number",
    );
  }

  customerTitle(order: RawOrder) {
    this.banner(
      "EUROGOPASS  ·  FULFILLMENT CONFIRMATION",
      "Customer copy. Times: ISO UTC | Europe/Prague.",
      order.plate || "—",
      order.order_number || "bez order_number",
    );
  }

  private banner(kicker: string, note: string, heading: string, subtitle: string) {
    this.doc.font("MonoBold").fontSize(8).fillColor("#111111").text(kicker, this.left, this.doc.y, { width: this.width });
    this.doc.font("Mono").fontSize(8).fillColor("#555555").text(note, { width: this.width });
    this.doc.moveDown(0.6);
    this.doc.font("MonoBold").fontSize(14).fillColor("#111111").text(heading, { width: this.width });
    this.doc.font("Mono").fontSize(9).fillColor("#111111").text(subtitle, { width: this.width });
    this.doc.moveDown(0.4);
    this.rule();
  }

  heading(text: string) {
    this.ensure(22);
    this.doc.moveDown(0.25);
    this.doc.font("MonoBold").fontSize(8.5).fillColor("#111111").text(text.toUpperCase(), this.left, this.doc.y, { width: this.width });
    this.doc.moveDown(0.2);
  }

  rule() {
    this.ensure(10);
    const y = this.doc.y + 2;
    this.doc.save().moveTo(this.left, y).lineTo(this.left + this.width, y).lineWidth(0.7).strokeColor("#222222").stroke().restore();
    this.doc.y = y + 8;
  }

  kv(label: string, value: string | number | boolean | null | undefined) {
    const text = scalar(value);
    this.doc.font("Mono").fontSize(8);
    const valueX = this.left + this.labelWidth + 10;
    const valueWidth = this.width - this.labelWidth - 10;
    const height = Math.max(11, this.doc.heightOfString(text, { width: valueWidth }));
    this.ensure(height + 3);
    const y = this.doc.y;
    this.doc.fillColor("#666666").text(label, this.left, y, { width: this.labelWidth, lineBreak: false });
    this.doc.fillColor("#111111").text(text, valueX, y, { width: valueWidth });
    this.doc.y = y + height + 1.5;
  }

  note(text: string) {
    this.doc.font("Mono").fontSize(8);
    const height = this.doc.heightOfString(text, { width: this.width });
    this.ensure(height + 4);
    this.doc.fillColor("#111111").text(text, this.left, this.doc.y, { width: this.width });
    this.doc.moveDown(0.15);
  }
}

function renderTechnicalPdf(bundle: OrderBundle) {
  const { order, items, official, notes, acks, audits } = bundle;
  const mapped = items.map(item => ({ item, ui: itemStatus(item, order.flex_enabled) }));
  const uiStatus = orderUiStatus(order.status.toLowerCase().replace(/[\s-]+/g, "_"), order.fulfillment_status, mapped.map(entry => ({ status: entry.ui })));
  const currency = order.currency || "EUR";
  const generatedAt = new Date().toISOString();

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Technický list ${order.order_number || order.id}`,
        Author: "EuroGoPass Dashboard",
        Subject: order.id,
        Creator: "EGP Dashboard",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Mono", FONT_MONO);
    doc.registerFont("MonoBold", FONT_MONO_BOLD);

    const sheet = new TechSheet(doc);
    sheet.title(order);

    sheet.heading("Identita");
    sheet.kv("order_id", order.id);
    sheet.kv("order_number", order.order_number);
    sheet.kv("plate", order.plate);
    sheet.kv("registration_country", order.registration_country);
    sheet.kv("locale", order.locale);
    sheet.kv("email", order.email);

    sheet.heading("Stavy");
    sheet.kv("orders.status", order.status);
    sheet.kv("dashboard.status", `${uiStatus} (${statusLabels[uiStatus] ?? uiStatus})`);
    sheet.kv("fulfillment_status", order.fulfillment_status);
    sheet.kv("plate_country_conflict", order.plate_country_conflict);
    sheet.kv("flex_enabled", order.flex_enabled);
    sheet.kv("last_error", order.last_error);

    sheet.heading("Časy");
    sheet.kv("generated_at", `${generatedAt}   |   ${formatPrague(generatedAt)}`);
    sheet.kv("created_at", formatWhen(order.created_at));
    sheet.kv("paid_at", formatWhen(order.paid_at));
    sheet.kv("fulfilled_at", formatWhen(order.fulfilled_at));

    sheet.heading("Částky");
    sheet.kv("currency", currency);
    sheet.kv("amount_total_minor", `${order.amount_total_minor}  (${money(order.amount_total_minor / 100, currency)})`);
    sheet.kv("processing_fee_minor", `${order.processing_fee_minor}  (${money(order.processing_fee_minor / 100, currency)})`);

    sheet.heading("Vozidlo");
    sheet.kv("vehicle_type", `${order.vehicle_type ?? "—"}  (${vehicleLabel(order.vehicle_type)})`);
    sheet.kv("fuel_type", `${order.fuel_type ?? "—"}  (${fuelLabel(order.fuel_type)})`);
    sheet.kv("vehicle_vin", order.vehicle_vin);

    sheet.heading("Faktura");
    sheet.kv("invoice_pdf_path", order.invoice_pdf_path);
    sheet.kv("invoice_present", Boolean(order.invoice_pdf_path));

    sheet.heading(`Položky (${items.length})`);
    if (!items.length) sheet.note("Bez položek.");
    mapped.forEach(({ item, ui }, index) => {
      const screenshots = item.fulfillment_screenshots_meta;
      sheet.rule();
      sheet.kv(`#${index + 1} source`, item.source ?? "—");
      sheet.kv("item_id", item.id);
      sheet.kv("country_code", item.country_code);
      sheet.kv("product", itemProduct(item));
      if (item.source === "order_bridge_toll_items") {
        sheet.kv("toll_id", item.toll_id);
        sheet.kv("pass_count", item.pass_count);
        sheet.kv("pass_date", formatWhen(item.pass_date));
      } else {
        sheet.kv("validity", item.validity);
        sheet.kv("start_date", formatWhen(item.start_date));
        sheet.kv("end_date", formatWhen(item.end_date));
      }
      sheet.kv("price_eur_minor", `${item.price_eur_minor}  (${money(item.price_eur_minor / 100, currency)})`);
      sheet.kv("raw.status", item.status);
      sheet.kv("dashboard.status", `${ui} (${statusLabels[ui] ?? ui})`);
      sheet.kv("plate_country_conflict", item.plate_country_conflict);
      sheet.kv("created_at", formatWhen(item.created_at));
      sheet.kv("engine_submitted_at", formatWhen(item.engine_submitted_at));
      sheet.kv("fulfilled_at", formatWhen(item.fulfilled_at));
      sheet.kv("failed_at", formatWhen(item.failed_at));
      sheet.kv("state_reference", item.state_reference);
      sheet.kv("pdf_storage_path", item.pdf_storage_path);
      sheet.kv("last_error", item.last_error);
      sheet.kv("screenshots.bucket", screenshots?.bucket);
      sheet.kv("screenshots.prefix", screenshots?.storagePrefix);
      sheet.kv("screenshots.success", screenshots?.success);
      sheet.kv("screenshots.uploaded_at", formatWhen(screenshots?.uploadedAt));
      sheet.kv("screenshots.steps", screenshots?.steps?.length ?? 0);
      for (const step of screenshots?.steps ?? []) {
        sheet.kv(`  step ${String(step.index).padStart(2, "0")}`, `${step.file}  ·  ${step.name}`);
      }
    });

    sheet.heading(`Oficiální doklady (${official.length})`);
    if (!official.length) sheet.note("Žádné oficiální doklady.");
    official.forEach((document, index) => {
      sheet.rule();
      sheet.kv(`#${index + 1} id`, document.id);
      sheet.kv("filename", document.filename);
      sheet.kv("document_type", document.document_type);
      sheet.kv("content_type", document.content_type);
      sheet.kv("country_code", document.country_code);
      sheet.kv("storage_bucket", document.storage_bucket);
      sheet.kv("storage_path", document.storage_path);
    });

    sheet.heading(`Operátorské poznámky (${notes.length})`);
    if (!notes.length) sheet.note("Žádné poznámky.");
    for (const note of notes) {
      sheet.rule();
      sheet.kv("item_id", note.item_id);
      sheet.kv("item_source", note.item_source);
      sheet.kv("country_code", note.country_code);
      sheet.kv("actor_email", note.actor_email);
      sheet.kv("created_at", formatWhen(note.created_at));
      sheet.kv("body", note.body);
    }

    sheet.heading(`Ruční FULFILLED (${audits.length})`);
    if (!audits.length) sheet.note("Žádný ruční fulfillment.");
    for (const audit of audits) {
      sheet.rule();
      sheet.kv("item_id", audit.item_id);
      sheet.kv("item_source", audit.item_source);
      sheet.kv("country_code", audit.country_code);
      sheet.kv("actor_email", audit.actor_email);
      sheet.kv("previous_status", audit.previous_status);
      sheet.kv("created_at", formatWhen(audit.created_at));
      sheet.kv("note", audit.note);
    }

    sheet.heading(`ACK konfliktu SPZ (${acks.length})`);
    if (!acks.length) sheet.note("Žádný ACK záznam.");
    for (const ack of acks) {
      sheet.rule();
      sheet.kv("actor_email", ack.actor_email);
      sheet.kv("previous_value", ack.previous_value);
      sheet.kv("created_at", formatWhen(ack.created_at));
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - 28;
      doc.font("Mono").fontSize(7).fillColor("#666666")
        .text(`${order.id}   ·   ${i + 1}/${range.count}`, 36, footerY, { width: doc.page.width - 72, align: "left" });
    }
    doc.flushPages();
    doc.end();
  });
}

function renderCustomerPdf(bundle: OrderBundle) {
  const { order, items } = bundle;
  const generatedAt = new Date().toISOString();

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 36,
      bufferPages: true,
      info: {
        Title: `Fulfillment confirmation ${order.order_number || order.id}`,
        Author: "EuroGoPass Dashboard",
        Subject: order.id,
        Creator: "EGP Dashboard",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.registerFont("Mono", FONT_MONO);
    doc.registerFont("MonoBold", FONT_MONO_BOLD);

    const sheet = new TechSheet(doc);
    sheet.customerTitle(order);

    sheet.heading("Identity");
    sheet.kv("order_id", order.id);
    sheet.kv("order_number", order.order_number);
    sheet.kv("plate", order.plate);
    sheet.kv("registration_country", order.registration_country);

    sheet.heading("Times");
    sheet.kv("generated_at", formatWhen(generatedAt));
    sheet.kv("created_at", formatWhen(order.created_at));
    sheet.kv("fulfilled_at", formatWhen(order.fulfilled_at));

    sheet.heading("Vehicle");
    sheet.kv("vehicle_type", `${order.vehicle_type ?? "—"}  (${vehicleLabelEn(order.vehicle_type)})`);
    sheet.kv("fuel_type", `${order.fuel_type ?? "—"}  (${fuelLabelEn(order.fuel_type)})`);
    sheet.kv("vehicle_vin", order.vehicle_vin);

    sheet.heading(`Items (${items.length})`);
    if (!items.length) sheet.note("No items.");
    items.forEach((item, index) => {
      sheet.rule();
      sheet.kv(`#${index + 1} source`, item.source ?? "—");
      sheet.kv("item_id", item.id);
      sheet.kv("country_code", item.country_code);
      sheet.kv("product", itemProductEn(item));
      sheet.kv("start_date", formatWhen(itemStartDate(item)));
      sheet.kv("created_at", formatWhen(item.created_at));
      sheet.kv("fulfilled_at", formatWhen(item.fulfilled_at));
    });

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(range.start + i);
      const footerY = doc.page.height - 28;
      doc.font("Mono").fontSize(7).fillColor("#666666")
        .text(`${order.id}   ·   ${i + 1}/${range.count}`, 36, footerY, { width: doc.page.width - 72, align: "left" });
    }
    doc.flushPages();
    doc.end();
  });
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
  const root = exportRoot(order);
  zip.file(`${root}/souhrn.pdf`, await renderTechnicalPdf(loaded));
  zip.file(`${root}/fulfillment-en.pdf`, await renderCustomerPdf(loaded));
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
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", attachmentFilename(`${root}.zip`));
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
  const buffer = await renderTechnicalPdf(loaded);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", attachmentFilename(`${exportRoot(loaded.order)}.pdf`));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
}

async function sendCustomerSummary(orderId: string, res: import("node:http").ServerResponse) {
  const loaded = await loadOrderBundle(orderId);
  if (!loaded) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "Objednávka nebyla nalezena" }));
    return;
  }
  const buffer = await renderCustomerPdf(loaded);
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", attachmentFilename(`${exportRoot(loaded.order)}-EN.pdf`));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(buffer);
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
      server.middlewares.use("/api/orders/customer-summary", async (req, res) => {
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
          await sendCustomerSummary(orderId, res);
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
