/** Test plates used in staging; hidden in dashboard lists at read time, never deleted from production. */
const HIDDEN_TEST_PLATES = new Set(["AAA", "AAAA", "AAAAA", "AAAAAA"]);

/** Commercial order statuses shown in the dashboard. `test` is excluded at read time. */
export const VISIBLE_ORDER_STATUSES = ["pending", "paid", "awaiting_payment", "waiting_payment", "fulfilled"] as const;

export function normalizePlateKey(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isHiddenTestPlate(plate?: string | null) {
  const normalized = normalizePlateKey(plate ?? "");
  if (!normalized) return false;
  if (HIDDEN_TEST_PLATES.has(normalized)) return true;
  return /^A{3,}$/.test(normalized);
}

export function normalizeOrderStatus(status?: string | null) {
  return (status ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function isDashboardVisibleOrderStatus(status?: string | null) {
  const normalized = normalizeOrderStatus(status);
  if (!normalized || normalized === "test") return false;
  return (VISIBLE_ORDER_STATUSES as readonly string[]).includes(normalized);
}

export function dashboardOrderStatusQuery() {
  return `status=in.(${VISIBLE_ORDER_STATUSES.join(",")})`;
}
