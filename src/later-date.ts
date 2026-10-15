export function pragueToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function remindOnDate(validOn: string | null | undefined, today: string) {
  if (!validOn || !/^\d{4}-\d{2}-\d{2}$/.test(validOn)) return today;
  const start = new Date(`${validOn}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const remind = start.toISOString().slice(0, 10);
  return remind < today ? today : remind;
}

export function formatCsDate(iso: string) {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${Number(day)}. ${Number(month)}. ${year}`;
}

export function earliestRemindOn(validOns: Array<string | null | undefined>, today = pragueToday()) {
  const reminds = validOns.map(value => remindOnDate(value, today));
  return reminds.sort()[0] ?? today;
}

export function dueOrderIds(rows: Array<{ orderId: string; remindOn: string }>, today: string) {
  const earliest = new Map<string, string>();
  for (const row of rows) {
    const current = earliest.get(row.orderId);
    if (!current || row.remindOn < current) earliest.set(row.orderId, row.remindOn);
  }
  return [...earliest.entries()].filter(([, remindOn]) => remindOn <= today).map(([orderId]) => orderId);
}

export function laterReminderText(plate: string, items: Array<{ label: string; validOn: string | null }>) {
  const dates = items.map(item => item.validOn).filter((value): value is string => Boolean(value)).sort();
  const when = dates[0] ? `Nejbližší platnost začíná ${formatCsDate(dates[0])}.` : "U položky chybí datum platnosti.";
  const lines = items.map(item => `• ${item.label}${item.validOn ? ` (od ${formatCsDate(item.validOn)})` : ""}`);
  return `${plate}\nČeká na vyřízení. ${when}\n${lines.join("\n")}`;
}
