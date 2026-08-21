# EuroGoPass Admin — Redakce, Gmail, integrace a konfigurace

Editorial modul, oficiální doklady z e-mailu, externí systémy a env proměnné.

Další dokumenty: [Projekt](01-projekt-architektura-frontend.md) · [API a bezpečnost](02-api-databaze-bezpecnost.md) · [Vývoj a nasazení](04-vyvoj-nasazeni-provoz.md)

Závazné: [`AGENTS.md`](../AGENTS.md), [`INTEGRATION-CONTRACT.md`](../INTEGRATION-CONTRACT.md), produktový návrh [`EDITORIAL-PLAN.md`](../EDITORIAL-PLAN.md).

---

# 1. Redakce (Editorial)

AI-asistovaná tvorba praktických SEO článků o cestování, dálničních známkách a mýtném ve **24 jazycích**, s lidskou kontrolou před publikací.

## Cíl článku

- Praktický text (řádově jedna A4)
- `target_characters` **500–12 000**, při generování CZ cíl **±10 %**; po třech opravách se text uloží i mimo rozsah
- Organické představení EuroGoPass u konkrétních poplatků i v závěru
- SEO + GEO dohledatelnost

## Workflow

```text
1. Téma (ruční / AI suggest / bulk)
2. Generování českého konceptu (ručně nebo automation worker)
3. Lidská kontrola CZ (+ úpravy / SEO refresh)
4. Překlady do dalších locale (po schválení)
5. Lidská publikace balíku (neúspěšné jazyky neblokují úspěšné)
```

**Automatizace nesmí sama publikovat ani překládat.** Worker končí u českého konceptu ke kontrole.

## UI

Soubor: `src/editorial.tsx` (+ `editorial-versioning.ts`).

| Část | Funkce |
|------|--------|
| Home | Fronta témat, články, generate/suggest |
| Editor | Vizuální Markdown editor, locale switcher |
| Settings | Automatizace, autosave, limity |
| Guides | CRUD Markdown podkladů |
| Keywords | Import / přehled SEO poolu |

Cesty: `/editorial`, `/editorial/articles/:id`, `/editorial/articles/:id/languages/:locale`.

## Verzování

| Úroveň | Příklad | Význam |
|--------|---------|--------|
| Společná revize | `V4` | Obsahová revize celého jazykového balíku |
| Lokální revize | `V4 · CS1` | Úprava jednoho jazyka bez sync |

Autosave nezasahuje do čísla verze. **Uložit verzi** zvyšuje lokální revizi. Sync ostatních = explicitní akce → nová společná verze. Publikace může obsahovat nesjednocené revize (s varováním).

## AI vrstva

`editorial-api.ts` + `editorial-worker.ts`.

| Env | Default | Použití |
|-----|---------|---------|
| `OPENAI_ARTICLE_MODEL` | `gpt-5.6-terra` | Články |
| `OPENAI_TRANSLATION_MODEL` | `gpt-5.6-terra` | Překlady |
| `OPENAI_UTILITY_MODEL` | `gpt-5.6-luna` | Návrhy / utility |

### Hard contracts (`editorial-prompts/`) — nesmějí přepsat user guides

| Soubor | Obsah |
|--------|--------|
| `seo-geo.md` | SEO/GEO pravidla a audit |
| `internal-links.md` | Povolené interní odkazy |
| `keyword-clusters.md` | Clustery, deterministické řazení |
| `writing-styles.md` | `balanced`, `factual`, `roadmate` |

### Editovatelné guides (`blog_editorial_guides` / seed `editorial-guides/`)

Hlavní: `editor-prompt.md`. Doladění: styl, struktura, brand, rules. Max 20 000 znaků, název končí `.md`.

### Interní odkazy (přesné HTTPS na `eurogopass.com`)

- `/:locale#home-hero`
- `/:locale/coverage`
- `/:locale/coverage/:country`
- `/:locale/plus`

