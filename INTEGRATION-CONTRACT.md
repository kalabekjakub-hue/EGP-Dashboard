# EGP dashboard – integrační kontrakt

> **ZÁVAZNÉ PRAVIDLO:** Produkční data jsou READ-ONLY. Jediné povolené zápisy jsou (1) ruční změna existující položky objednávky na `FULFILLED` včetně auditu a (2) operace Redakce/blogu v redakčních tabulkách a úložištích. Veškerá deduplikace nebo skrývání objednávek musí probíhat pouze při čtení nebo v UI. Objednávky ani jejich položky se kvůli dashboardu nesmí vytvářet, upravovat ani mazat.

## Bezpečnostní hranice

Dashboard je read-only administrativní pohled s výslovně povolenými write operacemi pro fulfillment a oddělenou Redakci/blog. Obchodní data smí měnit pouze tato operace:

```text
POST /api/orders/fulfill-item
```

Operace smí pouze označit existující `order_items` nebo `order_bridge_toll_items` jako `fulfilled` a doplnit `fulfilled_at`. Ostatní ne-GET požadavky nad obchodními daty server odmítne stavem `405`.

Redakční endpoint `DELETE /api/editorial/topics/:id` smí smazat pouze vybrané téma z tabulky `blog_topic_queue`. Nesmí mazat navázaný článek, překlady ani žádná obchodní data. Ostatní zápisy Redakce musí zůstat omezené na tabulky `blog_*` a redakční úložiště.

`POST /api/auth/login` a `POST /api/auth/logout` mění pouze přihlašovací session dashboardu, nikoliv obchodní data v Supabase.

## Pravidla pro další integrace

- Supabase, PostHog, logy, screenshoty, doklady a Retell AI jsou z pohledu dashboardu pouze zdroje pro čtení; výjimkou jsou výslovně povolené fulfillment a redakční operace popsané výše.
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
