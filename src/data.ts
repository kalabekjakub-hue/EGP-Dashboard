export type OrderStatus = "awaiting_payment" | "plus" | "waiting" | "processing" | "fulfilled" | "failed" | "later";

export type OrderItem = {
  id?: string;
  source?: "order_items" | "order_bridge_toll_items" | "order_free_flow_items" | "order_epass24_items";
  country: string;
  displayCode?: string;
  flag: string;
  product: string;
  itemKind?: "vignette" | "bridge" | "tunnel" | "toll_section" | "free_flow" | "epass24";
  estimate?: number | null;
  accrued?: number | null;
  fee?: number | null;
  chargedTotal?: number | null;
  deferredStatus?: string;
  deferredLabel?: string;
  sectionCount?: number;
  validFrom: string;
  validTo: string;
  price: number;
  status: OrderStatus;
  duration?: string;
  currentStep?: string;
  reference?: string;
  invoice: "ready" | "waiting";
  engineSubmittedAt?: string;
  fulfilledAt?: string;
  failedAt?: string;
  lastError?: string;
  createdAtIso?: string;
  pdfAvailable?: boolean;
  screenshotsAvailable?: boolean;
};

export type Order = {
  id: string;
  number: string;
  plate: string;
  registrationCountry: string;
  registrationCode: string;
  email: string;
  createdAt: string;
  paidAt: string;
  originalPendingCreatedAt?: string;
  total: number;
  currency?: string;
  totalEur?: number;
  profit?: number;
  profitEur?: number;
  plus: boolean;
  vehicleType?: string;
  fuelType?: string;
  vin?: string;
  locale: string;
  status: OrderStatus;
  items: OrderItem[];
  createdAtIso?: string;
  paidAtIso?: string;
  fulfilledAtIso?: string;
  invoiceAvailable?: boolean;
  lastError?: string;
  /** Worker precheck: true = hold until operator ACK; false = OK/acked; null = unchecked. */
  plateCountryConflict?: boolean | null;
};

