# EuroGoPass Admin — API, databáze a bezpečnost

HTTP endpointy, schéma Supabase/Storage a autentizační / write hranice.

Závazný detail: [`INTEGRATION-CONTRACT.md`](../INTEGRATION-CONTRACT.md), [`AGENTS.md`](../AGENTS.md).

Další dokumenty: [Projekt a architektura](01-projekt-architektura-frontend.md) · [Redakce a integrace](03-redakce-integrace-konfigurace.md) · [Vývoj a nasazení](04-vyvoj-nasazeni-provoz.md)

---

# 1. API reference

Všechny endpointy běží pod `/api/*` na stejném originu jako SPA. Kromě auth login/logout/session vyžadují platnou admin session cookie `egp_admin_session`.

Ne-GET požadavky mimo allowlist → **405** (write policy).

## Auth

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/auth/session` | Kontrola session |
| `POST` | `/api/auth/login` | Allowlist + scrypt; rate limit ~5 / 15 min / IP; heslo 12–128 znaků |
| `POST` | `/api/auth/logout` | Invalidace cookie |

**První login** allowlistovaného e-mailu smí vytvořit lokální záznam v `EGP_AUTH_FILE` (sůl + scrypt hash). Nevytváří Supabase Auth účet. Same-origin ochrana vůči `EGP_PUBLIC_ORIGIN`.

## Objednávky a fulfillment

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/orders` | Seznam objednávek + položky (včetně `plateCountryConflict`). Při čtení jen `pending` / `paid` / `awaiting_payment` / `waiting_payment` / `fulfilled`; stav `test` a testovací SPZ jen z písmen A se skryjí. |
| `GET` | `/api/orders/bundle?orderId=` | ZIP dokladů, screenshotů, interního PDF listu a anglického zákaznického PDF objednávky |
| `GET` | `/api/orders/summary?orderId=` | Interní technický PDF list objednávky (attachment) |
| `GET` | `/api/orders/customer-summary?orderId=` | Anglické zákaznické PDF potvrzení splnění (vozidlo, `order_id`, položky bez selhání/retry) |
| `POST` | `/api/orders/fulfill-item` | Ruční FULFILLED přes RPC |
| `POST` | `/api/orders/ack-plate-country-conflict` | ACK konfliktu SPZ/země přes RPC |
| `GET` | `/api/orders/item-notes?orderId=` | Poznámky k položkám |
| `POST` | `/api/orders/item-notes` | Nahradit poznámku (max 2000 znaků) |
| `DELETE` | `/api/orders/item-notes` | Smazat poznámky položky |
| `GET` | `/api/manual-fulfillment-audit` | Audit ručního fulfillmentu |

### `POST /api/orders/fulfill-item`

Smí pouze nastavit `status` / `fulfilled_at` na existující `order_items` nebo `order_bridge_toll_items`, zapsat `manual_fulfillment_audit` (včetně volitelného `note`), atomicky přes RPC `manual_fulfill_order_item`. Nesmí vytvářet objednávky ani měnit jiná obchodní pole.

### `POST /api/orders/ack-plate-country-conflict`

Smí pouze uvolnit hold `plate_country_conflict` na existující objednávce. Atomicky přes RPC `ack_plate_country_conflict`: nastaví `false` na `orders` + mirror na `order_items` a `order_bridge_toll_items` daného `order_id` a zapíše audit do `dashboard_plate_country_conflict_acks`. Nesmí měnit status, SPZ, zemi registrace ani nastavit `NULL`. Body: `{ orderId }`.

### `POST|DELETE /api/orders/item-notes`

Mění pouze `dashboard_order_item_notes`. Nesmí sahat na obchodní sloupce položek.

## Doklady a screenshoty

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/documents` | Metadata dokladů (faktury + oficiální) |
| `GET` | `/api/documents/file?orderId=&documentId=` | Proxy souboru ze Storage |
| `GET` | `/api/screenshots` | Strom screenshot metadat |
| `GET` | `/api/screenshots/file?source=&id=&file=` | Proxy souboru |
| `GET` | `/api/gmail/status` | Stav Gmail ingestu |

**Rozlišení:** zákaznická faktura = `orders.invoice_pdf_path` / bucket `invoices`; oficiální portál = `order_documents` + `official-documents`.

## Workery

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/workers/status` | EGP monitor + Wise health |
| `GET` | `/api/worker/logs` | Proxy logů |
| `GET` | `/api/worker/events` | Proxy/SSE event stream |

