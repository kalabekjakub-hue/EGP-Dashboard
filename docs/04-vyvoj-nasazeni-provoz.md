# EuroGoPass Admin — Vývoj, nasazení a provoz

Lokální setup, Docker/Caddy/CI a troubleshooting.

Další dokumenty: [Projekt](01-projekt-architektura-frontend.md) · [API a bezpečnost](02-api-databaze-bezpecnost.md) · [Redakce a integrace](03-redakce-integrace-konfigurace.md)

Ops: [`NOVA-VPS-ZADANI-PRO-KOLEGU.md`](../NOVA-VPS-ZADANI-PRO-KOLEGU.md) · [`VERCEL-DNS-ADMIN-SUBDOMENA.md`](../VERCEL-DNS-ADMIN-SUBDOMENA.md) · [`ROADMAP.md`](../ROADMAP.md)

---

# 1. Lokální vývoj

## Požadavky

- Node.js **24** (image `node:24-bookworm-slim`)
- npm (`package-lock.json`)
- Volitelně Supabase / worker monitor pro live režim

## Instalace

```bash
cd "C:\Users\Jakub\Desktop\EGP DSHBRD"
npm install
copy .env.example .env.local
```

Pro začátek nech `VITE_DATA_MODE=demo`.

## Skripty

| Skript | Příkaz | Účel |
|--------|--------|------|
| `dev` | `vite` | Dev server + API middlewares |
| `build` | `tsc -b && vite build` | Typecheck + SPA do `dist/` |
| `start` | `tsx server.ts` | Prod Node server |
| `preview` | `vite preview` | Náhled buildu |
| `lint` | `eslint .` | Lint |
| `test` | `node --import tsx --test editorial-api.test.ts` | Testy Redakce |
| `ingest:mail` | `tsx mail-ingest.ts` | Kontinuální Gmail ingest |
| `ingest:mail:backfill` | `tsx mail-ingest.ts --once --all` | Historický import |
| `gmail:authorize` | `tsx scripts/gmail-authorize.ts` | OAuth |
| `editorial:worker` | `tsx editorial-worker.ts` | Redakční loop |

## Demo vs live

1. **Demo** — bez produkčních tajemství; `src/data.ts`
2. **Live** — `SUPABASE_*`, allowlist, workery; **nemíchej** s demem

Při `npm run dev` běží stejné `/api/*` pluginy jako v produkci.

## Testování

```bash
npm test
npm run lint
npm run build
```

Manuálně: login/logout, orders demo i live, FULFILLED/poznámky (opatrně), dokumenty/screenshoty, redakční happy path.

## Co editovat

| Cesta | Editovat? |
|-------|-----------|
| `src/*`, `vite.config.ts`, `editorial-api.ts`, `mail-ingest.ts` | ano |
| `supabase/migrations/` | ano (aditivní SQL) |
| `secrets/`, `runtime/` | lokální, necommitovat |
| `dist/`, `node_modules/` | generované |

## Windows

- Path s mezerou (`EGP DSHBRD`) uvozuj
- `EGP_WORKER_ENV_PATH` uprav dle stroje
- Prod-like: `npm run build && npm start` → `http://127.0.0.1:3100`

## Bezpečnost při vývoji

Necommituj `.env*`, `secrets/`, `runtime/auth`. Service role ne do frontendu. Nové write endpointy nejdřív do `AGENTS.md` + `INTEGRATION-CONTRACT.md`.

---

# 2. Nasazení

## Produkční cíl

| Položka | Hodnota |
|---------|---------|
| Doména | `admin.eurogopass.com` |
| VPS IP | `195.133.93.51` |
| SSH | `egpadmin` |
| App path | `/opt/egp-admin/app` |
| Listen | `127.0.0.1:3100` |
| TLS | Caddy |

## Docker image

Multi-stage `Dockerfile`:

1. Build: `npm ci` + `npm run build`
2. Runtime: `npm ci --omit=dev`, copy `dist` + TS servery (`server.ts`, `vite.config.ts`, `editorial-api.ts`, `mail-ingest.ts`, …) + prompts/config/src
3. `CMD npm start`, `EXPOSE 3100` (runtime přes `tsx`)

## Compose služby

`docker-compose.production.yml`:

| Service | Command | Poznámka |
|---------|---------|----------|
| `dashboard` | `npm start` | read-only FS, auth volume |
| `gmail-ingest` | `npm run ingest:mail` | + `secrets/gmail.env` |
| `editorial-worker` | `npm run editorial:worker` | read-only FS |
| `caddy` | default | `Caddyfile` + data volumes |