export const orders: Order[] = [
  {
    id: "f1e2d3c4-b5a6-4789-90ab-cdef12345678",
    number: "EGP-2026-1015-2201",
    plate: "6FF 2468",
    registrationCountry: "Česko",
    registrationCode: "cz",
    email: "petra.free@example.com",
    createdAt: "15. 10. 2026, 09:12",
    paidAt: "15. 10. 2026, 09:13",
    paidAtIso: "2026-10-15T07:13:00.000Z",
    createdAtIso: "2026-10-15T07:12:00.000Z",
    total: 0,
    plus: false,
    locale: "cs-CZ",
    status: "processing",
    items: [
      {
        id: "ff-item-1",
        source: "order_free_flow_items",
        country: "FR",
        displayCode: "FR",
        flag: "",
        product: "Francie Free-Flow",
        itemKind: "free_flow",
        validFrom: "12. 10. 2026",
        validTo: "12. 10. 2026",
        price: 18.2,
        estimate: 14.5,
        accrued: 18.2,
        fee: null,
        chargedTotal: null,
        status: "processing",
        deferredStatus: "debt_found",
        deferredLabel: "Čeká se na dluh",
        sectionCount: 2,
        currentStep: "Čeká se na dluh",
        invoice: "waiting",
      },
    ],
  },
  {
    id: "a9b8c7d6-e5f4-4321-abcd-0987654321ab",
    number: "EGP-2026-1014-1844",
    plate: "7EE 1357",
    registrationCountry: "Německo",
    registrationCode: "de",
    email: "lars.epass@example.com",
    createdAt: "14. 10. 2026, 16:40",
    paidAt: "14. 10. 2026, 16:41",
    paidAtIso: "2026-10-14T14:41:00.000Z",
    createdAtIso: "2026-10-14T14:40:00.000Z",
    total: 0,
    plus: false,
    locale: "de-DE",
    status: "waiting",
    items: [
      {
        id: "ep-item-1",
        source: "order_epass24_items",
        country: "NO",
        displayCode: "NO",
        flag: "",
        product: "Norsko EPASS24",
        itemKind: "epass24",
        validFrom: "2. 10. 2026",
        validTo: "2. 10. 2026",
        price: 22,
        estimate: 22,
        accrued: null,
        fee: null,
        chargedTotal: null,
        status: "waiting",
        deferredStatus: "awaiting_debt",
        deferredLabel: "Čeká se na dluh",
        sectionCount: 4,
        currentStep: "Čeká se na dluh",
        invoice: "waiting",
      },
      {
        id: "ep-item-2",
        source: "order_epass24_items",
        country: "SE",
        displayCode: "SE",
        flag: "",
        product: "Švédsko EPASS24",
        itemKind: "epass24",
        validFrom: "3. 10. 2026",
        validTo: "3. 10. 2026",
        price: 9.4,
        estimate: 8,
        accrued: 8.5,
        fee: 0.9,
        chargedTotal: 9.4,
        status: "fulfilled",
        deferredStatus: "fulfilled",
        deferredLabel: "Hotovo",
        sectionCount: 1,
        currentStep: "Hotovo",
        invoice: "ready",
      },
    ],
  },
  {
    id: "c0ffee00-1111-4abc-9def-0123456789ab",
    number: "EGP-2026-1015-2310",
    plate: "8GG 4242",
    registrationCountry: "Česko",
    registrationCode: "cz",
    email: "mix.flow@example.com",
    createdAt: "15. 10. 2026, 11:02",
    paidAt: "15. 10. 2026, 11:03",
    paidAtIso: "2026-10-15T09:03:00.000Z",
    createdAtIso: "2026-10-15T09:02:00.000Z",
    total: 9.3,
    plus: false,
    locale: "cs-CZ",
    status: "waiting",
    items: [
      { country: "AT", flag: "🇦🇹", product: "10denní známka", validFrom: "16. 10. 2026", validTo: "25. 10. 2026", price: 9.3, status: "fulfilled", duration: "41 s", reference: "AT-441902", invoice: "ready" },
      {
        id: "ff-item-mix",
        source: "order_free_flow_items",
        country: "FR",
        displayCode: "FR",
        flag: "",
        product: "Francie Free-Flow",
        itemKind: "free_flow",
        validFrom: "16. 10. 2026",
        validTo: "16. 10. 2026",
        price: 0,
        estimate: 11,
        accrued: null,
        fee: null,
        chargedTotal: null,
        status: "waiting",
        deferredStatus: "awaiting_debt",
        deferredLabel: "Čeká se na dluh",
        sectionCount: 1,
        currentStep: "Čeká se na dluh",
        invoice: "waiting",
      },
    ],
  },
  {
    id: "a1b2c3d4-e5f6-7890-abcd-1234ef567890",
    number: "EGP-2026-0712-1842",
    plate: "1AA 1234",
    registrationCountry: "Česko",
    registrationCode: "cz",
    email: "jan.novak@example.com",
    createdAt: "12. 7. 2026, 14:31",
    paidAt: "12. 7. 2026, 14:32",
    paidAtIso: "2026-07-12T12:32:00.000Z",
    createdAtIso: "2026-07-12T12:31:00.000Z",
    total: 31,
    plus: true,
    locale: "cs-CZ",
    status: "processing",
    items: [
      { country: "CZ", flag: "🇨🇿", product: "Roční známka", validFrom: "12. 7. 2026", validTo: "11. 7. 2027", price: 18.5, status: "processing", currentStep: "Platba", duration: "1 min 24 s", invoice: "waiting" },
      { country: "SK", flag: "🇸🇰", product: "10denní známka", validFrom: "12. 7. 2026", validTo: "21. 7. 2026", price: 12.5, status: "waiting", invoice: "waiting" },
    ],
  },
  {
    id: "b7c8d9e0-f1a2-4567-8901-bc234de56789",
    number: "EGP-2026-0712-1838",
    plate: "2BB 5678",
    registrationCountry: "Slovensko",
    registrationCode: "sk",
    email: "maria.kovacova@example.com",
    createdAt: "12. 7. 2026, 13:54",
    paidAt: "12. 7. 2026, 13:55",
    paidAtIso: "2026-07-12T11:55:00.000Z",
    createdAtIso: "2026-07-12T11:54:00.000Z",
    total: 15.5,
    plus: false,
    locale: "sk-SK",
    status: "fulfilled",
    items: [
      { country: "SK", flag: "🇸🇰", product: "30denní známka", validFrom: "13. 7. 2026", validTo: "11. 8. 2026", price: 15.5, status: "fulfilled", duration: "48 s", reference: "SK-57321063", invoice: "ready" },
    ],
  },
  {
    id: "c3d4e5f6-a7b8-9012-cd34-ef5678901234",
    number: "EGP-2026-0712-1821",
    plate: "3CC 9101",
    registrationCountry: "Německo",
    registrationCode: "de",
    email: "lena.becker@example.com",
    createdAt: "12. 7. 2026, 12:10",
    paidAt: "12. 7. 2026, 12:11",
    paidAtIso: "2026-07-12T10:11:00.000Z",
    createdAtIso: "2026-07-12T10:10:00.000Z",
    total: 9.3,
    plus: false,
    locale: "de-DE",
    status: "fulfilled",
    items: [
      { country: "AT", flag: "🇦🇹", product: "10denní známka", validFrom: "14. 7. 2026", validTo: "23. 7. 2026", price: 9.3, status: "fulfilled", duration: "1 min 06 s", reference: "AT-902184", invoice: "ready" },
    ],
  },
  {
    id: "d5e6f7a8-b9c0-1234-de56-fa7890123456",
    number: "EGP-2026-0712-1799",
    plate: "4DD 3456",
    registrationCountry: "Maďarsko",
    registrationCode: "hu",
    email: "balazs.toth@example.com",
    createdAt: "12. 7. 2026, 10:42",
    paidAt: "12. 7. 2026, 10:43",
    paidAtIso: "2026-07-12T08:43:00.000Z",
    createdAtIso: "2026-07-12T08:42:00.000Z",
    total: 18.4,
    plus: true,
    locale: "hu-HU",
    status: "plus",
    items: [
      { country: "HU", flag: "🇭🇺", product: "Měsíční známka", validFrom: "20. 7. 2026", validTo: "19. 8. 2026", price: 18.4, status: "plus", currentStep: "Plus T−15", invoice: "waiting" },
    ],
  },
  {
    id: "e7f8a9b0-c1d2-3456-ef78-ab9012345678",
    number: "EGP-2026-0712-1764",
    plate: "5EE 7890",
    registrationCountry: "Polsko",
    registrationCode: "pl",
    email: "piotr.nowak@example.com",
    createdAt: "12. 7. 2026, 09:08",
    paidAt: "12. 7. 2026, 09:09",
    paidAtIso: "2026-07-12T07:09:00.000Z",
    createdAtIso: "2026-07-12T07:08:00.000Z",
    total: 12.4,
    plus: false,
    locale: "pl-PL",
    status: "failed",
    items: [
      { country: "SI", flag: "🇸🇮", product: "7denní známka", validFrom: "13. 7. 2026", validTo: "19. 7. 2026", price: 12.4, status: "failed", duration: "2 min 17 s", currentStep: "Potvrzení platby", invoice: "waiting" },
    ],
  },
];