Locale musí sedět s jazykovou verzí; kotva popisná. Holé URL a vymyšlené cesty zakázány. V zákaznickém textu žádné odkazy mimo `eurogopass.com`; oficiální URL jen v `claims.source_urls`.

### Style profiles

`balanced` | `factual` | `roadmate` → `blog_topic_queue.style_profile` → kopie do `blog_posts.style_profile`.

## SEO / GEO pool

- Import ručního seznamu nebo **CSV Google Search Console** do `blog_seo_keywords`
- Při shodě update metrik; **neautomatické mazání** chybějících
- Vazby v `blog_topic_keywords` / `blog_post_keywords`
- Audit v `blog_seo_audits`: poradní skóre 0–100 — **neblokuje publikaci**
- `seo-refresh`: nový výběr záměrů, draft, run `rewrite`, audit; musí zachovat podstatu textu

**Clustering:** cena / nákup / kontrola / délky platnosti stejného produktu v jedné zemi → standardně podsekce jednoho článku. Řazení kandidátů deterministické. Po použití (návrh / článek / publikace) priorita výrazu rapidně klesne. Stejné primární slovo, silný překryv clusteru nebo skoro stejný titulek se nesmí navrhnout znovu.

## Automatizace (worker)

`npm run editorial:worker` · interval `EDITORIAL_POLL_INTERVAL_MS` (prod 300000).  
Respektuje `blog_automation_settings`. Po limitu nezkontrolovaných konceptů se generování pozastaví. Zápisy jen `blog_*`.

## Publikace a mazání

- Publikace jen člověk; `published_by` = e-mail session
- Úprava publikovaného → koncept; web až po „Publikovat změny“
- Mazání **tvrdé** (bez koše); UI vyjmenuje rozsah
- `DELETE topics/:id` maže jen frontu
- `DELETE hero` maže jen objekt v `blog-hero-images` + null URL

| Soubor | Role |
|--------|------|
| `editorial-api.ts` | REST + OpenAI |
| `editorial-worker.ts` | Polling |
| `editorial-api.test.ts` | Testy |
| `src/editorial.tsx` | UI |

---

# 2. Gmail ingest

Sidecar: `mail-ingest.ts`  
`npm run ingest:mail` (kontinuální) · `npm run ingest:mail:backfill` · `npm run gmail:authorize`

## Proč

Zákaznická faktura EuroGoPass **není** nákupní doklad z portálu. Oficiální doklady: typ `official_receipt` (nebo confirmation / original_email), bucket `official-documents`, metadata `order_documents`, odděleně v UI.

## Tok

```text
Gmail API (gmail.readonly)
  → filtr odesílatele / mapa zemí
  → mailparser + pdf-parse
  → SPZ / země → párování objednávky
  → Storage + order_documents
  → email_ingest_messages (idempotence)
```

Stavy: `ignored` | `matched` | `review` | `error`.

## Konfigurace

| Proměnná | Význam |
|----------|--------|
| `GMAIL_CLIENT_ID` / `SECRET` / `REFRESH_TOKEN` | OAuth |
| `GMAIL_USER_ID` | Typicky `me` |
| `GMAIL_ENV_PATH` | Prod: `secrets/gmail.env` |
| `MAIL_INGEST_INTERVAL_MS` | Poll (prod často 15000) |
| `MAIL_INGEST_LOOKBACK_DAYS` | Okno zpět |
| `MAIL_INGEST_MAX_MESSAGES_PER_CYCLE` | Cap na cyklus |
| `MAIL_ORDER_WAIT_MS` | Čekání na objednávku |
| `MAIL_SENDER_COUNTRY_MAP_FILE` | `config/mail-senders.json` |
| `MAIL_SENDER_COUNTRY_MAP` | Inline JSON fallback |
| `GMAIL_HEALTH_FILE` | Health pro `/api/gmail/status` |

Mapa odesílatelů: doména/adresa → ISO země. Jen ověřené oficiální odesílatele.

