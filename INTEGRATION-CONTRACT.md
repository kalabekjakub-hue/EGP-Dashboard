# EGP dashboard – integrační kontrakt

> **ZÁVAZNÉ PRAVIDLO:** Produkční data jsou READ-ONLY. Jediné povolené zápisy jsou (1) ruční změna existující položky objednávky na `FULFILLED` včetně auditu a (2) operace Redakce/blogu v redakčních tabulkách a úložištích. Veškerá deduplikace nebo skrývání objednávek musí probíhat pouze při čtení nebo v UI. Objednávky ani jejich položky se kvůli dashboardu nesmí vytvářet, upravovat ani mazat.

## Bezpečnostní hranice

Dashboard je read-only administrativní pohled s výslovně povolenými write operacemi pro fulfillment a oddělenou Redakci/blog. Obchodní data smí měnit pouze tato operace:

```text
POST /api/orders/fulfill-item
```

Operace smí pouze označit existující `order_items` nebo `order_bridge_toll_items` jako `fulfilled` a doplnit `fulfilled_at`. Ostatní ne-GET požadavky nad obchodními daty server odmítne stavem `405`.

Změna položky a zápis do `manual_fulfillment_audit` musí proběhnout atomicky v jediné databázové transakci prostřednictvím `manual_fulfill_order_item`. Funkce smí měnit výhradně `status` a `fulfilled_at`; při selhání auditu se musí vrátit zpět i změna položky. Spuštění RPC je povoleno pouze serverové roli dashboardu a až po ověření administrátorské session.

Přístup k dashboardu je omezen explicitním serverovým allowlistem `EGP_ADMIN_EMAILS`. Samotná existence účtu v Supabase Auth neopravňuje k přístupu do administrace.

Redakční endpoint `DELETE /api/editorial/topics/:id` smí smazat pouze vybrané téma z tabulky `blog_topic_queue`. Nesmí mazat navázaný článek, překlady ani žádná obchodní data. Ostatní zápisy Redakce musí zůstat omezené na tabulky `blog_*` a redakční úložiště.

Při zapnuté automatizaci smí samostatný redakční worker vytvářet AI témata, generační auditní záznamy, nepublikované články, jejich jazykové koncepty, zdroje a ověřovaná tvrzení, a to pouze v tabulkách `blog_*`. Automatizace se musí zastavit ve stavu ke kontrole a nikdy nesmí sama publikovat. Publikaci smí vyvolat pouze přihlášený uživatel.

Redakční endpoint `DELETE /api/editorial/articles/:id/hero` smí odstranit pouze hlavní obrázek daného článku z bucketu `blog-hero-images` a vyprázdnit `blog_posts.hero_image_url`. Nesmí měnit ani mazat jiné soubory, článek, překlady nebo obchodní data.

Při publikaci smí redakční endpoint uložit do `blog_posts.published_by` e-mail uživatele z ověřené dashboard session. Hodnota slouží pouze jako auditní údaj autora poslední publikace.

Endpointy `GET|POST /api/editorial/guides` a `PUT|DELETE /api/editorial/guides/:id` smějí číst a měnit pouze redakční Markdown podklady v `blog_editorial_guides`. Jeden dokument smí mít nejvýše 20 000 znaků, název musí končit `.md` a aktivní obsah se smí připojit pouze k promptům Redakce. Tyto endpointy nesmí zapisovat do obchodních tabulek ani jiných úložišť.

Backend Redakce načítá verzované soubory `editorial-prompts/seo-geo.md` a `editorial-prompts/internal-links.md` jako závazné základní smlouvy pro návrh tématu, tvorbu článku, překlady, průběžnou optimalizaci a SEO/GEO audit. Uživatelské Markdown podklady je smějí pouze doplnit; nesmějí přepsat jejich bezpečnostní hranice, práci s importovanými klíčovými slovy, povolený katalog interních odkazů ani požadovaný strukturovaný výstup.

AI smí do článků vkládat standardní klikací Markdown odkazy. Interní odkazy EuroGoPass musí používat přesnou HTTPS doménu `eurogopass.com`, locale shodný s jazykovou verzí a pouze ověřené cesty plánovače `/:locale#home-hero`, přehledu `/:locale/coverage` nebo země `/:locale/coverage/:country`. Odkaz musí mít popisnou lokalizovanou kotvu; holé URL, vymyšlené cesty a automatická tvrzení o funkci cílové stránky nejsou povolené. Externí odkaz smí být použit pouze jako přesná URL skutečně získaného relevantního zdroje.

Endpointy `GET /api/editorial/keywords` a `POST /api/editorial/keywords/import` smějí číst a slučovat pouze redakční SEO/GEO výrazy v `blog_seo_keywords`. Import přijímá ruční seznam nebo CSV export Google Search Console, při shodě normalizovaného výrazu aktualizuje jeho redakční metriky a nesmí automaticky mazat chybějící řádky. Vazby vybraných výrazů na témata a články smějí vznikat pouze v `blog_topic_keywords` a `blog_post_keywords`.

Endpoint `GET|POST /api/editorial/articles/:id/locales/:locale/seo-audit` smí číst nebo vytvořit pouze neblokující SEO/GEO redakční kontrolu v `blog_seo_audits`. Výsledek nesmí sám publikovat článek, měnit obchodní data ani zabránit ruční publikaci.

Endpoint `POST /api/editorial/articles/:id/locales/:locale/seo-refresh` smí provést pouze cílenou SEO/GEO optimalizaci existující jazykové verze. Z aktuálního redakčního poolu může znovu vybrat relevantní záměry, nahradit vazby výhradně pro daný `post_id` v `blog_post_keywords`, uložit novou konceptovou revizi do `blog_translation_drafts`, zapsat běh typu `rewrite` do `blog_generation_runs` a obnovit odpovídající `blog_seo_audits`. Pokud zůstane výběr i pořadí záměrů stejné, obsah ani jeho revize se nesmějí měnit. Výstup musí projít deterministickou kontrolou zachování podstatné části textu a přiměřené délky; při selhání se obsah ani vazby klíčových slov nesmějí změnit. Endpoint nesmí přidávat nová fakta, měnit zdroje, publikovat, přepisovat ostatní jazykové verze ani zapisovat mimo tabulky `blog_*`. Ostatní jazyky se po úspěšné změně označí stávajícím verzovacím mechanismem jako nesjednocené a aktualizují se až explicitním překladovým krokem.

Endpoint `PATCH /api/editorial/topics/:id` smí upravit pouze text existujícího redakčního tématu v `blog_topic_queue`; nesmí automaticky měnit již připojená klíčová slova, článek ani obchodní data.

`POST /api/auth/login` a `POST /api/auth/logout` mění pouze přihlašovací session dashboardu, nikoliv obchodní data v Supabase.

Při prvním úspěšném `POST /api/auth/login` pro e-mail z explicitního dashboard allowlistu smí server vytvořit lokální přihlašovací záznam v odděleném persistentním auth úložišti. Ukládá se pouze normalizovaný e-mail, náhodná sůl, `scrypt` hash hesla a čas vytvoření; heslo v otevřené podobě se nesmí uložit. Další přihlášení musí heslo ověřit časově bezpečným porovnáním. Tato operace nesmí vytvářet Supabase Auth účet ani měnit obchodní či redakční data.

Všechny e-maily v dashboard allowlistu mají totožná dashboard oprávnění. Přednastavené heslo účtu `info@eurogopass.com` smí být v aplikaci uloženo pouze jako osolený `scrypt` hash, nikdy v otevřené podobě.

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