Upstream: `EGP_WORKER_MONITOR_URL` + `EGP_WORKER_MONITOR_TOKEN` / `MONITOR_READ_TOKEN`. Wise: `WISE_WORKER_HEALTH_URL`.

## Analytics

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/posthog/summary` | PostHog Query API (server-only key) |
| `GET` | `/api/affiliates/summary` | Affiliate metriky ze Supabase |

## Redakce (`/api/editorial/...`)

Handler v `editorial-api.ts`. Zápisy pouze do `blog_*` a bucketu `blog-hero-images`.

### Články

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/editorial/articles` | Seznam |
| `GET` | `/api/editorial/articles/:id/research` | Rešerše / claims |
| `PUT` | `/api/editorial/articles/:id/locales/:locale` | Uložení jazykové verze |
| `GET` | `/api/editorial/articles/:id/locales/:locale/seo-audit` | Čtení auditu |
| `POST` | `/api/editorial/articles/:id/locales/:locale/seo-audit` | Vytvoření/obnova auditu |
| `POST` | `/api/editorial/articles/:id/locales/:locale/seo-refresh` | SEO/GEO optimalizace |
| `POST` | `/api/editorial/articles/:id/translate` | Překlady |
| `POST` | `/api/editorial/articles/:id/publish` | Lidská publikace (+ `published_by`) |
| `PUT` | `/api/editorial/articles/:id/hero` | Upload hero |
| `DELETE` | `/api/editorial/articles/:id/hero` | Smazání hero + null URL |
| `DELETE` | `/api/editorial/articles/:id` | Tvrdé smazání článku |