export const humanEvents = [
  { id: "evt-1", time: "14:32:38", label: "SK · chyba při potvrzení", tone: "error" },
  { id: "evt-2", time: "14:32:27", label: "CZ · platba", tone: "active" },
  { id: "evt-3", time: "14:32:16", label: "CZ · vyplnění formuláře", tone: "normal" },
  { id: "evt-4", time: "14:32:11", label: "Objednávka přijata", tone: "normal" },
];

export const technicalLogs = [
  { eventId: "evt-1", time: "14:32:38.014", level: "error", text: 'confirmation_failed country="SK" code="TIMEOUT" step="payment"' },
  { eventId: "evt-2", time: "14:32:27.418", level: "info", text: 'payment_initiated country="CZ" amount=18.50 currency="EUR" method="card"' },
  { eventId: "evt-2", time: "14:32:25.903", level: "info", text: 'wise_status authenticated=true cdpConnected=true armed=true' },
  { eventId: "evt-3", time: "14:32:11.221", level: "info", text: 'form_completed country="CZ" vehicle_reg="1AA1234"' },
  { eventId: "evt-4", time: "14:31:58.112", level: "info", text: 'order_claimed id="a1b2c3d4-e5f6-7890-abcd-1234ef567890"' },
  { eventId: "evt-4", time: "14:31:44.776", level: "info", text: 'order_created source="supabase" items=2 locale="cs-CZ"' },
];

export const portalLinks = [
  { code: "CZ", flag: "🇨🇿", url: "https://edalnice.cz" },
  { code: "SK", flag: "🇸🇰", url: "https://eznamka.sk" },
  { code: "AT", flag: "🇦🇹", url: "https://shop.asfinag.at" },
  { code: "HU", flag: "🇭🇺", url: "https://ematrica.nemzetiutdij.hu" },
  { code: "BG", flag: "🇧🇬", url: "https://web.bgtoll.bg" },
  { code: "SI", flag: "🇸🇮", url: "https://evinjeta.dars.si" },
  { code: "RO", flag: "🇷🇴", url: "https://www.erovinieta.ro" },
  { code: "CH", flag: "🇨🇭", url: "https://via.admin.ch" },
];
