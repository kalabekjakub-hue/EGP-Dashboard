import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  LogOut,
  Maximize2,
  Minimize2,
  Plus,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { orders as demoOrders, portalLinks, type Order, type OrderItem, type OrderStatus } from "./data";
import { EditorialArticleEditor, EditorialHome, EditorialPreview, EditorialSettingsModal } from "./editorial";

type View = "dashboard" | "orders" | "order" | "logs" | "screenshots" | "documents" | "posthog" | "editorial" | "editorial-article";

function routeFromPath(pathname = window.location.pathname): { view: View; orderId?: string; articleId?: string } {
  const path = pathname.replace(/\/+$/, "") || "/";
  const editorialArticle = path.match(/^\/editorial\/([^/]+)$/);
  if (editorialArticle) return { view: "editorial-article", articleId: decodeURIComponent(editorialArticle[1]) };
  if (path === "/editorial") return { view: "editorial" };
  const orderAsset = path.match(/^\/orders\/([^/]+)\/(screenshots|documents)$/);
  if (orderAsset) return { view: orderAsset[2] as "screenshots" | "documents", orderId: decodeURIComponent(orderAsset[1]) };
  const order = path.match(/^\/orders\/([^/]+)$/);
  if (order) return { view: "order", orderId: decodeURIComponent(order[1]) };
  if (path === "/orders") return { view: "orders" };
  if (path === "/analytics") return { view: "posthog" };
  if (path === "/logs") return { view: "logs" };
  if (path === "/screenshots") return { view: "screenshots" };
  if (path === "/documents") return { view: "documents" };
  return { view: "dashboard" };
}

function pathForView(view: View, orderId?: string) {
  const encodedOrder = orderId ? encodeURIComponent(orderId) : "";
  if (view === "orders") return "/orders";
  if (view === "order" && encodedOrder) return `/orders/${encodedOrder}`;
  if (view === "screenshots") return encodedOrder ? `/orders/${encodedOrder}/screenshots` : "/screenshots";
  if (view === "documents") return encodedOrder ? `/orders/${encodedOrder}/documents` : "/documents";
  if (view === "posthog") return "/analytics";
  if (view === "editorial") return "/editorial";
  if (view === "logs") return "/logs";
  return "/";
}

type PostHogAnalytics = {
  periodDays: number;
  trackingDays: number;
  comparisonAvailable: boolean;
  generatedAt: string;
  summary: {
    visitors: number;
    pageviews: number;
    sessions: number;
    checkouts: number;
    paymentStarted: number;
    paidOrders: number;
    funnelPaidOrders: number;
    totalEvents: number;
    conversion: number;
    revenue: number;
    averageOrder: number;
    productRevenue: number;
    processingRevenue: number;
    plusRevenue: number;
    ownRevenueBeforePaymentFees: number;
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
    checkoutEvents: number;
    paymentStartedEvents: number;
    checkoutVisitors: number;
    paidViewedSessions: number;
  };
  previous: { visitors: number; checkouts: number; paidOrders: number; revenue: number };
  daily: Array<{ date: string; visitors: number; checkouts: number; paidOrders: number }>;
  sources: Array<{ name: string; sessions: number; visitors: number; checkouts: number; payments: number }>;
  landingPages: Array<{ path: string; sessions: number; visitors: number; checkouts: number }>;
  hourly: Array<{ hour: number; sessions: number; checkouts: number }>;
  events: Array<{ name: string; events: number; sessions: number; visitors: number }>;
  devices: Array<{ name: string; visitors: number }>;
  pages: Array<{ path: string; views: number }>;
  browsers: Array<{ name: string; visitors: number }>;
  countries: Array<{ name: string; visitors: number }>;
  languages: Array<{ name: string; visitors: number }>;
  checkoutSteps: Array<{ name: string; events: number; sessions: number; visitors: number }>;
  validationIssues: Array<{ step: string; reason: string; count: number }>;
  dataQuality: {
    trackedIdentities: number; checkoutIdentities: number; checkoutIdentitiesWithPageview: number;
    checkoutSessionsWithDuplicates: number; maxCheckoutEventsPerSession: number;
    pageviewSessions: number; sessionsWithAnyEvent: number; pageviewsWithUtmSource: number; fbclidVisitors: number;
  };
  financeByCurrency: Array<{ currency: string; orders: number; gross: number; products: number; processing: number; plus: number }>;
};

type AffiliateAnalytics = {
  periodDays: number;
  generatedAt: string;
  summary: { orders: number; paidOrders: number; revenue: number; commission: number; pendingCommission: number; activePartners: number };
  partners: Array<{ id: string; code: string; name: string; status: string; commissionRate: number; orders: number; paidOrders: number; revenue: number; commission: number }>;
};

type ManualFulfillmentAudit = {
  id: string;
  order_id: string;
  item_id: string;
  item_source: "order_items" | "order_bridge_toll_items";
  country_code: string | null;
  actor_email: string;
  previous_status: string | null;
  fulfilled_at: string;
  created_at: string;
};

function usePostHogAnalytics() {
  const [data, setData] = useState<PostHogAnalytics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    void fetch("/api/posthog/summary", { headers: { Accept: "application/json" } })
      .then(response => {
        if (!response.ok) throw new Error(`PostHog API ${response.status}`);
        return response.json() as Promise<{ mode: string; data?: PostHogAnalytics }>;
      })
      .then(payload => {
        if (!active || payload.mode !== "live" || !payload.data) return;
        setData(payload.data);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => { active = false; };
  }, []);
  return { data, state };
}

function useAffiliateAnalytics() {
  const [data, setData] = useState<AffiliateAnalytics | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    let active = true;
    void fetch("/api/affiliates/summary", { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<AffiliateAnalytics> : Promise.reject())
      .then(payload => { if (active) { setData(payload); setState("ready"); } })
      .catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  return { data, state };
}

const integerFormat = new Intl.NumberFormat("cs-CZ");

type WorkerLogEntry = {
  ts: string;
  level: "debug" | "info" | "warn" | "error";
  message: string;
  [key: string]: unknown;
};

type TechnicalLog = {
  eventId: string;
  time: string;
  level: WorkerLogEntry["level"];
  text: string;
};

const workerEventsUrl = import.meta.env.VITE_WORKER_EVENTS_URL || "/api/worker/events";
const stepLabels: Record<string, string> = {
  home: "Otevřena úvodní stránka",
  landing: "Otevřena úvodní stránka",
  mode: "Vybrán způsob nákupu",
  product: "Vybrána dálniční známka",
  vignette: "Vybrána dálniční známka",
  form: "Vyplňuje se formulář",
  vehicle: "Vyplněny údaje o vozidle",
  fuel: "Vybrán druh paliva",
  contact: "Vyplněny kontaktní údaje",
  summary: "Kontrola souhrnu objednávky",
  basket: "Kontrola nákupního košíku",
  create: "Objednávka vytvořena na státním webu",
  auth: "Probíhá přihlášení",
  payment: "Přechod k platbě",
  confirmation: "Čeká se na potvrzení nákupu",
  purchase: "Dokončuje se nákup",
};

function workerLogId(entry: WorkerLogEntry) {
  return `${entry.ts}:${entry.level}:${entry.message}`;
}

function formatLogTime(timestamp: string, milliseconds = true) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(milliseconds ? { fractionalSecondDigits: 3 } : {}),
  });
}

function formatWorkerLog(entry: WorkerLogEntry) {
  const meta = Object.fromEntries(
    Object.entries(entry).filter(([key]) => !["ts", "level", "message"].includes(key)),
  );
  const suffix = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
  return `${entry.message}${suffix}`;
}

type HumanLogEvent = {
  id: string;
  ts: string;
  time: string;
  label: string;
  tone: "normal" | "active" | "error";
  rawCount: number;
};
type HumanLogGroup = {
  id: string;
  country: string;
  plate: string;
  startedAt: string;
  latestTs: string;
  attempt: number;
  totalAttempts: number;
  status: "processing" | "done" | "failed";
  duration: string;
  events: HumanLogEvent[];
};

type LogAttempt = {
  id: string;
  orderId: string;
  country: string;
  plate: string;
  runId?: string;
  batchKey?: string;
  startedAt: string;
  logs: WorkerLogEntry[];
};

