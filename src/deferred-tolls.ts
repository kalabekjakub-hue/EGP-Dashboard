export type DeferredFamily = "free_flow" | "epass24";

export type DeferredDashboardStatus = "waiting" | "processing" | "fulfilled" | "failed";

export type DeferredTollRow = {
  id: string;
  order_id: string;
  country_code?: string | null;
  product_code?: string | null;
  travel_date?: string | null;
  section_ids?: string[] | null;
  estimated_eur_minor?: number | null;
  actual_debt_eur_minor?: number | null;
  processing_fee_eur_minor?: number | null;
  charged_total_eur_minor?: number | null;
  status?: string | null;
  last_error?: string | null;
  created_at?: string | null;
  debt_checked_at?: string | null;
  debt_found_at?: string | null;
  charge_at?: string | null;
  fr_paid_at?: string | null;
  epass24_paid_at?: string | null;
};

export const DEFERRED_TOLL_COLUMNS = "id,order_id,country_code,product_code,travel_date,section_ids,estimated_eur_minor,actual_debt_eur_minor,processing_fee_eur_minor,charged_total_eur_minor,status,last_error,created_at,debt_checked_at,debt_found_at,charge_at";

export const DEFERRED_TOLL_COLUMNS_CORE = "id,order_id,country_code,product_code,travel_date,section_ids,estimated_eur_minor,actual_debt_eur_minor,status,last_error,created_at,debt_checked_at,debt_found_at,charge_at";

const FAILED_STATUSES = new Set(["charge_failed", "fr_pay_failed", "epass24_pay_failed", "debt_missing", "canceled"]);
const FULFILLED_STATUSES = new Set(["fulfilled", "debt_zero"]);
const PROCESSING_STATUSES = new Set(["debt_found", "debt_pending_retry", "charge_scheduled", "charging", "charged", "paying_fr", "paying_epass24"]);

export const ACCOUNT_WAITING_LABEL = "Čeká se na dluh";

const STATUS_LABELS: Record<string, string> = {
  awaiting_setup: ACCOUNT_WAITING_LABEL,
  card_saved: ACCOUNT_WAITING_LABEL,
  awaiting_debt: ACCOUNT_WAITING_LABEL,
  debt_found: ACCOUNT_WAITING_LABEL,
  debt_zero: "Bez dluhu",
  debt_pending_retry: ACCOUNT_WAITING_LABEL,
  debt_missing: "Dluh chybí",
  charge_scheduled: ACCOUNT_WAITING_LABEL,
  charging: ACCOUNT_WAITING_LABEL,
  charged: ACCOUNT_WAITING_LABEL,
  charge_failed: "Stržení selhalo",
  paying_fr: ACCOUNT_WAITING_LABEL,
  paying_epass24: ACCOUNT_WAITING_LABEL,
  fulfilled: "Hotovo",
  fr_pay_failed: "Francie selhala",
  epass24_pay_failed: "EPASS24 selhal",
  canceled: "Zrušeno",
};

export function minorToEuros(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return value / 100;
}

export type CardHalf = "waiting" | "processing" | "plus" | "failed" | "fulfilled" | "deferred";

export function cardHalves(items: Array<{ deferred: boolean; status: string }>): { classic: CardHalf | null; account: CardHalf | null } {
  const classic = items.filter(item => !item.deferred);
  const account = items.filter(item => item.deferred);
  return { classic: classicHalf(classic), account: accountHalf(account) };
}

function classicHalf(items: Array<{ status: string }>): CardHalf | null {
  if (!items.length) return null;
  if (items.some(item => item.status === "failed")) return "failed";
  if (items.some(item => item.status === "processing")) return "processing";
  if (items.some(item => item.status === "plus")) return "plus";
  if (items.some(item => item.status === "waiting")) return "waiting";
  if (items.every(item => item.status === "fulfilled")) return "fulfilled";
  return "waiting";
}

function accountHalf(items: Array<{ status: string }>): CardHalf | null {
  if (!items.length) return null;
  if (items.some(item => item.status === "failed")) return "failed";
  if (items.every(item => item.status === "fulfilled")) return "fulfilled";
  return "deferred";
}

export function deferredDashboardStatus(status?: string | null): DeferredDashboardStatus {
  const raw = (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (FULFILLED_STATUSES.has(raw)) return "fulfilled";
  if (FAILED_STATUSES.has(raw)) return "failed";
  if (PROCESSING_STATUSES.has(raw)) return "processing";
  return "waiting";
}

export function deferredStatusLabel(status?: string | null) {
  const raw = (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return STATUS_LABELS[raw] ?? (raw ? raw : ACCOUNT_WAITING_LABEL);
}

export function deferredProductName(family: DeferredFamily, country?: string | null) {
  const code = (country ?? "").trim().toUpperCase();
  if (family === "free_flow") return "Francie Free-Flow";
  if (code === "SE") return "Švédsko EPASS24";
  if (code === "NO") return "Norsko EPASS24";
  return "EPASS24";
}

export function deferredSignature(row: DeferredTollRow, family: DeferredFamily) {
  const country = (row.country_code ?? (family === "free_flow" ? "FR" : "")).toUpperCase();
  return [family, country, row.product_code ?? "", (row.travel_date ?? "").slice(0, 10)];
}

export function mapDeferredToll(row: DeferredTollRow, family: DeferredFamily) {
  const rawStatus = (row.status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  const status = deferredDashboardStatus(rawStatus);
  const country = (row.country_code || (family === "free_flow" ? "FR" : "")).toUpperCase();
  const estimate = minorToEuros(row.estimated_eur_minor);
  const accrued = minorToEuros(row.actual_debt_eur_minor);
  const fee = minorToEuros(row.processing_fee_eur_minor);
  const chargedTotal = minorToEuros(row.charged_total_eur_minor);
  const paidAt = row.fr_paid_at ?? row.epass24_paid_at ?? null;
  const failedAt = status === "failed" ? row.charge_at ?? row.debt_checked_at ?? row.created_at ?? null : null;
  return {
    id: row.id,
    orderId: row.order_id,
    source: family === "free_flow" ? "order_free_flow_items" as const : "order_epass24_items" as const,
    country,
    product: deferredProductName(family, country),
    itemKind: family,
    travelDate: (row.travel_date ?? "").slice(0, 10),
    price: chargedTotal ?? accrued ?? estimate ?? 0,
    estimate,
    accrued,
    fee,
    chargedTotal,
    status,
    deferredStatus: rawStatus,
    deferredLabel: deferredStatusLabel(rawStatus),
    sectionCount: row.section_ids?.length ?? 0,
    lastError: row.last_error ?? null,
    createdAt: row.created_at ?? null,
    fulfilledAt: status === "fulfilled" ? paidAt ?? row.debt_found_at ?? null : null,
    failedAt,
  };
}
