export type OrderStatus = "awaiting_payment" | "waiting" | "processing" | "fulfilled" | "failed";

export type OrderItem = {
  id?: string;
  source?: "order_items" | "order_bridge_toll_items";
  country: string;
  flag: string;
  product: string;
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
  total: number;
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
};

export const orders: Order[] = [
  {
    id: "a1b2c3d4-e5f6-7890-abcd-1234ef567890",
    number: "EGP-2026-0712-1842",
    plate: "1AA 1234",
    registrationCountry: "Česko",
    registrationCode: "cz",
    email: "jan.novak@example.com",
    createdAt: "12. 7. 2026, 14:31",
    paidAt: "12. 7. 2026, 14:32",
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
    total: 18.4,
    plus: true,
    locale: "hu-HU",
    status: "fulfilled",
    items: [
      { country: "HU", flag: "🇭🇺", product: "Měsíční známka", validFrom: "13. 7. 2026", validTo: "12. 8. 2026", price: 18.4, status: "fulfilled", duration: "56 s", reference: "HU-881203", invoice: "ready" },
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
