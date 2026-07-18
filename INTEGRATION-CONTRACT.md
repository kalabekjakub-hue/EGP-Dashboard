# EGP dashboard – integrační kontrakt

> **ZÁVAZNÉ PRAVIDLO:** Produkční data jsou READ-ONLY. Jediné povolené zápisy jsou (1) ruční změna existující položky objednávky na `FULFILLED` včetně auditu a (2) operace Redakce/blogu v redakčních tabulkách a úložištích. Veškerá deduplikace nebo skrývání objednávek musí probíhat pouze při čtení nebo v UI. Objednávky ani jejich položky se kvůli dashboardu nesmí vytvářet, upravovat ani mazat.

## Bezpečnostní hranice

Dashboard je read-only administrativní pohled. Jeho backend smí měnit produkční data pouze jedinou operací:

```text
POST /api/orders/fulfill-item
```

Operace smí pouze označit existující `order_items` nebo `order_bridge_toll_items` jako `fulfilled` a doplnit `fulfilled_at`. Všechny ostatní ne-GET požadavky pod `/api` server odmítne stavem `405`.

`POST /api/auth/login` a `POST /api/auth/logout` mění pouze přihlašovací session dashboardu, nikoliv obchodní data v Supabase.

## Pravidla pro další integrace

- Supabase, PostHog, logy, screenshoty, doklady, Retell AI a blog jsou z pohledu dashboardu pouze zdroje pro čtení.
- Tajné klíče patří pouze do serverového prostředí na VPS; nikdy do `VITE_*` proměnných.
- Příjem e-mailu, Retell webhooků a dalších externích událostí musí zajišťovat samostatný ingest/worker. Dashboard tato data pouze čte ze Supabase.
- `orders.invoice_pdf_path` označuje fakturu vystavenou EuroGoPass zákazníkovi. Nesmí se prezentovat jako nákupní doklad z oficiálního portálu.
- Doklady z oficiálních portálů musí používat samostatný typ `official_receipt`, samostatná metadata a oddělenou storage cestu. Mohou vzniknout e-mailovým ingestem nebo uploadem z fulfillment workeru.
- Notifikační dispatcher je samostatná služba. Dashboard smí zobrazovat jeho stav a historii; případné budoucí změny nastavení vyžadují samostatné explicitní schválení write endpointů.
- Každý nový zapisovací endpoint musí být jednotlivě přidán do allowlistu a bezpečnostně zkontrolován. Obecné CRUD endpointy nejsou povolené.

## Produkční běh

```bash
npm ci
npm run build
npm start
```

Node server poslouchá standardně pouze na `127.0.0.1:3100`. Veřejný HTTPS provoz má ukončovat Nginx a proxyovat jej na tento lokální port.
