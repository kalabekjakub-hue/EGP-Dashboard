import { dueOrderIds, laterReminderText } from "./src/later-date";
import { loadServerConfig, loadServerEnvironment } from "./server-config";

type OpenRow = {
  id: string;
  order_id: string;
  label: string;
  valid_on: string | null;
  remind_on: string;
};

type OrderRow = {
  id: string;
  plate?: string | null;
  order_number?: string | null;
};

async function supabaseFetch(url: string, key: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(init.body ? { "Content-Type": "application/json", Prefer: "return=minimal" } : {}),
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status} ${path.split("?")[0]}`);
  return response;
}

export async function dispatchLaterReminders(now = new Date()) {
  const environment = loadServerEnvironment();
  const { supabaseUrl, supabaseServiceKey } = loadServerConfig(environment);
  const topic = environment.NTFY_TOPIC?.trim();
  const baseUrl = (environment.NTFY_BASE_URL?.trim() || "https://ntfy.sh").replace(/\/$/, "");
  const token = environment.NTFY_ACCESS_TOKEN?.trim();
  if (!supabaseUrl || !supabaseServiceKey || !topic) return { sent: 0, skipped: true as const };

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const openResponse = await supabaseFetch(
    supabaseUrl,
    supabaseServiceKey,
    "dashboard_item_postponements?select=id,order_id,label,valid_on,remind_on&state=eq.open",
  );
  const open = await openResponse.json() as OpenRow[];
  const dueIds = new Set(dueOrderIds(open.map(row => ({ orderId: row.order_id, remindOn: row.remind_on })), today));
  if (!dueIds.size) return { sent: 0, skipped: false as const };

  const encodedIds = encodeURIComponent(`(${[...dueIds].join(",")})`);
  const ordersResponse = await supabaseFetch(
    supabaseUrl,
    supabaseServiceKey,
    `orders?select=id,plate,order_number&id=in.${encodedIds}`,
  );
  const orders = await ordersResponse.json() as OrderRow[];
  const byId = new Map(orders.map(order => [order.id, order]));
  let sent = 0;

  for (const orderId of dueIds) {
    const items = open.filter(row => row.order_id === orderId);
    const order = byId.get(orderId);
    const plate = order?.plate?.trim() || orderId.slice(0, 8);
    const number = order?.order_number ? ` · ${order.order_number}` : "";
    const origin = environment.EGP_PUBLIC_ORIGIN?.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        title: `Vyřídit později · ${plate}`,
        message: laterReminderText(`${plate}${number}`, items.map(item => ({ label: item.label, validOn: item.valid_on }))),
        priority: 4,
        tags: ["hourglass"],
        ...(origin ? { click: `${origin}/orders/${orderId}` } : {}),
      }),
    });
    if (!response.ok) throw new Error(`ntfy ${response.status}`);
    await supabaseFetch(
      supabaseUrl,
      supabaseServiceKey,
      `dashboard_item_postponements?order_id=eq.${encodeURIComponent(orderId)}&state=eq.open`,
      {
        method: "PATCH",
        body: JSON.stringify({ state: "sent", notified_at: new Date().toISOString() }),
      },
    );
    sent += 1;
  }
  return { sent, skipped: false as const };
}

export function startLaterReminders() {
  const marker = globalThis as { __egpLaterReminders?: boolean };
  if (marker.__egpLaterReminders) return;
  marker.__egpLaterReminders = true;
  const tick = () => {
    void dispatchLaterReminders().then(result => {
      if (result.sent) console.log(`later reminder sent ${result.sent}`);
    }).catch(error => {
      console.error("later reminder failed", error instanceof Error ? error.message : error);
    });
  };
  setTimeout(tick, 20_000);
  setInterval(tick, 5 * 60_000);
}