Všechny: `network_mode: host`, `restart: unless-stopped`, log rotate 10m × 3.

Volumes: `dashboard_auth` → `/app/auth-data`; `./runtime`; `caddy_data` / `caddy_config`.  
Env: `secrets/production.env`.

## Caddy

```text
admin.eurogopass.com {
  reverse_proxy 127.0.0.1:3100
  # + security headers / CSP
}
```

Poznámka: `INTEGRATION-CONTRACT.md` historicky zmiňuje Nginx; **aktuálně Caddy**.

## CI/CD

`.github/workflows/deploy.yml` — push `main` / `workflow_dispatch`:

1. Checkout + SSH (`VPS_SSH_PRIVATE_KEY`)
2. `rsync` na VPS (exclude `.git`, `secrets/`, `runtime/`, `node_modules/`, `dist/`)
3. `bash scripts/deploy-production.sh` → `docker compose up -d --build` + health curl

## Manuální deploy

```bash
ssh egpadmin@195.133.93.51
cd /opt/egp-admin/app
bash scripts/deploy-production.sh
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs -f dashboard
```

## Migrace DB

SQL v `supabase/migrations/` — oddělený ops krok (Management API helper `runtime/apply-supabase-migration.sh`). Deploy dashboardu migrace **nespouští**.

## Checklist po nasazení

- [ ] `curl -fsS http://127.0.0.1:3100/` OK
- [ ] HTTPS `https://admin.eurogopass.com` OK
- [ ] Login allowlistovaného účtu
- [ ] Worker status (EGP + Wise)
- [ ] Objednávky live (ne demo)
- [ ] Gmail health / dokumenty
- [ ] Editorial worker (pokud žádaný)
- [ ] Caddy cert platný

## Rollback (orientačně)

Rsync/checkout předchozí revision → znovu deploy script. Auth volume a secrets nemazat bez důvodu.

---

# 3. Provoz a troubleshooting

## Rychlá diagnostika

```bash
ssh egpadmin@195.133.93.51
cd /opt/egp-admin/app

docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs --tail=100 dashboard
docker compose -f docker-compose.production.yml logs --tail=100 gmail-ingest
docker compose -f docker-compose.production.yml logs --tail=100 editorial-worker
docker compose -f docker-compose.production.yml logs --tail=50 caddy

curl -fsS http://127.0.0.1:3100/ >/dev/null && echo OK
```

## Časté problémy

### Nelze se přihlásit

Allowlist, heslo 12–128, rate limit 5/15 min, `EGP_PUBLIC_ORIGIN`, auth volume/prava, Secure cookie jen přes HTTPS.

### Objednávky prázdné / demo

`VITE_DATA_MODE=demo` v buildu → rebuild live; chybí `SUPABASE_*` v secrets; API 500 → logy + Supabase.

### Worker pilulky červené

Monitor URL/token / Wise health nedostupné; firewall/routing mezi VPS (host network).

### Screenshoty / doklady prázdné

Session; storage path; běží `gmail-ingest`? Aktualizuje se health file?

### Gmail nic nepáruje

Refresh token, `mail-senders.json`, lookback/interval, objednávka ještě není (`review` + `MAIL_ORDER_WAIT_MS`), logy + `email_ingest_messages`.

### Redakce chyby

API key / modely, `max_pending_reviews`, `enabled=false`, OpenAI rate limits → `blog_generation_runs.error`. Délka mimo ±10 % článek nezahodí.

### Deploy CI selhal

SSH secret, disk, OOM (4 GB RAM), health timeout → logy z deploy scriptu.

### HTTPS / Caddy

DNS A, porty 80/443, volume `caddy_data`, CSP vs. browser console.

## Co sledovat

| Signál | Kde |
|--------|-----|
| App up | curl + Caddy |
| Auth | loginy, rate limity |
| Fulfillment | worker status + logy |
| Doklady | gmail health + `email_ingest_messages` |
| Redakce | review fronta, failed runs, náklady |
| Disk / logy | Docker rotate, Storage |

## Incident response

1. Rozliš dashboard vs. worker vs. Supabase.
2. Obchodní data neopravuj mimo FULFILLED.
3. Restart sidecar: `docker compose -f docker-compose.production.yml restart gmail-ingest`
4. Žádný DB cleanup „pro pořádek“ — dedup jen v UI (`202607180005`).
5. Nové write fixy jen přes kontrakt.

## Roadmap (zatím ne v produkci)

Z `ROADMAP.md`: rozšířené Centrum pozornosti; Denní souhrn (objednávky, tržby, fail rate, země).
