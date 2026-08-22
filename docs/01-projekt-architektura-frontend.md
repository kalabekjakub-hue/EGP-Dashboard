# EuroGoPass Admin — Projekt, architektura a frontend

Kompletní popis účelu, architektury, UI a mapy souborů.  
Produkce: [https://admin.eurogopass.com](https://admin.eurogopass.com)  
Balíček: `eurogopass-admin-dashboard` · v0.1.0 · privátní · ESM

Závazné kontrakty (mají přednost při rozporu): [`AGENTS.md`](../AGENTS.md), [`INTEGRATION-CONTRACT.md`](../INTEGRATION-CONTRACT.md).

Další dokumenty: [API, databáze, bezpečnost](02-api-databaze-bezpecnost.md) · [Redakce, ingest, integrace](03-redakce-integrace-konfigurace.md) · [Vývoj, nasazení, provoz](04-vyvoj-nasazeni-provoz.md)

---

# 1. Přehled projektu

## Co to je

Samostatný interní dashboard pro provoz služby EuroGoPass. Slouží operátorům a redaktorům k:

- přehledu a detailu objednávek ze Supabase,
- sledování zdraví **EGP Worker** a **Wise Worker**,
- humanizovaným logům fulfillmentu,
- přístupu k screenshotům a dokladům (faktury vs. oficiální portálové účtenky),
- analytice (PostHog + affiliate shrnutí),
- **Redakci** — AI-asistované tvorbě a publikaci vícejazyčných SEO článků.

## Co to není

- Není veřejný zákaznický web (`eurogopass.com`).
- Není obecný CRUD admin nad obchodními daty.
- Není náhrada za fulfillment workery — workery běží na jiné infrastruktuře; dashboard je čte a proxyuje jejich monitor.
- Není Supabase Auth portal — přihlášení je lokální allowlist + cookie session.

## Základní principy

1. **Produkční data jsou READ-ONLY**, kromě výslovně schválených výjimek v `AGENTS.md`.
2. **Deduplikace / filtrování objednávek** probíhá jen při čtení nebo v UI — nikdy zápisem do DB.
3. **Tajné klíče** patří jen na server/worker. Do `VITE_*` patří jen veřejné hodnoty.
4. **Automatizace Redakce** končí u konceptu ke kontrole; **publikovat smí jen člověk**.
5. **Faktura EuroGoPass** ≠ **oficiální doklad z portálu** — oddělené úložiště a prezentace.

## Tech stack

| Vrstva | Technologie |
|--------|-------------|
| Frontend | React 19.2, TypeScript 6, Vite 8, Lucide, DM Sans, vlastní CSS |
| Backend API | Node HTTP + `connect` middleware (sdílené Vite pluginy) |
| Statika (prod) | `sirv` (SPA fallback) |
| Runtime TS | `tsx` |
| Databáze / storage | Supabase (Postgres + Storage), service role jen na serveru |
| AI | OpenAI (modely konfigurovatelné env) |
| Mail | Gmail API OAuth (`gmail.readonly`) + `mailparser` + `pdf-parse` |
| Deploy | Docker (Node 24), Compose, Caddy 2, GitHub Actions → VPS |
| Jazyk UI | čeština |

## Hlavní vstupy / výstupy

```text
Vstupy (čtení):     Supabase orders/items, worker monitor, Wise health,
                    PostHog Query API, Gmail (sidecar), Storage

Výstupy (zápisy):   FULFILLED + audit (+ note), dashboard_order_item_notes,
                    blog_* + blog-hero-images, lokální auth users.json
```

## Rychlý start (lokálně)

```bash
npm install
cp .env.example .env.local   # vyplnit dle potřeby
npm run dev                  # Vite + API na výchozím Vite portu
```

Výchozí `VITE_DATA_MODE=demo` používá smyšlená data ze `src/data.ts` — **nesmí se míchat s produkčními daty**.

```bash
npm run build
npm start                    # server.ts na 127.0.0.1:3100
```

## Produkční služby (Compose)

| Služba | Kontejner | Role |
|--------|-----------|------|
| `dashboard` | `egp-admin-dashboard` | SPA + API (`npm start`) |
| `gmail-ingest` | `egp-admin-gmail` | kontinuální Gmail → Supabase |
| `editorial-worker` | `egp-admin-editorial` | polling AI automatizace |
| `caddy` | `egp-admin-caddy` | TLS + reverse proxy na `:3100` |

---

# 2. Architektura

## Celkový diagram

```text
┌─────────────────────────────────────────────────────────────────┐
│  Prohlížeč (React SPA)                                          │
│  cookie: egp_admin_session                                      │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Caddy (admin.eurogopass.com)                                   │
│  TLS + security headers / CSP                                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ reverse_proxy 127.0.0.1:3100
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Node dashboard (server.ts / Vite createApiPlugins)             │
│  ├── Auth (allowlist + scrypt file + cookie)                    │
│  ├── Write policy (405 mimo allowlist)                          │
│  ├── Read proxies → Supabase REST / Storage (service_role)      │
│  ├── Limited writes → fulfill RPC, notes, editorial             │
│  ├── Proxies → EGP Worker monitor, Wise health, PostHog         │
│  └── sirv(dist/) SPA                                            │
└─────────────────────────────────────────────────────────────────┘

Sidecary (stejný Compose stack):
  gmail-ingest      → Gmail API → order_documents / Storage
  editorial-worker  → OpenAI → pouze blog_* (bez publikace)

Externí systémy:
  Supabase Postgres + Storage
  EGP fulfillment worker monitor (:3090)
  Wise worker health (:3081)
  PostHog EU · OpenAI · Gmail
```

## Sdílená API vrstva (dev = prod)

Stejné middleware pluginy běží v:

1. **Vývoji** — Vite `configureServer` (`npm run dev`),
2. **Produkci** — `server.ts` načte `createApiPlugins(env)` a namountuje je na `connect` app před `sirv`.

Factory je exportována z `vite.config.ts` jako `createApiPlugins`.

Registrace (pořadí důležité kvůli write policy a auth):

`authApi` → `dashboardWritePolicy` → `editorialApi` → fulfill/notes → `orderExportApi` → `affiliateAnalyticsApi` → `supabaseReadApi` → `gmailIngestReadApi` → `documentReadApi` → `screenshotReadApi` → `workerStatusApi` → `workerLogProxy` → `postHogReadApi`

## Oddělení odpovědností

| Komponenta | Odpovědnost | Co nedělá |
|------------|-------------|-----------|
| SPA (`src/`) | UI, klientské routování, volání `/api/*` | Přímý přístup se service role |
| API middlewares | Auth, proxy, validace, omezené zápisy | Obecné CRUD |
| `mail-ingest.ts` | Párování e-mailů na objednávky, ukládání PDF | UI, publikace |
| `editorial-worker.ts` | Periodické AI generování konceptů | Publikace bez lidského kroku |
| EGP/Wise workery | Fulfillment / platby (mimo tento repo) | Dashboard je jen čte |
| Caddy | TLS a headers | Aplikační logika |

## Datové toky

### Objednávky (live)

1. SPA → `GET /api/orders`
2. Server ověří session
3. Server čte Supabase přes service role (orders + items + bridge/toll)
4. Deduplikace / prezentace v API nebo UI (bez DB cleanup zápisů). Stav `test` a testovací SPZ `AAA`/`AAAAA`/… se skryjí při čtení. Stránka Všechny objednávky řadí chronologicky (zaplacené/vytvořené), bez pinování konfliktů.
5. SPA renderuje dashboard / seznam / detail

### Ruční FULFILLED

1. Operátor v detailu objednávky
2. `POST /api/orders/fulfill-item`
3. Server volá RPC `manual_fulfill_order_item` (atomicky status + audit + optional note)
4. UI aktualizuje lokální stav položky

### ACK konfliktu SPZ/země

1. Worker precheck nastaví `plate_country_conflict = true` (claim drží položky)
2. Dashboard zobrazí konflikt (Centrum pozornosti, filtr, banner v detailu)
3. Operátor potvrdí → `POST /api/orders/ack-plate-country-conflict`
4. RPC `ack_plate_country_conflict` nastaví `false` na order + mirror items + audit
5. Worker claimne pending položky bez dalšího webhooku

### Oficiální doklady

1. `gmail-ingest` polluje Gmail
2. Mapuje odesílatele → zemi (`config/mail-senders.json`)
3. Extrahuje SPZ / páruje na objednávku
4. Ukládá do bucketu `official-documents` + `order_documents` / `email_ingest_messages`
5. Dashboard čte přes `GET /api/documents` (+ file proxy)

### Redakce

1. Téma → generování CZ konceptu (ručně nebo worker)
2. Lidská kontrola → překlady → SEO audit (neblokující)
3. Lidská publikace → `blog_posts` + překlady; `published_by` = e-mail session

## Write gate

Middleware `dashboardWritePolicy` odmítá ne-GET požadavky pod `/api` stavem **405**, kromě povolených cest (auth, fulfill, item-notes, plate-country ACK, editorial). Detaily v dokumentu o bezpečnosti.

## Síťový model (produkce)

- Dashboard poslouchá **pouze** `127.0.0.1:3100`.
- Compose služby používají `network_mode: host`.
- Veřejný přístup výhradně přes Caddy na `admin.eurogopass.com`.
- Dashboard kontejner: `read_only: true`, `cap_drop: ALL`, `no-new-privileges`, tmpfs `/tmp`.

## Konfigurace prostředí

`server-config.ts` slučuje: Vite `loadEnv` → volitelný soubor `EGP_WORKER_ENV_PATH` → `process.env`. Built-in allowlist e-mailů je sloučen s `EGP_ADMIN_EMAILS`.

---

# 3. Frontend

## Stack UI

- React 19 + TypeScript + Vite (`index.html` → `/src/main.tsx`)
- Font: DM Sans · Ikony: lucide-react
- Styly: `src/styles.css` (bez Tailwind/UI knihovny)
- **Bez React Router** — vlastní path-based routování v `App.tsx`

## Vstupní body

| Soubor | Role |
|--------|------|
| `index.html` | Shell, `lang="cs"`, title EGP Admin |
| `src/main.tsx` | Mount `<App />`, CSS + font |
| `src/App.tsx` | Auth gate, routování, dashboard/orders/logs/… |
| `src/editorial.tsx` | UI Redakce |
| `src/editorial-versioning.ts` | Sync společné vs. lokální revize |
| `src/passageCatalog.ts` | Lidské názvy mostů/tunelů/mýt |
| `src/data.ts` | Demo data |
| `src/config.ts` | `VITE_DATA_MODE` a veřejná konfigurace |

## Views a cesty

```text
dashboard | orders | order | logs | screenshots | documents | posthog | editorial | editorial-article
```

| URL | View |
|-----|------|
| `/` | dashboard |
| `/orders` | orders |
| `/orders/:id` | order |
| `/orders/:id/screenshots` | screenshots (scoped) |
| `/orders/:id/documents` | documents (scoped) |
| `/screenshots` | screenshots |
| `/documents` | documents |
| `/logs` | logs |
| `/analytics` | posthog |
| `/editorial` | editorial |
| `/editorial/articles/:id` | editorial-article |
| `/editorial/articles/:id/languages/:locale` | editorial-article + locale |

Navigace: `history.pushState` / `popstate` + `pathForView` / `routeFromPath`.

## Datové režimy

**Demo** (`VITE_DATA_MODE=demo`, výchozí): data ze `src/data.ts`; nesmí se kombinovat s produkčními konektory.

**Live**: `VITE_SUPABASE_*` (veřejné) + serverové `SUPABASE_*`; SPA volá `/api/*`; service role jen na serveru.

## Hlavní UI oblasti

**Header:** brand, worker pilulky, nastavení Redakce, externí odkazy (Wise, Gmail, Supabase, Retell, GitHub, PostHog, web), odhlášení.

**Dashboard (`/`):** sloupec objednávek, centrum pozornosti, náhled Redakce a PostHog, živý log.

**Objednávky:** seznam + detail, humanizovaná timeline, ruční FULFILLED, poznámky k položkám, odkazy na screenshoty/doklady. **Stáhnout vše** stáhne ZIP (faktura, oficiální doklady, screenshoty, souhrn). **PDF souhrn** otevře tisknutelný přehled. Karty: dokončená zelená, zpracovává se modrá, selhání červená, Plus tyrkysová, čeká na zpracování žlutá, čeká na platbu šedá, konflikt SPZ oranžová. Dokončená karta s konfliktem zůstává zelená a ukáže jen štítek konfliktu. Levý náhled i archiv `/orders` řadí podle času; selhání a dokončené konflikty se netopují nahoru.

**Logy:** proxy EGP Worker monitor (technické i humanizované).

**Screenshoty:** strom metadat + file proxy `/api/screenshots/file`.

**Doklady:** zákaznické faktury (`invoices`) vs. oficiální portálové (`order_documents` / `official_receipt`) — jasně oddělené.

**Analytics (`/analytics`):** funnel/traffic/kvalita (PostHog) + affiliate shrnutí.

**Redakce:** fronta témat, generování, vícejazyčný editor, SEO pool, guides, publikace — detail v dokumentu 03.

## Stav a fetch

- Session: `GET /api/auth/session` → bez session login obrazovka
- Objednávky: `GET /api/orders` (live) nebo `data.ts` (demo)
- Worker status: `GET /api/workers/status`
- UI stavy: `ready` / `error` / loading

Design: jednotný surface v `styles.css`, česká copy, desktop-first provozní nástroj.

---

# 4. Mapa souborů a modulů

```text
EGP DSHBRD/
├── src/                      # React SPA
├── supabase/migrations/      # Aditivní SQL
├── editorial-guides/         # Seed AI podklady
├── editorial-prompts/        # Hard AI contracts
├── config/                   # Non-secret config (mail senders)
├── scripts/                  # Deploy + Gmail OAuth
├── runtime/                  # Gitignored artefakty
├── secrets/                  # Gitignored produkční env
├── dist/                     # Vite build
├── docs/                     # Dokumentace (tyto 4 soubory)
├── .github/workflows/        # CI deploy
├── package.json
├── vite.config.ts            # Vite + createApiPlugins (API)
├── server.ts                 # Prod HTTP server
├── server-config.ts          # Env + allowlist
├── editorial-api.ts          # Redakce backend
├── editorial-worker.ts       # Redakce poll worker
├── order-export-api.ts       # ZIP + souhrn objednávky
├── editorial-api.test.ts
├── mail-ingest.ts            # Gmail sidecar
├── Dockerfile
├── docker-compose.production.yml
├── Caddyfile
├── AGENTS.md · INTEGRATION-CONTRACT.md · EDITORIAL-PLAN.md · ROADMAP.md
└── README.md
```

| Soubor | Role |
|--------|------|
| `src/App.tsx` | Hlavní SPA |
| `src/order-filters.ts` | Viditelné stavy objednávek a skrytí testovacích SPZ při čtení |
| `src/styles.css` | Styling |
| `src/editorial.tsx` | Redakce UI |
| `order-export-api.ts` | ZIP balíček a tisknutelný souhrn objednávky |
| `vite.config.ts` | API mimo redakci |
| `editorial-api.ts` | `/api/editorial/*` + AI |
| `server.ts` | Prod: pluginy + `sirv(dist)` |
| `mail-ingest.ts` | Gmail → Supabase |
| `scripts/deploy-production.sh` | Compose up + health |
| `scripts/gmail-authorize.ts` | OAuth Gmail |

### Dokumentace v kořeni (kontrakty / ops)

| Soubor | Autorita |
|--------|----------|
| `AGENTS.md` | Write boundary |
| `INTEGRATION-CONTRACT.md` | API/security kontrakt |
| `EDITORIAL-PLAN.md` | Produktový návrh Redakce |
| `ROADMAP.md` | Budoucí nápady |
| `NOVA-VPS-ZADANI-PRO-KOLEGU.md` | Zřízení VPS |
| `VERCEL-DNS-ADMIN-SUBDOMENA.md` | DNS |
| `WISE-WORKER-RAM-NAVRH.md` | Ops návrh RAM |

### Kde začít v kódu

1. `src/App.tsx` — co uživatel vidí  
2. `vite.config.ts` — co server vystavuje mimo redakci  
3. `editorial-api.ts` — redakční backend  
4. `mail-ingest.ts` — doklady z mailu  
5. `AGENTS.md` + `INTEGRATION-CONTRACT.md` — co smíš měnit v produkci
