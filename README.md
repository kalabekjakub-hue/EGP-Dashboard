# EuroGoPass Admin

Samostatný interní dashboard pro objednávky ze Supabase, EGP Worker, Wise Worker, logy, screenshoty, doklady a AI redakci blogu.

Produkce: [https://admin.eurogopass.com](https://admin.eurogopass.com)

## Dokumentace

Celá dokumentace je ve **4 souborech** ve složce [`docs/`](docs/README.md):

1. [Projekt, architektura, frontend](docs/01-projekt-architektura-frontend.md)
2. [API, databáze, bezpečnost](docs/02-api-databaze-bezpecnost.md)
3. [Redakce, Gmail, integrace, konfigurace](docs/03-redakce-integrace-konfigurace.md)
4. [Vývoj, nasazení, provoz](docs/04-vyvoj-nasazeni-provoz.md)

Závazné kontrakty: [`AGENTS.md`](AGENTS.md), [`INTEGRATION-CONTRACT.md`](INTEGRATION-CONTRACT.md).

## Lokální spuštění

```bash
npm install
npm run dev
```

Produkční kontrola:

```bash
npm run build
npm start
```

## Datový režim

Výchozí `VITE_DATA_MODE=demo` používá výhradně smyšlená data ze `src/data.ts`. Produkční data se nesmí kombinovat s demem. Do `VITE_*` patří pouze veřejné hodnoty; privilegované klíče zůstávají na serveru/workeru.
