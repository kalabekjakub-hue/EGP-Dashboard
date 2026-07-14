# EuroGoPass Admin

Samostatný interní dashboard pro objednávky ze Supabase, EGP Worker, Wise Worker, logy, screenshoty a doklady.

## Lokální spuštění

```bash
npm install
npm run dev
```

Produkční kontrola:

```bash
npm run build
```

## Datový režim

Výchozí `VITE_DATA_MODE=demo` používá výhradně smyšlená data ze `src/data.ts`. Živé konektory budou zapojené přes samostatnou datovou vrstvu; produkční data se nesmí kombinovat s demem. Do proměnných `VITE_*` patří pouze veřejné hodnoty. Privilegované klíče musí zůstat v serverové/worker vrstvě.