**Compose:** stejný image, `npm run ingest:mail`, `secrets/production.env` + `secrets/gmail.env`, volume `./runtime`, host network.

Dashboard jen čte (`/api/gmail/status`, `/api/documents`). OAuth scope readonly; privátní bucket; idempotence přes `gmail_message_id` + `sha256`.

---

# 3. Integrace

| Systém | Role |
|--------|------|
| **Supabase** | Postgres + Storage; Auth **ne** pro login dashboardu; service_role jen server |
| **EGP Worker monitor** | `EGP_WORKER_MONITOR_URL` (:3090) + token; proxy logů/eventů |
| **Wise Worker** | Health `WISE_WORKER_HEALTH_URL` (:3081); jen čtení |
| **PostHog EU** | UI `VITE_POSTHOG_*`; server Query API + personal key; `ANALYTICS_*_SINCE` |
| **OpenAI** | Editorial; tokeny/náklady v `blog_generation_runs` |
| **Gmail API** | Oficiální doklady (viz výše) |
| **Google Search Console** | Jen CSV import do keyword poolu; žádný write-back |
| **Retell AI** | Externí odkaz; ingest = samostatná služba |
| **Caddy** | HTTPS `admin.eurogopass.com` |
| **Notifikační dispatcher** | Samostatná služba; dashboard jen čte (write settings zatím ne) |

### Pravidlo pro nové integrace

- Tajné klíče jen na VPS
- Externí event ingest = sidecar/worker, ne SPA
- Každý nový write endpoint jednotlivě do allowlistu + security review
- Obecné CRUD endpointy nejsou povolené

---

# 4. Konfigurace

Šablona: [`.env.example`](../.env.example). Lokálně `.env.local`. Prod: `secrets/production.env` + `secrets/gmail.env`.

## Veřejné (`VITE_*`)

| Proměnná | Význam |
|----------|--------|
| `VITE_DATA_MODE` | `demo` (default) nebo live |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Veřejné Supabase |
| `VITE_POSTHOG_HOST` / `VITE_POSTHOG_KEY` | UI PostHog |

## Server / dashboard

| Proměnná | Význam |
|----------|--------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server |
| `EGP_ADMIN_EMAILS` | Extra allowlist |
| `EGP_PUBLIC_ORIGIN` | Např. `https://admin.eurogopass.com` |
| `EGP_AUTH_FILE` | Cesta k `users.json` |
| `HOST` / `PORT` | Default `127.0.0.1` / `3100` |
| `NODE_ENV` | production / development |

## Workery

| Proměnná | Význam |
|----------|--------|
| `EGP_WORKER_MONITOR_URL` / `TOKEN` | Monitor API |
| `EGP_WORKER_ENV_PATH` | Shared env soubor |
| `WISE_WORKER_HEALTH_URL` | Wise health |

## PostHog server

`POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY`, `ANALYTICS_PRODUCTION_SINCE`, `ANALYTICS_TRACKING_SINCE`.

## OpenAI / editorial

`OPENAI_API_KEY`, `OPENAI_ARTICLE_MODEL`, `OPENAI_TRANSLATION_MODEL`, `OPENAI_UTILITY_MODEL`, `EDITORIAL_POLL_INTERVAL_MS`.

## Non-secret soubory

| Cesta | Obsah |
|-------|--------|
| `config/mail-senders.json` | Odesílatel → země |
| `Caddyfile` | Doména + headers |
| `docker-compose.production.yml` | Služby |
| `editorial-prompts/*.md` | Hard AI contracts |
| `eslint.config.js` / `tsconfig*.json` / `vite.config.ts` | Tooling |

## Runtime (gitignored)

`runtime/auth/users.json`, `runtime/gmail-health.json`, `secrets/*`, `dist/`.

## Načítání env

`server-config.ts`: Vite `loadEnv` → `EGP_WORKER_ENV_PATH` → `process.env` (nejvyšší priorita).