### Témata

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/editorial/topics` | Fronta |
| `POST` | `/api/editorial/topics` | Ruční přidání |
| `POST` | `/api/editorial/topics/suggest` | AI návrh (+ `targetCharacters` 500–12000, volitelně `productFocus`) |
| `DELETE` | `/api/editorial/topics/:id` | Jen řádek `blog_topic_queue` |
| `POST` | `/api/editorial/topics/:id/generate` | Generování CZ (+ `style_profile`) |

### Klíčová slova, nastavení, guides

| Method | Path | Popis |
|--------|------|--------|
| `GET` | `/api/editorial/keywords` | SEO/GEO pool |
| `POST` | `/api/editorial/keywords/import` | Ruční / GSC CSV (bez zápisu do GSC) |
| `GET`/`PUT` | `/api/editorial/settings` | Automatizace / autosave |
| `GET`/`POST` | `/api/editorial/guides` | AI Markdown podklady |
| `PUT`/`DELETE` | `/api/editorial/guides/:id` | Úprava / smazání (max 20 000 znaků, `.md`) |

### Locales, styly, SEO pravidla API

- **24 jazyků:** `bg, hr, cs, da, nl, en, et, fi, fr, de, el, hu, ga, it, lv, lt, mt, pl, pt, ro, sk, sl, es, sv`
- **Style profiles:** `balanced` | `factual` | `roadmate`
- **SEO/GEO skóre:** poradní 0–100; **nesmí** blokovat ani spouštět publikaci
- **Délka CZ:** `body_md` cílí na ±10 % od `target_characters`; max 3 opravy délky, mimo rozsah se článek uloží s neblokujícím upozorněním

## Chybové stavy

| HTTP | Význam |
|------|--------|
| 401 | Chybí / neplatná session |
| 403 | E-mail mimo allowlist / origin mismatch |
| 405 | Zápis mimo write allowlist |
| 429 | Rate limit loginu |
| 4xx/5xx | Upstream nebo validace |

---

# 2. Databáze a storage

Dashboard používá **Supabase Postgres + Storage**. Obchodní jádro žije ve sdíleném produkčním schématu; tento repo přidává **aditivní migrace** v `supabase/migrations/`.

Přístup: **service role pouze na serveru**. RLS na nových tabulkách bez anon politik.

## Migrace (chronologicky)

| Soubor | Účel |
|--------|------|
| `202607150001_order_documents.sql` | `order_documents`, `email_ingest_messages`, bucket `official-documents` |
| `202607160001_manual_fulfillment_audit.sql` | Audit ručního FULFILLED |
| `202607180001_editorial_workflow.sql` | Redakční workflow + bucket `blog-hero-images` |
| `202607180002`–`004` | Experimenty cleanup pending orders (zrušeno) |
| `202607180005_remove_order_cleanup_writes.sql` | Odstranění DB cleanup; dedup v UI |
| `202607190001_editorial_publisher_audit.sql` | `blog_posts.published_by` |
| `202607190002_editorial_ai_guides.sql` | `blog_editorial_guides` |
| `202607190003_atomic_manual_fulfillment.sql` | RPC `manual_fulfill_order_item` |
| `202607190004_editorial_seo_keyword_pool.sql` | Keywords, vazby, SEO audits |
| `202607200001_editorial_seo_geo_scores.sql` | `seo_score`, `geo_score`, `summary`, `details` |
| `202607200002_editorial_writing_style_profiles.sql` | `style_profile` |
| `202608020001_order_item_notes.sql` | `dashboard_order_item_notes`; RPC s `p_note` |
| `202608200001_ack_plate_country_conflict.sql` | Audit ACK + RPC `ack_plate_country_conflict` |

## Obchodní tabulky (čtení)

| Tabulka | Použití |
|---------|---------|
| `orders` | Objednávky, `invoice_pdf_path`, stavy, částky, `plate_country_conflict` |
| `order_items` | Položky, fulfillment, screenshot metadata, mirror `plate_country_conflict` |
| `order_bridge_toll_items` | Mosty/tunely/mýto, mirror `plate_country_conflict` |
| `affiliates` | Affiliate analytika |

**Zápis z dashboardu (obchodní data):** status/`fulfilled_at` přes RPC `manual_fulfill_order_item`; `plate_country_conflict = false` (+ mirror) přes RPC `ack_plate_country_conflict`.

## Dashboard-owned provozní tabulky

### `order_documents`

Oficiální doklady. Pole: `order_id`, volitelně `order_item_id` + `item_source`, `document_type` (`official_receipt` \| `official_confirmation` \| `original_email`), `source` (`email` \| `worker` \| `manual`), storage, `sha256`, e-mail metadata. **Nikdy** zákaznická faktura EuroGoPass.

### `email_ingest_messages`

Idempotence Gmail ingestu. PK `gmail_message_id`; status `ignored` \| `matched` \| `review` \| `error`; extrakce SPZ/země; `matched_order_id`; `reason`.

### `manual_fulfillment_audit`

Audit každého ručního FULFILLED (včetně volitelného `note`).

### `dashboard_order_item_notes`

Operátorské poznámky — výhradně dashboard tabulka.

### `dashboard_plate_country_conflict_acks`

Audit každého operátorského ACK konfliktu SPZ/země registrace (`order_id`, `actor_email`, `previous_value`, `created_at`).

## Redakční tabulky (`blog_*`)

**Rozšířené existující:**

- `blog_posts` — identita, status, hero, země, tagy, `published_by`, `style_profile`
- `blog_post_translations` — + `slug`, `seo_*`, `hero_image_alt`, `common_revision`, `local_revision`, `source_locale`, `editorial_status`, `manually_edited`, `content_hash`, `last_translated_at`, `last_published_at`

**Workflow:**

| Tabulka | Účel |
|---------|------|
| `blog_topic_queue` | Fronta témat, `target_characters`, `style_profile` |
| `blog_translation_drafts` | Pracovní koncepty (autosave vs version) |
| `blog_generation_runs` | Audit AI běhů |
| `blog_automation_settings` | Singleton automatizace |
| `blog_research_sources` | Zdroje rešerše |
| `blog_article_claims` / `blog_claim_sources` | Tvrzení a ověření |
| `blog_editorial_guides` | Editovatelné Markdown AI podklady |
| `blog_seo_keywords` | Pool klíčových slov |
| `blog_topic_keywords` / `blog_post_keywords` | Vazby |
| `blog_seo_audits` | Neblokující SEO/GEO kontroly |

## RPC `manual_fulfill_order_item`

Parametry: `order_id`, `item_id`, `item_source`, `actor_email`, volitelné `p_note`.  
`SECURITY DEFINER`, jen `service_role`. Atomicky: update položky + insert auditu; při selhání auditu rollback.

## RPC `ack_plate_country_conflict`

Parametry: `p_order_id`, `p_actor_email`.  
`SECURITY DEFINER`, jen `service_role`. Atomicky: `orders.plate_country_conflict = false`, mirror na `order_items` a `order_bridge_toll_items` stejného `order_id`, insert do `dashboard_plate_country_conflict_acks`. Pokud je hodnota už `false`, vrátí `already_acked` bez dalšího zápisu. Nesmí nastavit `NULL` ani měnit jiná pole.

## Storage buckety

| Bucket | Public | Účel |
|--------|--------|------|
| `official-documents` | ne | Oficiální PDF/e-maily |
| `invoices` | (existující) | Zákaznické faktury |
| `blog-hero-images` | ano | Hero obrázky (~10 MB) |

## Pravidla zápisu (shrnutí)

| Povoleno | Zakázáno |
|----------|----------|
| FULFILLED + audit + note | Vytváření/mazání objednávek |
| `dashboard_order_item_notes` | Úprava plateb / PII mimo povolené |
| ACK `plate_country_conflict` (+ mirror + audit) | Změna SPZ / země registrace / statusů kvůli konfliktu |
| Celé `blog_*` + hero bucket | DB cleanup / dedup zápisy objednávek |
| Lokální auth file | Zápis do Google Search Console |
| | Anon browser service_role |

---

# 3. Autentizace a bezpečnost

## Model přístupu

Dashboard **nepoužívá Supabase Auth** pro vstup.  
Přístup = **e-mailový allowlist** + **lokální scrypt credentials** + **HttpOnly cookie session**.

Existence účtu v Supabase Auth **sama o sobě neopravňuje** k přístupu.

## Allowlist

1. Built-in: `info@eurogopass.com`, `kalabek.jakub@gmail.com`, `adamskrivanek007@gmail.com`
2. Env `EGP_ADMIN_EMAILS` (čárkou)

Všichni mají stejná oprávnění (žádné role v app).

## Credentials soubor (`EGP_AUTH_FILE`)

- Lokálně: `runtime/auth/users.json`
- Prod: volume `/app/auth-data/users.json` (`dashboard_auth`)

Uloženo: e-mail, sůl, scrypt hash, čas vytvoření. Heslo v otevřené podobě se nesmí ukládat. První úspěšný login allowlistovaného e-mailu smí záznam vytvořit.

## Session cookie

| Vlastnost | Hodnota |
|-----------|---------|
| Název | `egp_admin_session` |
| HttpOnly | ano |
| SameSite | Strict |
| Secure | ano v produkci |
| TTL | 12 hodin |

Origin check vůči `EGP_PUBLIC_ORIGIN`. Rate limit loginu ~5 / 15 min / IP. Heslo 12–128 znaků.

## Write policy

Ne-GET `/api/*` povolené jen pro:

- `/api/auth/login`, `/api/auth/logout`
- `/api/orders/fulfill-item`
- `/api/orders/item-notes`
- `/api/orders/ack-plate-country-conflict`
- `/api/editorial/*` (v rámci redakčních pravidel)

Ostatní → **405**. Nový write endpoint = schválení uživatele + update `AGENTS.md` + `INTEGRATION-CONTRACT.md`.

## Tajemství

| Do prohlížeče (`VITE_*`) | Jen na server |
|--------------------------|---------------|
| `VITE_DATA_MODE` | `SUPABASE_SERVICE_ROLE_KEY` |
| `VITE_SUPABASE_URL` / `ANON_KEY` | Worker tokeny, OpenAI, PostHog personal key |
| `VITE_POSTHOG_*` (veřejné) | Gmail OAuth, auth file |

`secrets/` a `.env*` gitignored. CI rsync vylučuje `secrets/` a `runtime/`.

## Produkční hardening

**Kontejnery dashboard / editorial-worker:** `read_only`, `cap_drop: ALL`, `no-new-privileges`, `user: 1000:1000`, tmpfs `/tmp` noexec, bind `127.0.0.1:3100`.

**Caddy:** HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy same-origin, CSP, Permissions-Policy, COOP/CORP.

## Data classification

| Data | Zacházení |
|------|-----------|
| Obchodní objednávky | Read-only (+ FULFILLED + plate-country ACK) |
| Operátorské poznámky | Dashboard-only tabulka |
| Oficiální doklady | Privátní bucket, session proxy |
| Zákaznické faktury | Odděleně od oficiálních |
| Blog obsah | Redakční zápisy povoleny |
| Auth hashes | Lokální volume, mimo Supabase |

Pro AI agenty je autoritativní `AGENTS.md`.