function compactDuration(start: string, end: string) {
  const seconds = Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

function phaseForLog(entry: WorkerLogEntry): "claimed" | "portal" | "product" | "vehicle" | "summary" | "payment" | "terminal" | null {
  const step = typeof entry.step === "string" ? entry.step : "";
  if (["Claimed line group", "Running vignette batch", "batch started"].includes(entry.message)) return "claimed";
  if (entry.message === "adapter step") {
    if (["home", "landing", "auth", "mode"].includes(step)) return "portal";
    if (["product", "vignette", "create"].includes(step)) return "product";
    if (["form", "vehicle", "fuel", "contact"].includes(step)) return "vehicle";
    if (["summary", "basket"].includes(step)) return "summary";
    if (["payment", "confirmation", "purchase"].includes(step)) return "payment";
  }
  if (entry.message === "batch finished" || entry.message === "purchase failed") return "terminal";
  if (/(payment|card|3ds|captcha|checkout|gateway|bank approval)/i.test(entry.message)) return "payment";
  return null;
}

function canonicalAttemptEvents(attempt: LogAttempt): { events: HumanLogEvent[]; status: HumanLogGroup["status"] } {
  const phases: Array<{ key: NonNullable<ReturnType<typeof phaseForLog>>; label: string }> = [
    { key: "claimed", label: "Převzato workerem" },
    { key: "portal", label: "Otevřen státní portál" },
    { key: "product", label: "Vybrán produkt" },
    { key: "vehicle", label: "Vyplněny údaje" },
    { key: "summary", label: "Zkontrolován souhrn" },
    { key: "payment", label: "Platba" },
    { key: "terminal", label: "Dokončeno" },
  ];
  const terminalLogs = attempt.logs.filter(entry => phaseForLog(entry) === "terminal");
  const lastTerminal = terminalLogs.at(-1);
  const failed = lastTerminal?.message === "purchase failed" || (lastTerminal?.message === "batch finished" && lastTerminal.success !== true);
  const done = lastTerminal?.message === "batch finished" && lastTerminal.success === true;
  const status: HumanLogGroup["status"] = failed ? "failed" : done ? "done" : "processing";
  const events = phases.flatMap(({ key, label }) => {
    const matches = attempt.logs.filter(entry => phaseForLog(entry) === key);
    if (!matches.length) return [];
    const representative = matches.at(-1)!;
    const eventFailed = key === "terminal" && status === "failed";
    return [{
      id: workerLogId(representative),
      ts: representative.ts,
      time: formatLogTime(representative.ts, false),
      label: key === "terminal" ? (eventFailed ? "Selhalo" : done ? "Dokončeno" : "Dokončuje se") : label,
      tone: eventFailed ? "error" as const : key === "terminal" || (status === "processing" && key === phases.filter(phase => attempt.logs.some(entry => phaseForLog(entry) === phase.key)).at(-1)?.key) ? "active" as const : "normal" as const,
      rawCount: matches.length,
    }];
  });
  return { events, status };
}

function buildHumanLogGroups(logs: WorkerLogEntry[]): HumanLogGroup[] {
  const ordered = [...logs].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const attempts: LogAttempt[] = [];
  const byRunId = new Map<string, LogAttempt>();
  const byBatchKey = new Map<string, LogAttempt>();
  const claims = new Map<string, WorkerLogEntry>();
  let active: LogAttempt | null = null;

  for (const entry of ordered) {
    if (entry.message === "Claimed line group" && typeof entry.orderId === "string") claims.set(entry.orderId, entry);
    if (entry.message === "Running vignette batch" && typeof entry.orderId === "string" && typeof entry.country === "string" && typeof entry.plate === "string") {
      const runId = typeof entry.runId === "string" ? entry.runId : undefined;
      const batchKey = typeof entry.batchKey === "string" ? entry.batchKey : undefined;
      const existing = (runId && byRunId.get(runId)) || (batchKey && byBatchKey.get(batchKey));
      if (existing) {
        existing.logs.push(entry);
        active = existing;
        continue;
      }
      const attempt: LogAttempt = {
        id: runId ?? batchKey ?? workerLogId(entry),
        orderId: entry.orderId,
        country: entry.country,
        plate: entry.plate,
        runId,
        batchKey,
        startedAt: entry.ts,
        logs: [...(claims.get(entry.orderId) ? [claims.get(entry.orderId)!] : []), entry],
      };
      attempts.push(attempt);
      if (runId) byRunId.set(runId, attempt);
      if (batchKey) byBatchKey.set(batchKey, attempt);
      active = attempt;
      continue;
    }

    const target = (typeof entry.runId === "string" ? byRunId.get(entry.runId) : undefined)
      ?? (typeof entry.batchKey === "string" ? byBatchKey.get(entry.batchKey) : undefined)
      ?? (active && typeof entry.orderId === "string" && entry.orderId === active.orderId && (!entry.country || entry.country === active.country) ? active : undefined)
      ?? (!entry.orderId && !entry.runId && !entry.batchKey ? active ?? undefined : undefined);
    if (!target || target.logs.includes(entry)) continue;
    target.logs.push(entry);
    if (entry.message === "batch finished" && active === target) active = null;
  }

  const totals = new Map<string, number>();
  const positions = new Map<string, number>();
  for (const attempt of attempts) {
    const key = `${attempt.orderId}:${attempt.country}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }

  return attempts.map(attempt => {
    const key = `${attempt.orderId}:${attempt.country}`;
    const number = (positions.get(key) ?? 0) + 1;
    positions.set(key, number);
    const { events, status } = canonicalAttemptEvents(attempt);
    const latestTs = attempt.logs.at(-1)?.ts ?? attempt.startedAt;
    return {
      id: `${attempt.orderId}:${attempt.country}:${attempt.id}`,
      country: attempt.country,
      plate: attempt.plate,
      startedAt: attempt.startedAt,
      latestTs,
      attempt: number,
      totalAttempts: totals.get(key) ?? 1,
      status,
      duration: compactDuration(attempt.startedAt, latestTs),
      events,
    };
  }).filter(group => group.events.length).sort((a, b) => Date.parse(b.latestTs) - Date.parse(a.latestTs)).slice(0, 30);
}

type ItemTimelineEvent = {
  id: string;
  ts?: string;
  label: string;
  status: "done" | "active" | "failed" | "waiting";
};

function timelineTime(timestamp?: string) {
  if (!timestamp) return "Čas není dostupný";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return date.toLocaleString("cs-CZ", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function itemLogLabel(entry: WorkerLogEntry) {
  const step = typeof entry.step === "string" ? entry.step : "";
  switch (entry.message) {
    case "adapter step": return stepLabels[step] ?? `Krok: ${step || "zpracování"}`;
    case "Starting card payment": return "Platba zahájena";
    case "Card submitted on gateway": return "Platební údaje odeslány";
    case "3DS challenge detected":
    case "3DS challenge detected – waiting for bank approval (full payment mode)": return "Čekání na potvrzení platby";
    case "Frictionless payment completed – no 3DS challenge":
    case "Payment success page detected after submit (no 3DS wait needed)":
    case "Payment success page detected during 3DS debounce (frictionless)": return "Platba potvrzena";
    case "2Captcha reCAPTCHA solved": return "Ověření CAPTCHA dokončeno";
    case "Invoking AI fallback after Playwright failure": return "Spuštěno náhradní zpracování";
    case "purchase failed": return "Nákup položky selhal";
    default: return null;
  }
}

function buildItemTimeline(orderId: string, item: OrderItem, logs: WorkerLogEntry[]): ItemTimelineEvent[] {
  const directLogs = logs.filter((entry) => entry.orderId === orderId && (!entry.country || entry.country === item.country));
  const runIds = new Set(directLogs.map((entry) => entry.runId).filter((value): value is string => typeof value === "string"));
  const batchKeys = new Set(directLogs.map((entry) => entry.batchKey).filter((value): value is string => typeof value === "string"));
  const relatedLogs = logs.filter((entry) =>
    directLogs.includes(entry)
    || (typeof entry.runId === "string" && runIds.has(entry.runId) && (!entry.country || entry.country === item.country))
    || (typeof entry.batchKey === "string" && batchKeys.has(entry.batchKey)),
  );
  const logEvents: ItemTimelineEvent[] = relatedLogs.flatMap((entry) => {
    const label = itemLogLabel(entry);
    if (!label) return [];
    return [{
      id: workerLogId(entry),
      ts: entry.ts,
      label,
      status: entry.level === "error" || entry.message === "purchase failed" ? "failed" as const : "done" as const,
    }];
  });
  const facts: ItemTimelineEvent[] = [];
  if (item.engineSubmittedAt) {
    facts.push({ id: "submitted", ts: item.engineSubmittedAt, label: "Položka převzata workerem", status: "done" });
  }
  if (item.fulfilledAt) {
    facts.push({ id: "fulfilled", ts: item.fulfilledAt, label: "Nákup dokončen", status: "done" });
  } else if (item.failedAt) {
    facts.push({ id: "failed", ts: item.failedAt, label: "Zpracování položky selhalo", status: "failed" });
  } else if (item.status === "processing") {
    facts.push({ id: "processing", ts: item.engineSubmittedAt, label: "Zpracování právě probíhá", status: "active" });
  } else if (item.status === "waiting") {
    facts.push({ id: "waiting", label: "Čeká na převzetí workerem", status: "waiting" });
  }
  const seen = new Set<string>();
  return [...facts, ...logEvents]
    .sort((a, b) => a.ts && b.ts ? Date.parse(a.ts) - Date.parse(b.ts) : a.ts ? -1 : 1)
    .filter((event) => {
      const key = event.label.toLocaleLowerCase("cs-CZ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

const statusLabels: Record<OrderStatus, string> = {
  awaiting_payment: "Čeká na platbu",
  waiting: "Čeká na zpracování",
  processing: "Zpracovává se",
  fulfilled: "Dokončeno",
  failed: "Neúspěšná",
};

function shortId(id: string) {
  return `${id.slice(0, 5)}…${id.slice(-4)}`;
}

function money(value: number, currency = "EUR") {
  return value.toLocaleString("cs-CZ", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function profitMoney(order: Order) {
  const profit = order.profit ?? Math.floor((order.total * 0.1 + Number.EPSILON) * 100) / 100;
  return money(profit, order.currency);
}

function vehicleLabel(value?: string) {
  return ({ passenger: "Osobní automobil", "van-large": "Dodávka", motorcycle: "Motocykl" } as Record<string, string>)[value ?? ""] ?? value ?? "Neuvedeno";
}

function fuelLabel(value?: string) {
  return ({ standard: "Benzín / nafta", "electric-hydrogen": "Elektřina / vodík", "plugin-hybrid": "Plug-in hybrid", biomethane: "Biometan", "natural-gas": "Zemní plyn" } as Record<string, string>)[value ?? ""] ?? value ?? "Neuvedeno";
}

function Flag({ code, large = false }: { code: string; large?: boolean }) {
  return <img className={`flag ${large ? "large" : ""}`} src={`https://eurogopass.com/flags/${code.toLowerCase()}.svg`} alt="" />;
}

function Logo() {
  return (
    <div className="brand" aria-label="EuroGoPass Admin">
      <img src="https://eurogopass.com/payments/eurogopass-logo.svg" alt="EuroGoPass" />
      <span>Admin</span>
    </div>
  );
}

function WorkerStatus({ name, tone, details, onClick }: { name: string; tone: "ok" | "warn" | "down"; details: string; onClick: () => void }) {
  return (
    <button className="worker-status" onClick={onClick} aria-label={`${name}: ${details}`}>
      <span>{name}</span>
      <i className={`status-dot ${tone}`} />
    </button>
  );
}

type WorkersStatus = {
  checkedAt: string;
  egp: { ok: boolean; countries: string[]; passageCountries: string[]; itemFulfillmentEnabled: boolean; image: string | null; builtAt: string | null };
  wise: { ok: boolean; authenticated: boolean; cdpConnected: boolean; armed: boolean; lastActivityAt: string | null; lastError: string | null; pendingNewOrders: number | null; paymentWatchOrders: number | null; commit: string | null };
};

function statusDate(value: string | null) {
  if (!value) return "Není dostupné";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function Header({ goHome, navigate, onClearAttention, onLogout }: { goHome: () => void; navigate: (view: View) => void; onClearAttention: () => void; onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editorialSettingsModalOpen, setEditorialSettingsModalOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [worker, setWorker] = useState<"egp" | "wise" | null>(null);
  const [workersStatus, setWorkersStatus] = useState<WorkersStatus | null>(null);
  const [now, setNow] = useState(new Date());
  const settingsRef = useRef<HTMLDivElement>(null);
  const workerButtonsRef = useRef<HTMLDivElement>(null);
  const workerPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const load = () => void fetch("/api/workers/status", { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<WorkersStatus> : Promise.reject())
      .then(status => { if (active) setWorkersStatus(status); })
      .catch(() => { if (active) setWorkersStatus(null); });
    load();
    const timer = window.setInterval(load, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event: MouseEvent) => {
      if (!settingsRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
        setSettingsOpen(false);
        setLinksOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setSettingsOpen(false);
        setLinksOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!worker) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!workerButtonsRef.current?.contains(target) && !workerPopoverRef.current?.contains(target)) {
        setWorker(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setWorker(null);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [worker]);

  const externalLinks = [
    ["Wise", "https://wise.com"], ["Gmail", "https://mail.google.com"], ["Supabase", "https://supabase.com/dashboard"],
    ["Retell AI", "https://www.retellai.com"], ["GitHub", "https://github.com"], ["PostHog", "https://app.posthog.com"],
    ["eurogopass.com", "https://eurogopass.com"],
  ];
  const egpTone = workersStatus?.egp.ok ? "ok" : workersStatus ? "down" : "warn";
  const wiseTone = !workersStatus ? "warn" : !workersStatus.wise.ok ? "down" : workersStatus.wise.authenticated && workersStatus.wise.cdpConnected && !workersStatus.wise.lastError ? "ok" : "warn";

  return <>
    <header className="topbar">
      <button className="logo-button" onClick={goHome}><Logo /></button>
      <div className="topbar-right">
        <div className="worker-row" ref={workerButtonsRef}>
          <WorkerStatus name="EGP Worker" tone={egpTone} details={workersStatus?.egp.ok ? "Odpovídá" : "Neodpovídá"} onClick={() => setWorker(worker === "egp" ? null : "egp")} />
          <WorkerStatus name="Wise Worker" tone={wiseTone} details={workersStatus?.wise.ok ? "Odpovídá" : "Neodpovídá"} onClick={() => setWorker(worker === "wise" ? null : "wise")} />
        </div>
        <time>{now.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" })} · {now.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</time>
        <div className="settings-wrap" ref={settingsRef}>
          <button className="icon-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Otevřít nabídku"><Plus size={20} /></button>
          {menuOpen && (
            <div className="settings-menu">
              <button onClick={() => { setSettingsOpen(!settingsOpen); setLinksOpen(false); }}><Settings size={16} /> Nastavení <ChevronLeft size={16} /></button>
              {settingsOpen && <div className="settings-submenu"><button onClick={() => { setEditorialSettingsModalOpen(true); setMenuOpen(false); setSettingsOpen(false); setLinksOpen(false); }}><FileText size={16} /> Redakce</button><button onClick={() => { onClearAttention(); setMenuOpen(false); setSettingsOpen(false); setLinksOpen(false); }}><Trash2 size={16} /> Vymazat centrum pozornosti</button></div>}
              <button onClick={() => { setLinksOpen(!linksOpen); setSettingsOpen(false); }}>Odkazy <ChevronLeft size={16} /></button>
              {linksOpen && <div className="links-submenu">
                {externalLinks.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noreferrer">{label}<ExternalLink size={13} /></a>)}
                <div className="portal-menu">
                  {portalLinks.map(portal => <a key={portal.code} href={portal.url} target="_blank" rel="noreferrer" aria-label={portal.code}><Flag code={portal.code} /></a>)}
                </div>
              </div>}
              <button onClick={() => { navigate("screenshots"); setMenuOpen(false); setLinksOpen(false); }}><FolderOpen size={16} /> Screenshoty</button>
              <button onClick={() => { navigate("documents"); setMenuOpen(false); setLinksOpen(false); }}><FileText size={16} /> Doklady</button>
              <button onClick={onLogout}><LogOut size={16} /> Odhlásit se</button>
            </div>
          )}
        </div>
      </div>
      {worker && (
        <div className="worker-popover" ref={workerPopoverRef}>
          {worker === "egp" ? <><div><strong>EGP Worker</strong><span className={`health-pill ${egpTone}`}>{workersStatus?.egp.ok ? "Odpovídá" : "Nedostupný"}</span></div><p>Země: {workersStatus?.egp.countries?.join(", ") || "Není dostupné"}</p><p>Docker image <code>{workersStatus?.egp.image || "nezjištěn"}</code></p><p>Image vytvořen: {statusDate(workersStatus?.egp.builtAt ?? null)}</p><p>Naposledy zkontrolováno: {statusDate(workersStatus?.checkedAt ?? null)}</p></> : <><div><strong>Wise Worker</strong><span className={`health-pill ${wiseTone}`}>{workersStatus?.wise.ok ? "Odpovídá" : "Nedostupný"}</span></div><p>Přihlášení: {workersStatus?.wise.authenticated ? "aktivní" : "neaktivní"} · Chrome: {workersStatus?.wise.cdpConnected ? "připojen" : "odpojen"}</p><p>Stav: {workersStatus?.wise.armed ? "zpracovává platbu" : "čeká"} · fronta {workersStatus?.wise.pendingNewOrders ?? "–"}</p><p>Poslední aktivita: {statusDate(workersStatus?.wise.lastActivityAt ?? null)}</p>{workersStatus?.wise.lastError && <p className="worker-error">Chyba: {workersStatus.wise.lastError}</p>}<p>Commit <code>{workersStatus?.wise.commit || "nezjištěn"}</code></p><p>Naposledy zkontrolováno: {statusDate(workersStatus?.checkedAt ?? null)}</p></>}
        </div>
      )}
    </header>
    {editorialSettingsModalOpen && <EditorialSettingsModal onClose={() => setEditorialSettingsModalOpen(false)} />}
  </>;
}

function OrderCard({ order, onOpen }: { order: Order; onOpen: () => void }) {
  return (
    <button className={`order-card ${order.status}`} onClick={onOpen}>
      <div className="order-meta"><span>{shortId(order.id)}</span><span className={`status-tag ${order.status}`}>{statusLabels[order.status]}</span></div>
      <div className="order-primary">
        <div className="plate"><Flag code={order.registrationCode} /><strong>{order.plate}</strong></div>
        <div className="price-summary">
          <strong className="price">{money(order.total, order.currency)}</strong>
          <small className="profit">({profitMoney(order)})</small>
        </div>
      </div>
      <div className="item-preview">
        {order.items.map((item) => <div key={item.id ?? `${item.source}-${item.country}-${item.product}`}><Flag code={item.country} /><b>{item.product}</b><span>{item.displayCode ?? item.country}</span></div>)}
      </div>
      {order.status === "awaiting_payment" && <div className="awaiting-created"><Clock3 size={12} />Vytvořeno {order.createdAt}</div>}
      {order.status === "processing" && <div className="processing-line"><span className="live-pulse" />{order.items.find(i => i.status === "processing")?.country} · {order.items.find(i => i.status === "processing")?.currentStep}</div>}
    </button>
  );
}

function OrderColumn({ orderData, openOrder, showAll }: { orderData: Order[]; openOrder: (order: Order) => void; showAll: () => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.toUpperCase().replace(/[\s-]/g, "");
  const filtered = orderData.filter(order => !query || [order.id, order.plate.replace(/[\s-]/g, ""), order.email].some(value => value.toUpperCase().includes(normalized)));
  const previewOrders = filtered
    .filter(order => Boolean(order.paidAtIso) && order.status !== "awaiting_payment")
    .sort((a, b) => Date.parse(b.paidAtIso ?? "") - Date.parse(a.paidAtIso ?? ""))
    .slice(0, 3);
  return (
    <aside className="orders-column surface">
      <label className="search"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Hledat SPZ, ID nebo e-mail" /></label>
      <div className="order-list">
        {previewOrders.length ? previewOrders.map(order => <OrderCard key={order.id} order={order} onOpen={() => openOrder(order)} />) : <div className="empty">Žádná zaplacená objednávka nenalezena</div>}
      </div>
      <button className="all-orders" onClick={showAll}>Všechny objednávky</button>
    </aside>
  );
}

function PostHogPreview({ onOpen }: { onOpen: () => void }) {
  const { data, state } = usePostHogAnalytics();
  const summary = data?.summary;
  return (
    <button className="posthog surface" onClick={onOpen}>
      {state === "ready" && summary ? <div className="posthog-preview-metrics">
        <span><small>Návštěvníci</small><strong>{integerFormat.format(summary.visitors)}</strong></span>
        <span><small>Vstupy do checkoutu</small><strong>{integerFormat.format(summary.checkouts)}</strong></span>
        <span><small>Zaplacené objednávky</small><strong>{integerFormat.format(summary.paidOrders)}</strong></span>
        <span><small>Nákupy / návštěvníci</small><strong>{summary.conversion.toLocaleString("cs-CZ")} %</strong></span>
        <span><small>Tržby</small><strong>{summary.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })}</strong></span>
      </div> : <div className={`posthog-state ${state}`}>{state === "loading" ? "Načítám data…" : "Data nejsou dostupná"}</div>}
    </button>
  );
}

type DashboardIncident = {
  id: string;
  tone: "error" | "warning";
  title: string;
  detail: string;
  orderId?: string;
  target?: View;
};

function pragueDay(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function minutesSince(value?: string) {
  if (!value) return 0;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 60_000);
}

function secondsBetween(start?: string, end?: string) {
  if (!start || !end) return null;
  const seconds = (new Date(end).getTime() - new Date(start).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function useWorkerStatusSnapshot() {
  const [status, setStatus] = useState<WorkersStatus | null>(null);
  useEffect(() => {
    let active = true;
    const load = () => void fetch("/api/workers/status", { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<WorkersStatus> : Promise.reject())
      .then(next => { if (active) setStatus(next); })
      .catch(() => { if (active) setStatus(null); });
    load();
    const timer = window.setInterval(load, 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  return status;
}

function buildDashboardOverview(orderData: Order[], workers: WorkersStatus | null) {
  const today = pragueDay(new Date().toISOString());
  const todayOrders = orderData.filter(order => pragueDay(order.createdAtIso) === today);
  const paidToday = orderData.filter(order =>
    order.status !== "awaiting_payment" &&
    Boolean(order.paidAtIso) &&
    pragueDay(order.paidAtIso) === today
  );
  const todayItems = todayOrders.flatMap(order => order.items.map(item => ({ order, item })));
  const durations = todayItems
    .map(({ item }) => secondsBetween(item.engineSubmittedAt, item.fulfilledAt ?? item.failedAt))
    .filter((value): value is number => value !== null);
  const failedByCountry = new Map<string, number>();
  todayItems.filter(({ item }) => item.status === "failed").forEach(({ item }) => failedByCountry.set(item.country, (failedByCountry.get(item.country) ?? 0) + 1));
  const problematic = [...failedByCountry.entries()].sort((a, b) => b[1] - a[1])[0];
  const incidents: DashboardIncident[] = [];
  for (const order of orderData) {
    for (const item of order.items) {
      const prefix = `${item.country} · ${order.plate}`;
      if (item.status === "failed" && pragueDay(item.failedAt) === today) incidents.push({ id: `failed:${order.id}:${item.country}`, tone: "error", title: `${prefix} selhalo`, detail: item.lastError || "Položka skončila chybou", orderId: order.id });
      if (order.paidAtIso && pragueDay(order.paidAtIso) === today && item.status === "waiting" && !item.engineSubmittedAt && minutesSince(order.paidAtIso) > 5) incidents.push({ id: `unclaimed:${order.id}:${item.country}`, tone: "warning", title: `${prefix} čeká na worker`, detail: "Zaplaceno, ale položka nebyla převzata", orderId: order.id });
      if (item.status === "processing" && item.engineSubmittedAt && pragueDay(item.engineSubmittedAt) === today && minutesSince(item.engineSubmittedAt) > 15) incidents.push({ id: `slow:${order.id}:${item.country}`, tone: "warning", title: `${prefix} trvá dlouho`, detail: `Zpracování běží ${Math.round(minutesSince(item.engineSubmittedAt))} minut`, orderId: order.id });
      if (item.status === "fulfilled" && item.fulfilledAt && pragueDay(item.fulfilledAt) === today && item.pdfAvailable === false) incidents.push({ id: `pdf:${order.id}:${item.country}`, tone: "warning", title: `${prefix} nemá doklad`, detail: "V Supabase není přiřazený doklad k položce", orderId: order.id, target: "documents" });
      if (item.status === "fulfilled" && item.fulfilledAt && pragueDay(item.fulfilledAt) === today && item.screenshotsAvailable === false) incidents.push({ id: `shots:${order.id}:${item.country}`, tone: "warning", title: `${prefix} nemá screenshoty`, detail: "Worker neuložil screenshoty kroků", orderId: order.id, target: "screenshots" });
    }
  }
  if (workers && !workers.egp.ok) incidents.unshift({ id: "worker:egp", tone: "error", title: "EGP Worker neodpovídá", detail: "Otevři živý log a diagnostiku", target: "logs" });
  if (workers && (!workers.wise.ok || !workers.wise.authenticated || !workers.wise.cdpConnected || workers.wise.lastError)) incidents.unshift({ id: "worker:wise", tone: "error", title: "Wise Worker vyžaduje kontrolu", detail: workers.wise.lastError || "Přihlášení nebo Chrome není připraven", target: "logs" });
  const completed = todayOrders.filter(order => order.status === "fulfilled").length;
  const failed = todayOrders.filter(order => order.status === "failed").length;
  return {
    orders: todayOrders.length,
    revenue: paidToday.reduce((sum, order) => sum + order.total, 0),
    completed,
    failed,
    waiting: Math.max(0, todayOrders.length - completed - failed),
    averageDuration: durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0,
    problematicCountry: problematic?.[0] ?? "–",
    missingDocuments: todayItems.filter(({ item }) => item.status === "fulfilled" && item.pdfAvailable === false).length,
    incidents,
  };
}

function DailySummaryCard({ overview, onOpenAttention }: { overview: ReturnType<typeof buildDashboardOverview>; onOpenAttention: () => void }) {
  return <section className="daily-summary surface"><div className="daily-information"><div className="compact-card-head"><div><strong>Denní přehled</strong><span>Dnes, {new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long" })}</span></div></div><div className="daily-primary"><div><small>Objednávky</small><strong>{overview.orders}</strong></div><div><small>Tržby</small><strong>{overview.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })}</strong></div></div><div className="daily-statuses"><span className="done"><b>{overview.completed}</b> koupeno</span><span className="waiting"><b>{overview.waiting}</b> čeká</span><span className="failed"><b>{overview.failed}</b> selhalo</span></div></div><button className={`attention-trigger ${overview.incidents.length ? "has-issues" : "clear"}`} onClick={onOpenAttention}><span className="attention-trigger-icon"><Activity size={20} /><b>{overview.incidents.length}</b></span><span><strong>Centrum pozornosti</strong><small>{overview.incidents.length ? `${overview.incidents.length} položek ke kontrole` : "Všechno je v pořádku"}</small></span><ChevronRight size={18} /></button></section>;
}

function AttentionCenter({ incidents, onOpen, onClose }: { incidents: DashboardIncident[]; onOpen: (incident: DashboardIncident) => void; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);
  return <div className="attention-modal" role="presentation" onMouseDown={onClose}><section className={`attention-dialog surface ${incidents.length ? "has-issues" : "clear"}`} role="dialog" aria-modal="true" aria-labelledby="attention-title" onMouseDown={event => event.stopPropagation()}><button className="attention-close" onClick={onClose} aria-label="Zavřít centrum pozornosti"><X size={18} /></button><div className="attention-dialog-head"><span className="attention-dialog-icon"><Activity size={21} /></span><div><h2 id="attention-title">Centrum pozornosti</h2><p>{incidents.length ? `${incidents.length} položek vyžaduje kontrolu` : "Všechno je v pořádku"}</p></div><span className="attention-count">{incidents.length}</span></div>{incidents.length ? <div className="attention-list">{incidents.map(incident => <button key={incident.id} onClick={() => onOpen(incident)}><i className={incident.tone} /><span><strong>{incident.title}</strong><small>{incident.detail}</small></span><ChevronRight size={16} /></button>)}</div> : <div className="attention-clear"><span className="live-dot" />Žádný nevyřešený incident</div>}</section></div>;
}

function analyticsLabel(value: string) {
  const labels: Record<string, string> = {
    "$direct": "Přímý / nerozpoznaný",
    "facebook.com": "Facebook",
    "www.google.com": "Google",
    gmail: "E-mail / Gmail",
    internal: "Vlastní web / platební návrat",
    "chatgpt.com": "ChatGPT",
    Mobile: "Mobil",
    Desktop: "Počítač",
    Tablet: "Tablet",
    Unknown: "Neznámé",
    checkout: "Checkout",
    search: "Vyhledávání trasy",
    "vehicle-gate": "Vozidlo a trasa",
    vehicle: "Vozidlo",
    vehicle_type_missing: "Chybí typ vozidla",
    route_points_missing: "Chybí trasa",
    invalid_vin: "Neplatný VIN",
  };
  return labels[value] ?? value;
}

type AnalyticsTab = "overview" | "orders" | "finance" | "affiliate" | "traffic" | "behavior" | "quality";

function comparisonText(current: number, previous: number) {
  if (!previous) return current ? "Nová data" : "Beze změny";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change > 0 ? "+" : ""}${change} %`;
}

function AnalyticsStat({ label, value, note, previous }: { label: string; value: string; note: string; previous?: { current: number; value: number } }) {
  return <article className="surface analytics-stat"><span>{label}</span><strong>{value}</strong><small>{note}</small>{previous && <em className={previous.current >= previous.value ? "up" : "down"}>{comparisonText(previous.current, previous.value)} oproti předchozím 30 dnům</em>}</article>;
}

function PostHogDetail({ back }: { back: () => void }) {
  const [tab, setTab] = useState<AnalyticsTab>("overview");
  const { data, state } = usePostHogAnalytics();
  const { data: affiliateData, state: affiliateState } = useAffiliateAnalytics();
  if (state === "loading") return <main className="page-shell analytics-page"><BackButton onClick={back} /><div className="analytics-loading surface">Načítám analytiku…</div></main>;
  if (state === "error" || !data) return <main className="page-shell analytics-page"><BackButton onClick={back} /><div className="analytics-loading surface error">PostHog se nepodařilo načíst.</div></main>;
  const { summary } = data;
  const maxFunnel = Math.max(summary.checkouts, 1);
  const maxStep = Math.max(...data.checkoutSteps.map(step => step.sessions), 1);
  const maxLanding = Math.max(...data.landingPages.map(page => page.sessions), 1);
  const maxHourly = Math.max(...data.hourly.map(hour => hour.sessions), 1);
  const chartMax = Math.max(...data.daily.map(day => day.checkouts), ...data.daily.map(day => day.paidOrders), 1);
  const chartWidth = 800;
  const chartHeight = 240;
  const chartPlot = { left: 52, right: 14, top: 12, bottom: 32 };
  const chartScaleMax = Math.max(4, Math.ceil(chartMax / 4) * 4);
  const dailyChartPath = (values: number[]) => values.map((value, index) => {
    const plotWidth = chartWidth - chartPlot.left - chartPlot.right;
    const plotHeight = chartHeight - chartPlot.top - chartPlot.bottom;
    const x = chartPlot.left + (values.length > 1 ? index / (values.length - 1) * plotWidth : plotWidth / 2);
    const y = chartPlot.top + (1 - value / chartScaleMax) * plotHeight;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const checkoutPath = dailyChartPath(data.daily.map(day => day.checkouts));
  const paidPath = dailyChartPath(data.daily.map(day => day.paidOrders));
  const comparisonNote = (current: number, previous: number) => data.comparisonAvailable
    ? `${comparisonText(current, previous)} proti předchozímu období`
    : "Bez srovnatelného předchozího období";
  const yTicks = Array.from({ length: 5 }, (_, index) => chartScaleMax - index * chartScaleMax / 4);
  const xTickIndexes = Array.from(new Set([0, 1, 2, 3, 4].map(index => Math.round(index * Math.max(data.daily.length - 1, 0) / 4))));
  const firstDate = data.daily[0]?.date;
  const lastDate = data.daily.at(-1)?.date;
  const formatShortDate = (value?: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" }) : "–";
  return <main className="page-shell analytics-page">
    <BackButton onClick={back} />
    <div className="analytics-heading"><h1>Statistiky</h1><div className="analytics-fresh"><span className="live-dot" />Aktualizováno {new Date(data.generatedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</div></div>
    <section className="analytics-metrics">
      <article className="surface"><Users size={19} /><span>Návštěvníci</span><strong>{integerFormat.format(summary.visitors)}</strong><small>{comparisonNote(summary.visitors, data.previous.visitors)}</small></article>
      <article className="surface"><ShoppingCart size={19} /><span>Vstupy do checkoutu</span><strong>{integerFormat.format(summary.checkouts)}</strong><small>{comparisonNote(summary.checkouts, data.previous.checkouts)}</small></article>
      <article className="surface"><Activity size={19} /><span>Zaplacené objednávky</span><strong>{integerFormat.format(summary.paidOrders)}</strong><small>{comparisonNote(summary.paidOrders, data.previous.paidOrders)}</small></article>
      <article className="surface"><BarChart3 size={19} /><span>Tržby</span><strong>{summary.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })}</strong><small>{comparisonNote(summary.revenue, data.previous.revenue)}</small></article>
    </section>
    <nav className="analytics-tabs surface" aria-label="Sekce analytiky">{[
      ["overview", "Přehled"], ["orders", "Objednávky"], ["finance", "Finance"], ["affiliate", "Affiliate"], ["traffic", "Akvizice"], ["behavior", "Chování"], ["quality", "Kvalita dat"],
    ].map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key as AnalyticsTab)}>{label}</button>)}</nav>
    {tab === "overview" && <section className="analytics-layout">
      <article className="analytics-chart surface">
        <div className="analytics-card-head"><div><h2>Aktivita po dnech</h2><p>{formatShortDate(firstDate)} – {formatShortDate(lastDate)}</p></div><div className="chart-legend"><span className="checkout">Checkout</span><span className="paid">Zaplaceno</span></div></div>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" role="img" aria-label="Vývoj checkoutů a zaplacených objednávek s číselnou a datumovou osou">
          {yTicks.map((tick, index) => {
            const y = chartPlot.top + index * (chartHeight - chartPlot.top - chartPlot.bottom) / 4;
            return <g className="chart-grid-row" key={tick}><line x1={chartPlot.left} y1={y} x2={chartWidth - chartPlot.right} y2={y} /><text x={chartPlot.left - 10} y={y + 3} textAnchor="end">{integerFormat.format(tick)}</text></g>;
          })}
          {xTickIndexes.map(index => {
            const x = chartPlot.left + (data.daily.length > 1 ? index / (data.daily.length - 1) * (chartWidth - chartPlot.left - chartPlot.right) : (chartWidth - chartPlot.left - chartPlot.right) / 2);
            return <g className="chart-x-tick" key={index}><line x1={x} y1={chartHeight - chartPlot.bottom} x2={x} y2={chartHeight - chartPlot.bottom + 5} /><text x={x} y={chartHeight - 9} textAnchor={index === 0 ? "start" : index === data.daily.length - 1 ? "end" : "middle"}>{formatShortDate(data.daily[index]?.date)}</text></g>;
          })}
          <path className="checkout" d={checkoutPath} /><path className="paid" d={paidPath} />
        </svg>
      </article>
      <article className="analytics-funnel surface"><div className="analytics-card-head"><div><h2>Průchod checkoutem</h2><p>Unikátní relace v PostHogu</p></div></div>{[
        ["Vstup do checkoutu", summary.checkouts],
        ["Zahájení platby", summary.paymentStarted],
        ["Zobrazení potvrzení platby", summary.paidViewedSessions],
      ].map(([label, value]) => <div className="funnel-row" key={label}><div><span>{label}</span><strong>{integerFormat.format(Number(value))}</strong></div><i><b style={{ width: `${Math.max(4, Number(value) / maxFunnel * 100)}%` }} /></i><small>{Math.round(Number(value) / maxFunnel * 100)} % ze vstupů</small></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Rychlý souhrn</h2><p>Aktivita návštěvníků</p></div></div>{[
        ["Návštěvy stránek", summary.pageviews], ["Relace", summary.sessions], ["Vyhledané trasy", summary.routeSearches], ["Spočítané trasy", summary.routesCalculated],
      ].map(([label, value]) => <div className="device-row" key={label}><span>{label}</span><strong>{integerFormat.format(Number(value))}</strong></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Stav checkoutu</h2><p>Události vyžadující pozornost</p></div></div>{[
        ["Opuštění checkoutu", summary.checkoutLeft], ["Návraty do checkoutu", summary.checkoutReturned], ["Chyby validace", summary.validationFailures], ["Chyby platby", summary.paymentFailures],
      ].map(([label, value]) => <div className="device-row" key={label}><span>{label}</span><strong>{integerFormat.format(Number(value))}</strong></div>)}</article>
      <article className="analytics-list analytics-pages surface"><div className="analytics-card-head"><div><h2>Nejnavštěvovanější stránky</h2><p>Zobrazení stránek</p></div></div>{data.pages.slice(0, 5).map(page => <div className="device-row" key={page.path}><code>{page.path}</code><strong>{page.views}</strong></div>)}</article>
    </section>}
    {tab === "orders" && <section className="analytics-tab-content">
      <div className="analytics-stat-grid">
        <AnalyticsStat label="Tržby" value={summary.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="Supabase paid_at · přepočteno kurzem ECB" previous={data.comparisonAvailable ? { current: summary.revenue, value: data.previous.revenue } : undefined} />
        <AnalyticsStat label="Průměrná objednávka" value={summary.averageOrder.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="průměrná zaplacená částka" />
        <AnalyticsStat label="Plus" value={`${summary.flexOrders}×`} note={`${summary.paidOrders ? Math.round(summary.flexOrders / summary.paidOrders * 100) : 0} % objednávek`} />
        <AnalyticsStat label="Dálniční známky" value={integerFormat.format(summary.vignettes)} note="zaplacených položek" />
        <AnalyticsStat label="Mosty a tunely" value={integerFormat.format(summary.bridgeTolls)} note="zaplacených položek" />
      </div>
      <div className="analytics-two-column"><article className="analytics-funnel surface"><div className="analytics-card-head"><div><h2>Konverzní cesta v PostHogu</h2><p>Relace; zaplacené objednávky ze Supabase jsou vedené samostatně</p></div></div>{[
        ["Vstupy do checkoutu", summary.checkouts], ["Zahájené platby", summary.paymentStarted], ["Zobrazené potvrzení platby", summary.paidViewedSessions],
      ].map(([label, value]) => <div className="funnel-row" key={label}><div><span>{label}</span><strong>{integerFormat.format(Number(value))}</strong></div><i><b style={{ width: `${Math.max(4, Number(value) / maxFunnel * 100)}%` }} /></i><small>{Math.round(Number(value) / maxFunnel * 100)} % ze vstupů</small></div>)}</article><article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Aktivita kroků</h2><p>Unikátní relace · vpravo počet událostí</p></div></div>{data.checkoutSteps.map(step => <div className="rank-row" key={step.name}><span>{analyticsLabel(step.name)} · {step.sessions} relací</span><i><b style={{ width: `${step.sessions / maxStep * 100}%` }} /></i><strong>{step.events}</strong></div>)}</article></div>
    </section>}
    {tab === "finance" && <section className="analytics-tab-content finance-analytics">
      <div className="analytics-stat-grid finance-stats">
        <AnalyticsStat label="Hrubý obrat" value={summary.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note={`${summary.paidOrders} zaplacených objednávek`} />
        <AnalyticsStat label="Hodnota produktů" value={summary.productRevenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="Produkty účtované zákazníkům" />
        <AnalyticsStat label="Servisní poplatky" value={summary.processingRevenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="Před Stripe poplatky a náklady" />
        <AnalyticsStat label="Plus" value={summary.plusRevenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note={`${summary.flexOrders} Plus objednávky`} />
        <AnalyticsStat label="Vlastní výnos před Stripe" value={summary.ownRevenueBeforePaymentFees.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="Servisní poplatky + Plus" />
        <AnalyticsStat label="Čistý zisk" value="Nelze určit" note="Chybí Stripe poplatky, refundace a reálné nákupní náklady" />
      </div>
      <div className="analytics-two-column">
        <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Rozpad podle měn</h2><p>Částky skutečně účtované zákazníkům</p></div></div>{data.financeByCurrency.map(row => <div className="finance-currency" key={row.currency}><div><strong>{row.currency}</strong><small>{row.orders} objednávek</small></div><span><b>{row.gross.toLocaleString("cs-CZ", { style: "currency", currency: row.currency })}</b><small>produkty {row.products.toLocaleString("cs-CZ", { style: "currency", currency: row.currency })} · servis {row.processing.toLocaleString("cs-CZ", { style: "currency", currency: row.currency })}{row.plus ? ` · Plus ${row.plus.toLocaleString("cs-CZ", { style: "currency", currency: row.currency })}` : ""}</small></span></div>)}</article>
        <article className="finance-limitations surface"><div className="analytics-card-head"><div><h2>Co zatím chybí</h2><p>Pro výpočet skutečného čistého zisku</p></div></div><div className="finance-missing"><span>Stripe transakční poplatky</span><strong>Nedostupné</strong></div><div className="finance-missing"><span>Refundace a chargebacky</span><strong>Nedostupné</strong></div><div className="finance-missing"><span>Skutečné nákupní náklady portálů</span><strong>Nedostupné</strong></div><p className="finance-note">Částka „Vlastní výnos před Stripe“ není čistý zisk. Po připojení Stripe API lze doplnit poplatky, refundace, payouty a čistý výnos.</p></article>
      </div>
    </section>}
    {tab === "affiliate" && (affiliateState === "loading" ? <div className="analytics-loading surface">Načítám affiliate statistiky…</div> : affiliateState === "error" || !affiliateData ? <div className="analytics-loading surface error">Affiliate statistiky se nepodařilo načíst.</div> : <section className="analytics-tab-content affiliate-analytics">
      <div className="analytics-stat-grid">
        <AnalyticsStat label="Affiliate objednávky" value={integerFormat.format(affiliateData.summary.orders)} note={`za posledních ${affiliateData.periodDays} dní`} />
        <AnalyticsStat label="Zaplacené" value={integerFormat.format(affiliateData.summary.paidOrders)} note="objednávky s přijatou platbou" />
        <AnalyticsStat label="Affiliate tržby" value={affiliateData.summary.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="celková hodnota objednávek" />
        <AnalyticsStat label="Provize" value={affiliateData.summary.commission.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="celkem přiznané provize" />
        <AnalyticsStat label="Čekající provize" value={affiliateData.summary.pendingCommission.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })} note="dosud nevyplaceno" />
      </div>
      <article className="affiliate-partners surface"><div className="analytics-card-head"><div><h2>Affiliate partneři</h2><p>Výkon za posledních {affiliateData.periodDays} dní</p></div><small>Aktualizováno {new Date(affiliateData.generatedAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</small></div>{affiliateData.partners.length ? <div className="affiliate-table"><div className="affiliate-table-head"><span>Partner</span><span>Objednávky</span><span>Tržby</span><span>Provize</span></div>{affiliateData.partners.map(partner => <div className="affiliate-table-row" key={partner.id}><span><strong>{partner.name}</strong><small>{partner.code} · {partner.commissionRate.toLocaleString("cs-CZ")} %</small></span><b>{partner.orders}</b><b>{partner.revenue.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })}</b><b>{partner.commission.toLocaleString("cs-CZ", { style: "currency", currency: "EUR" })}</b></div>)}</div> : <div className="affiliate-empty">Zatím není založený žádný affiliate partner.</div>}</article>
      {!affiliateData.summary.orders && <div className="affiliate-empty-note surface"><Activity size={20} /><div><strong>Zatím žádné affiliate nákupy</strong><span>Partner je připravený, ale žádná objednávka zatím nemá přiřazené <code>affiliate_id</code>.</span></div></div>}
    </section>)}
    {tab === "traffic" && <section className="analytics-tab-content">
      <div className="analytics-stat-grid acquisition-stats">
        <AnalyticsStat label="Relace" value={integerFormat.format(summary.sessions)} note={`${summary.visitors} unikátních návštěvníků`} />
        <AnalyticsStat label="Zobrazení / relace" value={(summary.pageviews / Math.max(summary.sessions, 1)).toLocaleString("cs-CZ", { maximumFractionDigits: 1 })} note={`${summary.pageviews} pageviews`} />
        <AnalyticsStat label="Checkout relace" value={integerFormat.format(summary.checkouts)} note={`${Math.round(summary.checkouts / Math.max(summary.sessions, 1) * 100)} % relací s pageview`} />
        <AnalyticsStat label="Mobilní návštěvníci" value={`${Math.round((data.devices.find(device => device.name === "Mobile")?.visitors ?? 0) / Math.max(summary.visitors, 1) * 100)} %`} note="podle pageview identity" />
      </div>
      <div className="analytics-two-column acquisition-primary">
        <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Výkon kanálů</h2><p>Relace · checkout · zahájení platby</p></div></div>{data.sources.map(source => <div className="channel-row" key={source.name}><div><strong>{analyticsLabel(source.name)}</strong><small>{source.visitors} lidí</small></div><span><b>{source.sessions}</b><small>relací</small></span><span><b>{source.checkouts}</b><small>checkout</small></span><span><b>{source.payments}</b><small>platba</small></span><em>{Math.round(source.checkouts / Math.max(source.sessions, 1) * 100)} %</em></div>)}</article>
        <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Vstupní stránky</h2><p>První pageview relace · checkouty v závorce</p></div></div>{data.landingPages.map(page => <div className="rank-row" key={page.path}><span><code>{page.path}</code> · {page.visitors} lidí</span><i><b style={{ width: `${page.sessions / maxLanding * 100}%` }} /></i><strong>{page.sessions} ({page.checkouts})</strong></div>)}</article>
      </div>
      <article className="hourly-card surface"><div className="analytics-card-head"><div><h2>Aktivita během dne</h2><p>Europe/Prague · relace s pageview, zeleně checkouty</p></div></div><div className="hourly-chart">{Array.from({ length: 24 }, (_, hour) => data.hourly.find(row => row.hour === hour) ?? { hour, sessions: 0, checkouts: 0 }).map(row => <div className="hour-column" key={row.hour}><div><i style={{ height: `${Math.max(2, row.sessions / maxHourly * 100)}%` }}><b style={{ height: `${Math.min(100, row.checkouts / Math.max(row.sessions, 1) * 100)}%` }} /></i></div><strong>{row.sessions}</strong><small>{String(row.hour).padStart(2, "0")}</small></div>)}</div></article>
      <div className="analytics-traffic-grid">
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Země návštěvníků</h2><p>Podle geolokace</p></div></div>{data.countries.map(country => <div className="device-row country-analytics" key={country.name}><span><Flag code={country.name} />{country.name}</span><strong>{country.visitors}</strong></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Zařízení</h2><p>Unikátní návštěvníci</p></div></div>{data.devices.map(device => <div className="device-row" key={device.name}><span>{analyticsLabel(device.name)}</span><strong>{device.visitors}</strong></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Prohlížeče</h2><p>Unikátní návštěvníci</p></div></div>{data.browsers.map(browser => <div className="device-row" key={browser.name}><span>{browser.name}</span><strong>{browser.visitors}</strong></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Jazyky</h2><p>Jazyk prohlížeče</p></div></div>{data.languages.map(language => <div className="device-row" key={language.name}><span>{language.name.toUpperCase()}</span><strong>{language.visitors}</strong></div>)}</article>
      <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Nejnavštěvovanější stránky</h2><p>Zobrazení stránek</p></div></div>{data.pages.map(page => <div className="device-row" key={page.path}><code>{page.path}</code><strong>{page.views}</strong></div>)}</article>
      </div>
    </section>}
    {tab === "behavior" && <section className="analytics-tab-content">
      <div className="analytics-stat-grid behavior-stats">
        <AnalyticsStat label="Rage clicky" value={integerFormat.format(summary.rageClicks)} note="opakované agresivní klikání" />
        <AnalyticsStat label="Chyby validace" value={integerFormat.format(summary.validationFailures)} note="neplatné nebo chybějící údaje" />
        <AnalyticsStat label="Chyby plateb" value={integerFormat.format(summary.paymentFailures)} note="checkout_payment_failed" />
        <AnalyticsStat label="Varování" value={integerFormat.format(summary.warnings)} note="zobrazená upozornění" />
        <AnalyticsStat label="Opuštění checkoutu" value={integerFormat.format(summary.checkoutLeft)} note="checkout_left" />
        <AnalyticsStat label="Návraty" value={integerFormat.format(summary.checkoutReturned)} note="checkout_returned" />
      </div>
      <div className="analytics-two-column"><article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Vyhledání trasy</h2><p>Průchod plánovačem</p></div></div>{[
        ["Zahájená vyhledávání", summary.routeSearches], ["Spočítané trasy", summary.routesCalculated],
      ].map(([label, value]) => <div className="funnel-row" key={label}><div><span>{label}</span><strong>{integerFormat.format(Number(value))}</strong></div><i><b style={{ width: `${Math.max(4, Number(value) / Math.max(summary.routeSearches, 1) * 100)}%` }} /></i><small>{Math.round(Number(value) / Math.max(summary.routeSearches, 1) * 100)} %</small></div>)}</article><article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Nejčastější chyby</h2><p>Validace formulářů</p></div></div>{data.validationIssues.map(issue => <div className="issue-row" key={`${issue.step}:${issue.reason}`}><div><strong>{analyticsLabel(issue.reason)}</strong><small>{analyticsLabel(issue.step)}</small></div><b>{issue.count}×</b></div>)}</article></div>
    </section>}
    {tab === "quality" && <section className="analytics-tab-content quality-tab">
      <div className="analytics-stat-grid quality-stats">
        <AnalyticsStat label="Pokrytí checkout identit" value={`${Math.round(data.dataQuality.checkoutIdentitiesWithPageview / Math.max(data.dataQuality.checkoutIdentities, 1) * 100)} %`} note={`${data.dataQuality.checkoutIdentitiesWithPageview} z ${data.dataQuality.checkoutIdentities} má pageview`} />
        <AnalyticsStat label="Duplicitní checkout relace" value={integerFormat.format(data.dataQuality.checkoutSessionsWithDuplicates)} note={`maximum ${data.dataQuality.maxCheckoutEventsPerSession} událostí v relaci`} />
        <AnalyticsStat label="UTM pokrytí" value={`${Math.round(data.dataQuality.pageviewsWithUtmSource / Math.max(summary.pageviews, 1) * 100)} %`} note={`${data.dataQuality.pageviewsWithUtmSource} z ${summary.pageviews} pageviews`} />
        <AnalyticsStat label="Relace s pageview" value={`${Math.round(data.dataQuality.pageviewSessions / Math.max(data.dataQuality.sessionsWithAnyEvent, 1) * 100)} %`} note={`${data.dataQuality.pageviewSessions} z ${data.dataQuality.sessionsWithAnyEvent} sledovaných relací`} />
      </div>
      <div className="analytics-two-column">
        <article className="quality-audit surface"><div className="analytics-card-head"><div><h2>Audit měření</h2><p>Automaticky odvozené kontroly z živých dat</p></div></div>{[
          { label: "Checkout identity mají odpovídající pageview", value: `${data.dataQuality.checkoutIdentitiesWithPageview}/${data.dataQuality.checkoutIdentities}`, ok: data.dataQuality.checkoutIdentitiesWithPageview === data.dataQuality.checkoutIdentities },
          { label: "checkout_entered je jednou za relaci", value: `${data.dataQuality.checkoutSessionsWithDuplicates} duplicit`, ok: data.dataQuality.checkoutSessionsWithDuplicates === 0 },
          { label: "Kampaně používají UTM source", value: `${data.dataQuality.pageviewsWithUtmSource} pageviews`, ok: data.dataQuality.pageviewsWithUtmSource > 0 },
          { label: "fbclid je zachycen a atribuován", value: `${data.dataQuality.fbclidVisitors} návštěvníků`, ok: true },
          { label: "Historické srovnání je dostupné", value: data.comparisonAvailable ? "ano" : "zatím ne", ok: data.comparisonAvailable },
        ].map(check => <div className={`audit-row ${check.ok ? "ok" : "warn"}`} key={check.label}><i>{check.ok ? "✓" : "!"}</i><span><strong>{check.label}</strong><small>{check.value}</small></span></div>)}</article>
        <article className="analytics-list surface"><div className="analytics-card-head"><div><h2>Objem událostí</h2><p>Události · relace · identity</p></div></div>{data.events.map(event => <div className="event-row" key={event.name}><code>{event.name}</code><span>{event.events}<small>událostí</small></span><span>{event.sessions}<small>relací</small></span><span>{event.visitors}<small>identit</small></span></div>)}</article>
      </div>
    </section>}
  </main>;
}

function LiveLog({ expand, expanded = false }: { expand: () => void; expanded?: boolean }) {
  const [selected, setSelected] = useState("");
  const [expandedGroup, setExpandedGroup] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const technicalRowRefs = useRef(new Map<string, HTMLDivElement>());
  const [paused, setPaused] = useState(false);
  const [liveLogs, setLiveLogs] = useState<WorkerLogEntry[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "offline">("connecting");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    const events = new EventSource(workerEventsUrl);
    const addLogs = (incoming: WorkerLogEntry[]) => {
      setLiveLogs((current) => {
        const byId = new Map([...incoming, ...current].map((entry) => [workerLogId(entry), entry]));
        return [...byId.values()]
          .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
          .slice(0, 500);
      });
      setConnection("live");
    };
    const receiveLog = (event: Event) => {
      try {
        addLogs([JSON.parse((event as MessageEvent<string>).data) as WorkerLogEntry]);
      } catch {
        // Ignore a malformed line and keep the stream connected.
      }
    };
    const receiveSnapshot = (event: Event) => {
      try {
        const snapshot = JSON.parse((event as MessageEvent<string>).data) as { logs?: WorkerLogEntry[] };
        if (Array.isArray(snapshot.logs)) addLogs(snapshot.logs);
        else setConnection("live");
      } catch {
        // A following log event can still establish the connection.
      }
    };
    events.addEventListener("log", receiveLog);
    events.addEventListener("snapshot", receiveSnapshot);
    events.onopen = () => setConnection("live");
    events.onerror = () => setConnection("offline");
    void fetch("/api/worker/logs", { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Logs API ${response.status}`);
        return response.json() as Promise<{ logs?: WorkerLogEntry[] }>;
      })
      .then((payload) => {
        if (active && Array.isArray(payload.logs)) addLogs(payload.logs);
      })
      .catch(() => {
        // The SSE stream can still connect; demo data remain visible meanwhile.
      });
    return () => {
      active = false;
      events.close();
    };
  }, []);

  const technicalLogs: TechnicalLog[] = liveLogs.map((entry) => ({
        eventId: workerLogId(entry),
        time: formatLogTime(entry.ts),
        level: entry.level,
        text: formatWorkerLog(entry),
      }));
  const latestLogAt = liveLogs[0]?.ts;
  const humanGroups: HumanLogGroup[] = buildHumanLogGroups(liveLogs);

  const selectTechnicalLog = (eventId: string) => {
    setSelected(eventId);
    window.requestAnimationFrame(() => {
      technicalRowRefs.current.get(eventId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  useEffect(() => {
    if (!paused && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [liveLogs, paused]);

  return (
    <section className="live-log surface">
      <div className="log-head"><div><span className={`live-dot ${connection}`} /><strong>Živý log</strong>{connection === "live" && latestLogAt && <span className="log-last-event">Poslední událost {statusDate(latestLogAt)}</span>}{connection !== "live" && <span className="paused">{connection === "connecting" ? "Připojuji" : "Worker je offline"}</span>}{paused && <span className="paused">Pozastaveno</span>}</div><button onClick={expand}>{expanded ? "Zmenšit" : "Zvětšit"}{expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button></div>
      <div className="log-grid">
        <div className="human-log">
          <h3>Průběh</h3>
          <div className="human-groups">
            {humanGroups.map(group => <div className={`human-group ${expandedGroup === group.id ? "open" : ""}`} key={group.id}>
              <button className="log-group-toggle" onClick={() => setExpandedGroup(expandedGroup === group.id ? "" : group.id)}>
                <Flag code={group.country} />
                <strong>{group.country} · {group.plate}</strong>
                <span className={`group-result ${group.status}`}>{group.totalAttempts > 1 ? `Pokus ${group.attempt} · ` : ""}{group.status === "done" ? "Dokončeno" : group.status === "failed" ? "Selhalo" : "Probíhá"} · {group.status === "processing" ? compactDuration(group.startedAt, new Date(now).toISOString()) : group.duration}</span>
                {expandedGroup === group.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </button>
              {expandedGroup === group.id && <div className="group-steps">{group.events.map(event => <button key={event.id} className={selected === event.id ? "selected" : ""} onClick={() => selectTechnicalLog(event.id)}><time>{event.time}</time><span className={event.tone}>{event.label}</span>{event.rawCount > 1 && <em>{event.rawCount} záznamů</em>}</button>)}</div>}
            </div>)}
            {!humanGroups.length && <div className="empty-log-groups">V dostupném logu zatím není žádná položka se SPZ.</div>}
          </div>
        </div>
        <div className="technical-log" ref={scrollRef} onScroll={e => setPaused(e.currentTarget.scrollTop > 8)}>
          <h3>Technický log</h3>
          {technicalLogs.map((log, index) => <div ref={(node) => { if (node) technicalRowRefs.current.set(log.eventId, node); else technicalRowRefs.current.delete(log.eventId); }} key={`${log.time}-${index}`} className={`${selected === log.eventId ? "selected" : ""} ${log.level}`}><time>{log.time}</time><code>{log.text}</code></div>)}
        </div>
      </div>
    </section>
  );
}

const dismissedAttentionStorageKey = "egp-dismissed-attention-incidents";

function Dashboard({ orderData, navigate, openOrder }: { orderData: Order[]; navigate: (view: View) => void; openOrder: (order: Order) => void }) {
  const workers = useWorkerStatusSnapshot();
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [editorialIncidents, setEditorialIncidents] = useState<DashboardIncident[]>([]);
  const [dismissedIncidentIds, setDismissedIncidentIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(window.sessionStorage.getItem(dismissedAttentionStorageKey) ?? "[]") as string[]); }
    catch { return new Set(); }
  });
  useEffect(() => {
    let active = true;
    const load = () => void fetch("/api/editorial/topics", { headers: { Accept: "application/json" } }).then(response => response.ok ? response.json() as Promise<{ topics?: Array<{ id: string; topic: string; status: string; last_error?: string | null }> }> : Promise.reject()).then(payload => {
      if (!active) return;
      const topics = payload.topics ?? [];
      const review = topics.filter(topic => topic.status === "review");
      const failed = topics.filter(topic => topic.status === "failed");
      const incidents: DashboardIncident[] = [];
      if (review.length) incidents.push({ id: `editorial:review:${review.map(topic => topic.id).join(",")}`, tone: "warning", title: `${review.length} článků čeká na kontrolu`, detail: "Otevři redakci a zkontroluj české koncepty", target: "editorial" });
      failed.forEach(topic => incidents.push({ id: `editorial:failed:${topic.id}`, tone: "error", title: "Generování článku selhalo", detail: topic.last_error || topic.topic, target: "editorial" }));
      setEditorialIncidents(incidents);
    }).catch(() => undefined);
    load(); const timer = window.setInterval(load, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const fullOverview = useMemo(() => { const base = buildDashboardOverview(orderData, workers); return { ...base, incidents: [...editorialIncidents, ...base.incidents] }; }, [editorialIncidents, orderData, workers]);
  const overview = useMemo(() => ({ ...fullOverview, incidents: fullOverview.incidents.filter(incident => !dismissedIncidentIds.has(incident.id)) }), [dismissedIncidentIds, fullOverview]);
  useEffect(() => {
    const clear = () => {
      setDismissedIncidentIds(current => {
        const next = new Set([...current, ...fullOverview.incidents.map(incident => incident.id)]);
        window.sessionStorage.setItem(dismissedAttentionStorageKey, JSON.stringify([...next]));
        return next;
      });
      setAttentionOpen(false);
    };
    window.addEventListener("egp-clear-attention", clear);
    return () => window.removeEventListener("egp-clear-attention", clear);
  }, [fullOverview.incidents]);
  const openIncident = (incident: DashboardIncident) => {
    if (incident.orderId) {
      const order = orderData.find(candidate => candidate.id === incident.orderId);
      if (order) {
        openOrder(order);
        return;
      }
    }
    navigate(incident.target ?? "logs");
  };

  return (
    <main className="dashboard-grid">
      <OrderColumn orderData={orderData} openOrder={openOrder} showAll={() => navigate("orders")} />
      <div className="workspace">
        <div className="dashboard-overview">
          <DailySummaryCard overview={overview} onOpenAttention={() => setAttentionOpen(true)} />
          <EditorialPreview onOpen={() => navigate("editorial")} />
          <PostHogPreview onOpen={() => navigate("posthog")} />
        </div>
        <LiveLog expand={() => navigate("logs")} />
      </div>
      {attentionOpen && <AttentionCenter incidents={overview.incidents} onOpen={openIncident} onClose={() => setAttentionOpen(false)} />}
    </main>
  );
}

function BackButton({ onClick }: { onClick: () => void }) { return <button className="back-button" onClick={onClick}><ArrowLeft size={18} /> Zpět</button>; }

function OrderDetail({ order, back, navigate, onItemFulfilled }: { order: Order; back: () => void; navigate: (view: View) => void; onItemFulfilled: (itemId: string, fulfilledAt: string) => void }) {
  const [expanded, setExpanded] = useState("");
  const [orderLogs, setOrderLogs] = useState<WorkerLogEntry[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [fulfillOpen, setFulfillOpen] = useState(false);
  const [fulfillItemId, setFulfillItemId] = useState("");
  const [fulfillState, setFulfillState] = useState<"idle" | "saving" | "error">("idle");
  const [manualAudit, setManualAudit] = useState<ManualFulfillmentAudit[]>([]);
  const [auditVersion, setAuditVersion] = useState(0);

  const confirmFulfilled = async () => {
    const item = order.items.find(candidate => candidate.id === fulfillItemId);
    if (!item?.id || !item.source) return;
    setFulfillState("saving");
    try {
      const response = await fetch("/api/orders/fulfill-item", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ orderId: order.id, itemId: item.id, source: item.source }) });
      const payload = await response.json() as { ok?: boolean; fulfilledAt?: string };
      if (!response.ok || !payload.ok || !payload.fulfilledAt) throw new Error();
      onItemFulfilled(item.id, payload.fulfilledAt);
      setFulfillOpen(false);
      setFulfillItemId("");
      setFulfillState("idle");
      setAuditVersion(version => version + 1);
    } catch {
      setFulfillState("error");
    }
  };

  useEffect(() => {
    if (!order.items.some(item => item.status === "processing" && item.engineSubmittedAt)) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [order]);

  useEffect(() => {
    let active = true;
    void fetch("/api/worker/logs", { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Logs API ${response.status}`);
        return response.json() as Promise<{ logs?: WorkerLogEntry[] }>;
      })
      .then((payload) => {
        if (active && Array.isArray(payload.logs)) setOrderLogs(payload.logs);
      })
      .catch(() => {
        if (active) setOrderLogs([]);
      });
    return () => { active = false; };
  }, [order.id]);

  useEffect(() => {
    let active = true;
    void fetch(`/api/manual-fulfillment-audit?orderId=${encodeURIComponent(order.id)}`, { headers: { Accept: "application/json" } })
      .then(response => response.ok ? response.json() as Promise<{ entries?: ManualFulfillmentAudit[] }> : Promise.reject())
      .then(payload => { if (active) setManualAudit(Array.isArray(payload.entries) ? payload.entries : []); })
      .catch(() => { if (active) setManualAudit([]); });
    return () => { active = false; };
  }, [order.id, auditVersion]);

  return (
    <main className="page-shell">
      <BackButton onClick={back} />
      <section className={`detail-hero ${order.status}`}>
        <div className="hero-plate"><Flag code={order.registrationCode} large /><div><small>{shortId(order.id)}</small><h1>{order.plate}</h1><p>{order.registrationCountry}</p>{order.plus && <span className="plus-badge"><Plus size={13} strokeWidth={3} /> Plus</span>}</div></div>
        <div className="hero-data"><div><small>E-mail zákazníka</small><strong>{order.email}</strong></div><div><small>Číslo objednávky</small><strong>{order.number}</strong></div><div><small>Vytvořeno</small><strong>{order.createdAt}</strong></div><div><small>Typ vozidla</small><strong>{vehicleLabel(order.vehicleType)}</strong></div><div><small>Typ paliva</small><strong>{fuelLabel(order.fuelType)}</strong></div>{order.vin && <div><small>VIN</small><strong>{order.vin}</strong></div>}</div>
        <div className="hero-total"><span className={`status-tag ${order.status}`}>{statusLabels[order.status]}</span><strong>{money(order.total, order.currency)}</strong><small className="hero-profit">({profitMoney(order)})</small><small className="paid-at">Zaplaceno {order.paidAt}</small>{order.originalPendingCreatedAt && <small className="original-pending-created">Vytvořeno {order.originalPendingCreatedAt}</small>}</div>
        <div className="hero-actions"><button><Download size={16} /> Stáhnout vše</button><button><FileText size={16} /> PDF souhrn</button><button onClick={() => navigate("screenshots")}>Screenshoty</button><button onClick={() => navigate("documents")}>Doklady</button><button className="manual-fulfilled" onClick={() => { setFulfillItemId(""); setFulfillState("idle"); setFulfillOpen(true); }}><CheckCircle2 size={16} /> FULFILLED</button></div>
      </section>
      <section className="items-section">
        <div className="section-heading"><div><span className="eyebrow">Obsah objednávky</span><h2>Známky, mosty a placené úseky</h2></div><span className="count">{order.items.length}</span></div>
        {order.items.map(item => {
          const timeline = buildItemTimeline(order.id, item, orderLogs);
          const itemKey = item.id ?? `${item.source}-${item.country}-${item.product}`;
          const dateLabel = item.itemKind && item.itemKind !== "vignette" ? `Průjezd ${item.validFrom}` : `${item.validFrom} – ${item.validTo}`;
          return <article className={`item-card ${item.status}`} key={itemKey}>
            <button className="item-summary" onClick={() => setExpanded(expanded === itemKey ? "" : itemKey)}>
              <span className="country-flag"><Flag code={item.country} /></span><div><strong>{item.product} · {item.displayCode ?? item.country}</strong><span>{dateLabel}</span></div>
              <div><strong>{money(item.price)}</strong><span>{item.status === "processing" && item.engineSubmittedAt ? compactDuration(item.engineSubmittedAt, new Date(now).toISOString()) : item.duration ?? "Čeká"}</span></div><span className={`status-tag ${item.status}`}>{statusLabels[item.status]}</span>{expanded === itemKey ? <ChevronDown /> : <ChevronRight />}
            </button>
            {expanded === itemKey && <div className="item-detail"><div className="timeline">{timeline.map(event => <div className={event.status} key={event.id}><i /><span><b>{event.label}</b><small>{timelineTime(event.ts)}</small></span></div>)}</div>{item.status === "failed" && <div className="error-summary"><strong>{item.lastError || "Worker neuložil podrobné chybové hlášení."}</strong><p>Stav Wise Workeru v okamžiku chyby není v dostupných datech potvrzený.</p>{item.lastError && <details><summary>Zobrazit technický detail</summary><code>{item.lastError}</code></details>}</div>}</div>}
          </article>;
        })}
      </section>
      <section className="manual-audit-section">
        <div className="section-heading"><div><span className="eyebrow">Doklady a ruční zásahy</span><h2>Historie ručního FULFILLED</h2></div><span className="count">{manualAudit.length}</span></div>
        <div className="manual-audit-list surface">
          {manualAudit.length ? manualAudit.map(entry => <article key={entry.id}>
            <span className="manual-audit-icon"><CheckCircle2 size={17} /></span>
            <div><strong>{entry.country_code ? `${entry.country_code} · ` : ""}Označeno ručně jako FULFILLED</strong><small>Předchozí stav: {entry.previous_status || "neuveden"}</small></div>
            <div className="manual-audit-who"><strong>{entry.actor_email}</strong><time>{statusDate(entry.fulfilled_at)}</time></div>
          </article>) : <div className="manual-audit-empty">U této objednávky zatím nebyl proveden žádný ruční FULFILLED.</div>}
        </div>
      </section>
      {fulfillOpen && <div className="manual-fulfill-modal" role="presentation" onMouseDown={() => fulfillState !== "saving" && setFulfillOpen(false)}><section className="manual-fulfill-dialog surface" role="dialog" aria-modal="true" aria-labelledby="manual-fulfill-title" onMouseDown={event => event.stopPropagation()}><button className="manual-fulfill-close" onClick={() => setFulfillOpen(false)} aria-label="Zavřít"><X size={18} /></button><span className="manual-fulfill-icon"><CheckCircle2 size={22} /></span><h2 id="manual-fulfill-title">Označit jako FULFILLED</h2><p>Vyber konkrétní položku, kterou jsi ručně dokončil. Změna se zapíše přímo do Supabase.</p><div className="manual-country-list">{order.items.map(item => <button key={item.id ?? `${item.source}-${item.country}-${item.product}`} className={fulfillItemId === item.id ? "selected" : ""} disabled={!item.id || !item.source || fulfillState === "saving"} onClick={() => { setFulfillItemId(item.id ?? ""); setFulfillState("idle"); }}><Flag code={item.country} /><span><strong>{item.product}</strong><small>{item.displayCode ?? item.country}</small></span><i /></button>)}</div>{fulfillState === "error" && <div className="manual-fulfill-error">Zápis se nepodařil. Zkus to prosím znovu.</div>}<div className="manual-fulfill-actions"><button onClick={() => setFulfillOpen(false)} disabled={fulfillState === "saving"}>Zrušit</button><button className="confirm" onClick={() => void confirmFulfilled()} disabled={!fulfillItemId || fulfillState === "saving"}>{fulfillState === "saving" ? "Ukládám…" : "Potvrdit FULFILLED"}</button></div></section></div>}
    </main>
  );
}

function AllOrders({ orderData, back, openOrder }: { orderData: Order[]; back: () => void; openOrder: (order: Order) => void }) {
  const [query, setQuery] = useState("");
  const normalized = query.toUpperCase().replace(/[\s-]/g, "");
  const filtered = useMemo(() => orderData.filter(o => !query || `${o.id}${o.plate.replace(/[\s-]/g, "")}${o.email}`.toUpperCase().includes(normalized)), [normalized, query, orderData]);
  return <main className="page-shell"><BackButton onClick={back} /><div className="page-title"><div><span className="eyebrow">Supabase</span><h1>Všechny objednávky</h1></div><label className="search wide"><Search size={18} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Hledat SPZ, ID nebo e-mail" /></label></div><div className="orders-gallery">{filtered.map(o => <OrderCard key={o.id} order={o} onOpen={() => openOrder(o)} />)}</div><button className="load-more">Načíst další</button></main>;
}

type TreeKind = "screenshots" | "documents";
type ScreenshotFile = { index: number; name: string; file: string; url: string };
type DashboardDocument = {
  id: string;
  orderId: string;
  group: "egp_invoice" | "official_receipt";
  label: string;
  filename: string;
  contentType: string;
  url: string;
  countryCode?: string;
  receivedAt?: string;
  orderDate?: string;
  plate?: string;
};
type ScreenshotRun = {
  id: string;
  source: string;
  itemId: string;
  orderId: string;
  country: string;
  plate: string;
  date: string;
  success: boolean;
  uploadedAt: string;
  files: ScreenshotFile[];
};

const screenshotStepLabels: Record<string, string> = {
  home: "Úvodní stránka",
  landing: "Úvodní stránka",
  vehicle: "Údaje o vozidle",
  vignette: "Výběr známky",
  product: "Výběr produktu",
  summary: "Souhrn objednávky",
  payment: "Platba",
  confirmation: "Potvrzení nákupu",
};

function storageDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("cs-CZ");
}

const regionNames = new Intl.DisplayNames(["cs"], { type: "region" });

function countryName(code: string) {
  return code === "XX" ? "Nezařazené" : regionNames.of(code) ?? code;
}

function useExplorerWidth() {
  const [width, setWidth] = useState(() => {
    const saved = Number(window.localStorage.getItem("egp-explorer-width"));
    return Number.isFinite(saved) && saved >= 230 && saved <= 560 ? saved : 330;
  });
  const startResize = (startX: number) => {
    const startWidth = width;
    document.body.classList.add("resizing-explorer");
    const move = (event: PointerEvent) => {
      const max = Math.min(560, Math.round(window.innerWidth * .48));
      setWidth(Math.max(230, Math.min(max, startWidth + event.clientX - startX)));
    };
    const stop = () => {
      document.body.classList.remove("resizing-explorer");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  useEffect(() => {
    window.localStorage.setItem("egp-explorer-width", String(width));
  }, [width]);
  return { width, startResize };
}

function ScreenshotTree({ baseOrder, back }: { baseOrder: Order; back: () => void }) {
  const [runs, setRuns] = useState<ScreenshotRun[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [expandedDates, setExpandedDates] = useState<Set<string>>(() => new Set());
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<ScreenshotFile | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const explorer = useExplorerWidth();

  useEffect(() => {
    let active = true;
    void fetch("/api/screenshots", { headers: { Accept: "application/json" } })
      .then((response) => {
        if (!response.ok) throw new Error(`Screenshot API ${response.status}`);
        return response.json() as Promise<{ runs?: ScreenshotRun[] }>;
      })
      .then((payload) => {
        if (!active) return;
        const next = Array.isArray(payload.runs) ? payload.runs : [];
        setRuns(next);
        setSelectedId("");
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => { active = false; };
  }, [baseOrder.id]);

  const selected = runs.find((run) => run.id === selectedId);
  const dates = [...new Set(runs.map((run) => run.date))];
  const toggleDate = (date: string) => setExpandedDates(current => {
    const next = new Set(current);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });
  const toggleOrder = (key: string) => setExpandedOrders(current => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return <main className="page-shell"><BackButton onClick={back} /><section className="file-browser surface" style={{ "--tree-width": `${explorer.width}px` } as CSSProperties}><nav className="tree">
    {dates.map(date => {
      const dateOpen = expandedDates.has(date);
      return <div className="tree-date" key={date}><button className={dateOpen ? "open" : ""} onClick={() => toggleDate(date)}><span className="tree-chevron">{dateOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{dateOpen ? <FolderOpen size={18} /> : <Folder size={18} />}{storageDate(date)}</button>
      {dateOpen && [...new Set(runs.filter(run => run.date === date).map(run => run.orderId))].map(orderId => {
        const orderRuns = runs.filter(run => run.date === date && run.orderId === orderId);
        const plate = orderRuns.find(run => run.plate)?.plate;
        const orderKey = `${date}:${orderId}`;
        const orderOpen = expandedOrders.has(orderKey);
        return <div className="tree-order" key={orderId}><button className={`level-1 ${orderOpen ? "open" : ""}`} onClick={() => toggleOrder(orderKey)} title={`${orderId}${plate ? ` · ${plate}` : ""}`}><span className="tree-chevron">{orderOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{orderOpen ? <FolderOpen size={18} /> : <Folder size={18} />}<span className="tree-order-label"><code>{orderId}</code>{plate && <small>{plate}</small>}</span></button>
          {orderOpen && orderRuns.map(run => <button key={run.id} className={`level-2 ${selectedId === run.id ? "selected" : ""}`} onClick={() => setSelectedId(run.id)}><span className="tree-chevron spacer" />{selectedId === run.id ? <FolderOpen size={18} /> : <Folder size={18} />}<Flag code={run.country} /><span>{run.country}</span></button>)}
        </div>;
      })}
    </div>;
    })}
    {state === "loading" && <div className="tree-state">Načítám screenshoty…</div>}
    {state === "ready" && !runs.length && <div className="tree-state">V Supabase zatím nejsou žádné screenshoty.</div>}
    {state === "error" && <div className="tree-state error">Screenshoty se nepodařilo načíst.</div>}
  </nav><div className="explorer-resizer" onPointerDown={event => { event.preventDefault(); explorer.startResize(event.clientX); }} role="separator" aria-orientation="vertical" aria-label="Změnit šířku stromu" /><div className="file-content">
    {selected ? <><div className="file-path">{storageDate(selected.date)} <ChevronRight size={14} /> <code>{selected.orderId}</code> <ChevronRight size={14} /> <b>{selected.country}</b></div><div className="files">{selected.files.map(file => <button key={file.file} onClick={() => setPreview(file)}><span className="file-thumb actual"><img src={file.url} alt={screenshotStepLabels[file.name] ?? file.name} loading="lazy" /></span><strong>{String(file.index).padStart(2, "0")} – {screenshotStepLabels[file.name] ?? file.name}</strong></button>)}</div></> : <div className="empty-files">{state === "loading" ? "Načítám…" : "Vyber složku se screenshoty."}</div>}
  </div></section>{preview && selected && <div className="preview-modal" onClick={() => setPreview(null)}><div className="screenshot-preview" onClick={event => event.stopPropagation()}><button className="close" onClick={() => setPreview(null)}><X /></button><img className="large-screenshot" src={preview.url} alt={screenshotStepLabels[preview.name] ?? preview.name} /><div className="preview-footer"><div><strong>{screenshotStepLabels[preview.name] ?? preview.name}</strong><span>{selected.country} · {selected.plate || shortId(selected.orderId)}</span></div><a className="download" href={preview.url} download={preview.file}><Download size={16} /> Stáhnout</a></div></div></div>}</main>;
}

function DocumentOrderFolders({ files, selected, onSelect }: { files: DashboardDocument[]; selected: string; onSelect: (key: string) => void }) {
  const [officialOpen, setOfficialOpen] = useState(false);
  const orderId = files[0]?.orderId ?? "";
  const official = files.filter(file => file.group === "official_receipt");
  const countries = [...new Set(official.map(file => file.countryCode ?? "XX"))].sort((a, b) => countryName(a).localeCompare(countryName(b), "cs"));
  const invoiceKey = `${orderId}|egp_invoice`;
  return <>
    {official.length > 0 && <><button className="level-2" onClick={() => setOfficialOpen(open => !open)}><span className="tree-chevron">{officialOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{officialOpen ? <FolderOpen size={18} /> : <Folder size={18} />}<span>Doklady z portálů</span></button>{officialOpen && countries.map(country => { const key = `${orderId}|official_receipt|${country}`; return <button className={`level-3 ${selected === key ? "selected" : ""}`} key={country} onClick={() => onSelect(key)}><span className="tree-chevron spacer" /><Folder size={18} />{country !== "XX" && <Flag code={country} />}<span>{country === "XX" ? countryName(country) : country}</span></button>; })}</>}
    {files.some(file => file.group === "egp_invoice") && <button className={`level-2 ${selected === invoiceKey ? "selected" : ""}`} onClick={() => onSelect(invoiceKey)}><span className="tree-chevron spacer" /><FileText size={18} /><span>Faktury EuroGoPass</span></button>}
  </>;
}

function DocumentsArchive({ back }: { back: () => void }) {
  const [documents, setDocuments] = useState<DashboardDocument[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [datesOpen, setDatesOpen] = useState<Set<string>>(() => new Set());
  const [ordersOpen, setOrdersOpen] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState("");
  const explorer = useExplorerWidth();
  useEffect(() => { let active = true; void fetch("/api/documents", { headers: { Accept: "application/json" } }).then(response => { if (!response.ok) throw new Error(); return response.json() as Promise<{ documents?: DashboardDocument[] }>; }).then(payload => { if (active) { setDocuments(payload.documents ?? []); setState("ready"); } }).catch(() => { if (active) setState("error"); }); return () => { active = false; }; }, []);
  const toggle = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, key: string) => setter(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const dates = [...new Set(documents.map(file => file.orderDate).filter((date): date is string => Boolean(date)))].sort().reverse();
  const [selectedOrder = "", selectedGroup = "", selectedCountry = ""] = selected.split("|");
  const visible = documents.filter(file => file.orderId === selectedOrder && file.group === selectedGroup && (selectedGroup !== "official_receipt" || (file.countryCode ?? "XX") === selectedCountry));
  return <main className="page-shell"><BackButton onClick={back} /><section className="file-browser surface" style={{ "--tree-width": `${explorer.width}px` } as CSSProperties}><nav className="tree">{dates.map(date => <div className="tree-date" key={date}><button onClick={() => toggle(setDatesOpen, date)}><span className="tree-chevron">{datesOpen.has(date) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{datesOpen.has(date) ? <FolderOpen size={18} /> : <Folder size={18} />}{storageDate(date)}</button>{datesOpen.has(date) && [...new Set(documents.filter(file => file.orderDate === date).map(file => file.orderId))].map(orderId => { const files = documents.filter(file => file.orderId === orderId); const key = `${date}|${orderId}`; return <div className="tree-order" key={orderId}><button className="level-1" onClick={() => toggle(setOrdersOpen, key)}><span className="tree-chevron">{ordersOpen.has(key) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>{ordersOpen.has(key) ? <FolderOpen size={18} /> : <Folder size={18} />}<span className="tree-order-label"><code>{orderId}</code>{files[0]?.plate && <small>{files[0].plate}</small>}</span></button>{ordersOpen.has(key) && <DocumentOrderFolders files={files} selected={selected} onSelect={setSelected} />}</div>; })}</div>)}{state === "loading" && <div className="tree-state">Načítám doklady…</div>}{state === "ready" && !documents.length && <div className="tree-state">Nejsou uložené žádné doklady.</div>}{state === "error" && <div className="tree-state error">Doklady se nepodařilo načíst.</div>}</nav><div className="explorer-resizer" onPointerDown={event => { event.preventDefault(); explorer.startResize(event.clientX); }} role="separator" /><div className="file-content">{visible.length ? <><div className="file-path"><code>{selectedOrder}</code>{selectedCountry && <><ChevronRight size={14} /><b>{countryName(selectedCountry)}</b></>}</div><div className="files">{visible.map(file => <a href={file.url} download={file.filename} key={file.id}><span className="file-thumb"><FileText /></span><strong>{file.label}</strong><small>{file.filename}</small><Download size={16} /></a>)}</div></> : <div className="empty-files">{state === "loading" ? "Načítám…" : "Vyber složku s doklady."}</div>}</div></section></main>;
}

function FileTree({ kind, baseOrder, back }: { kind: TreeKind; baseOrder: Order; back: () => void }) {
  return kind === "screenshots"
    ? <ScreenshotTree baseOrder={baseOrder} back={back} />
    : <DocumentsArchive back={back} />;
}

function FullLogs({ back }: { back: () => void }) { return <main className="page-shell log-page"><LiveLog expand={back} expanded /></main>; }

function DashboardApp({ onLogout }: { onLogout: () => void }) {
  const initialRoute = useMemo(() => routeFromPath(), []);
  const [view, setView] = useState<View>(initialRoute.view);
  const [routeOrderId, setRouteOrderId] = useState(initialRoute.orderId ?? "");
  const [routeArticleId, setRouteArticleId] = useState(initialRoute.articleId ?? "");
  const [orderData, setOrderData] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order>(demoOrders[0]);
  useEffect(() => {
    window.history.replaceState({ egp: true, entry: true }, "", window.location.href);
    const onPopState = () => {
      const route = routeFromPath();
      setView(route.view);
      setRouteOrderId(route.orderId ?? "");
      setRouteArticleId(route.articleId ?? "");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    const loadOrders = () => fetch("/api/orders")
      .then(response => response.ok ? response.json() : Promise.reject())
      .then((payload: { mode: string; data?: Order[] }) => {
        if (payload.mode === "live" && payload.data?.length) {
          setOrderData(payload.data);
          setSelectedOrder(current => payload.data?.find(order => order.id === current.id) ?? payload.data![0]);
        }
      })
      .catch(() => undefined);
    void loadOrders();
    const timer = window.setInterval(() => void loadOrders(), 5_000);
    return () => window.clearInterval(timer);
  }, []);
  const activeOrder = orderData.find(candidate => candidate.id === routeOrderId) ?? selectedOrder;
  const navigate = (next: View, replace = false) => {
    const orderId = ["order", "screenshots", "documents"].includes(next) ? activeOrder.id : undefined;
    const path = pathForView(next, orderId);
    window.history[replace ? "replaceState" : "pushState"]({ egp: true }, "", path);
    setView(next);
    setRouteOrderId(orderId ?? "");
    window.scrollTo({ top: 0 });
  };
  const openOrder = (order: Order) => {
    setSelectedOrder(order);
    setRouteOrderId(order.id);
    window.history.pushState({ egp: true }, "", pathForView("order", order.id));
    setView("order");
    window.scrollTo({ top: 0 });
  };
  const openArticle = (articleId: string) => {
    setRouteArticleId(articleId);
    window.history.pushState({ egp: true }, "", `/editorial/${encodeURIComponent(articleId)}`);
    setView("editorial-article");
    window.scrollTo({ top: 0 });
  };
  const goBack = () => {
    if (window.history.state?.egp && !window.history.state?.entry) window.history.back();
    else navigate("dashboard", true);
  };
  const markItemFulfilled = (itemId: string, fulfilledAt: string) => {
    const update = (order: Order): Order => {
      const items = order.items.map(item => item.id === itemId ? { ...item, status: "fulfilled" as const, fulfilledAt, failedAt: undefined, lastError: undefined } : item);
      const status: OrderStatus = items.length && items.every(item => item.status === "fulfilled") ? "fulfilled" : items.some(item => item.status === "processing") ? "processing" : items.some(item => item.status === "failed") ? "failed" : order.status;
      return { ...order, items, status };
    };
    setSelectedOrder(current => update(current));
    setOrderData(current => current.map(order => order.id === activeOrder.id ? update(order) : order));
  };
  return <><Header goHome={() => navigate("dashboard")} navigate={navigate} onClearAttention={() => { if (view !== "dashboard") navigate("dashboard"); window.setTimeout(() => window.dispatchEvent(new Event("egp-clear-attention")), 0); }} onLogout={onLogout} />{view === "dashboard" && <Dashboard orderData={orderData} navigate={navigate} openOrder={openOrder} />}{view === "orders" && <AllOrders orderData={orderData} back={goBack} openOrder={openOrder} />}{view === "order" && <OrderDetail order={activeOrder} back={goBack} navigate={navigate} onItemFulfilled={markItemFulfilled} />}{view === "logs" && <FullLogs back={goBack} />}{view === "screenshots" && <FileTree kind="screenshots" baseOrder={activeOrder} back={goBack} />}{view === "documents" && <FileTree kind="documents" baseOrder={activeOrder} back={goBack} />}{view === "posthog" && <PostHogDetail back={goBack} />}{view === "editorial" && <EditorialHome back={goBack} openArticle={openArticle} />}{view === "editorial-article" && <EditorialArticleEditor articleId={routeArticleId} back={goBack} />}</>;
}

export default function App() {
  const [auth, setAuth] = useState<"loading" | "authenticated" | "anonymous">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginState, setLoginState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    void fetch("/api/auth/session", { headers: { Accept: "application/json" } })
      .then(response => setAuth(response.ok ? "authenticated" : "anonymous"))
      .catch(() => setAuth("anonymous"));
  }, []);

  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoginState("loading");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) throw new Error();
      setPassword("");
      setLoginState("idle");
      setAuth("authenticated");
    } catch {
      setLoginState("error");
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setPassword("");
    setAuth("anonymous");
  };

  if (auth === "loading") return <main className="auth-screen"><Logo /><span className="auth-loading">Ověřuji přihlášení…</span></main>;
  if (auth === "anonymous") return <main className="auth-screen"><section className="auth-card surface"><Logo /><form onSubmit={event => void login(event)}><label><span>E-mail</span><input type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required autoFocus /></label><label><span>Heslo</span><input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required /></label>{loginState === "error" && <div className="auth-error">Nesprávný e-mail nebo heslo.</div>}<button type="submit" disabled={loginState === "loading"}>{loginState === "loading" ? "Přihlašuji…" : "Přihlásit se"}</button></form></section></main>;
  return <DashboardApp onLogout={() => void logout()} />;
}
