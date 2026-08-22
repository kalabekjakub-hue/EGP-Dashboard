# EGP dashboard – integrační kontrakt

> **ZÁVAZNÉ PRAVIDLO:** Produkční data jsou READ-ONLY. Jediné povolené zápisy jsou (1) ruční změna existující položky objednávky na `FULFILLED` včetně auditu a volitelné poznámky, (2) operátorské poznámky k položce v `dashboard_order_item_notes` (uložení/nahrazení a smazání), (3) operace Redakce/blogu v redakčních tabulkách a úložištích a (4) ruční ACK `plate_country_conflict` na existující objednávce včetně mirroru na položky a auditního záznamu. Veškerá deduplikace nebo skrývání objednávek musí probíhat pouze při čtení nebo v UI. `GET /api/orders` a paid analytics berou jen stavy `pending`, `paid`, `awaiting_payment` / `waiting_payment` a historické `fulfilled`; stav `test` a testovací SPZ složené jen z písmen A se vyřadí při čtení, bez zápisu do databáze. Objednávky ani jejich položky se kvůli dashboardu nesmí vytvářet, upravovat ani mazat mimo výslovně povolené FULFILLED a plate-country ACK.

## Bezpečnostní hranice

Dashboard je read-only administrativní pohled s výslovně povolenými write operacemi pro fulfillment, poznámky k položkám, plate-country ACK a oddělenou Redakci/blog. Obchodní data smí měnit pouze tyto operace:

```text
POST /api/orders/fulfill-item
POST /api/orders/item-notes
DELETE /api/orders/item-notes
GET  /api/orders/item-notes?orderId=...
POST /api/orders/ack-plate-country-conflict
```

Operace `POST /api/orders/fulfill-item` smí pouze označit existující `order_items` nebo `order_bridge_toll_items` jako `fulfilled`, doplnit `fulfilled_at` a volitelně uložit operátorskou poznámku do `manual_fulfillment_audit.note`. Ostatní ne-GET požadavky nad obchodními daty server odmítne stavem `405`.

Změna položky a zápis do `manual_fulfillment_audit` musí proběhnout atomicky v jediné databázové transakci prostřednictvím `manual_fulfill_order_item`. Funkce smí měnit výhradně `status` a `fulfilled_at` na položce a zapsat auditní řádek včetně volitelného `note`; při selhání auditu se musí vrátit zpět i změna položky. Spuštění RPC je povoleno pouze serverové roli dashboardu a až po ověření administrátorské session.

Operace `POST /api/orders/item-notes` smí pro existující položku nahradit aktivní poznámku v `dashboard_order_item_notes` (smaze předchozí řádky stejné položky a vloží nový). Nesmí měnit `order_items`, `order_bridge_toll_items` ani jiná obchodní pole. Text poznámky je omezen na 2000 znaků. Operace `DELETE /api/orders/item-notes` smí smazat pouze řádky `dashboard_order_item_notes` pro dané `orderId` + `itemId`. Čtení poznámek probíhá přes `GET /api/orders/item-notes`.

Operace `POST /api/orders/ack-plate-country-conflict` smí pouze uvolnit hold `plate_country_conflict` na existující objednávce. Zápis musí proběhnout atomicky přes RPC `ack_plate_country_conflict`: nastavit `orders.plate_country_conflict = false`, zrcadlit stejnou hodnotu do `order_items` a `order_bridge_toll_items` daného `order_id` a zapsat auditní řádek do `dashboard_plate_country_conflict_acks` (včetně `actor_email` a předchozí hodnoty). Nesmí měnit status, SPZ, zemi registrace, platby ani jiná obchodní pole a nesmí nastavit hodnotu na `NULL`. Spuštění RPC je povoleno pouze serverové roli dashboardu a až po ověření administrátorské session.

Přístup k dashboardu je omezen explicitním serverovým allowlistem `EGP_ADMIN_EMAILS`. Samotná existence účtu v Supabase Auth neopravňuje k přístupu do administrace.

Redakční endpoint `DELETE /api/editorial/topics/:id` smí smazat pouze vybrané téma z tabulky `blog_topic_queue`. Nesmí mazat navázaný článek, překlady ani žádná obchodní data. Ostatní zápisy Redakce musí zůstat omezené na tabulky `blog_*` a redakční úložiště.

Při zapnuté automatizaci smí samostatný redakční worker vytvářet AI témata, generační auditní záznamy, nepublikované české články, jejich zdroje a ověřovaná tvrzení, a to pouze v tabulkách `blog_*`. Worker nesmí sám spouštět překlady. Automatizace se musí zastavit ve stavu ke kontrole a nikdy nesmí sama publikovat. Publikaci i překlady smí vyvolat pouze přihlášený uživatel.

Redakční endpoint `DELETE /api/editorial/articles/:id/hero` smí odstranit pouze hlavní obrázek daného článku z bucketu `blog-hero-images` a vyprázdnit `blog_posts.hero_image_url`. Nesmí měnit ani mazat jiné soubory, článek, překlady nebo obchodní data.

Při publikaci smí redakční endpoint uložit do `blog_posts.published_by` e-mail uživatele z ověřené dashboard session. Hodnota slouží pouze jako auditní údaj autora poslední publikace.

Endpointy `GET|POST /api/editorial/guides` a `PUT|DELETE /api/editorial/guides/:id` smějí číst a měnit pouze redakční Markdown podklady v `blog_editorial_guides`. Jeden dokument smí mít nejvýše 20 000 znaků, název musí končit `.md` a aktivní obsah se smí připojit pouze k promptům Redakce. Tyto endpointy nesmí zapisovat do obchodních tabulek ani jiných úložišť.

Backend Redakce načítá verzované soubory `editorial-prompts/seo-geo.md`, `editorial-prompts/internal-links.md`, `editorial-prompts/keyword-clusters.md` a `editorial-prompts/writing-styles.md` jako závazné základní smlouvy pro návrh tématu, tvorbu článku, překlady, průběžnou optimalizaci a SEO/GEO audit. Soubor `writing-styles.md` drží pouze tenké profily `balanced`, `factual` a `roadmate`. Hlavní redaktorský prompt je editovatelný Markdown podklad `editor-prompt.md` v `blog_editorial_guides`; podklad `eurogopass.md` je zdroj pravdy o službě, katalogu a zakázaných tématech. Ostatní aktivní uživatelské Markdown podklady ho doladí stylem, strukturou, terminologií a rolí EuroGoPass. Uživatelské podklady nesmějí přepsat bezpečnostní hranice, katalog produktů, práci s importovanými klíčovými slovy, povolený katalog interních odkazů ani požadovaný strukturovaný výstup.

AI smí do článků vkládat standardní klikací Markdown odkazy. Interní odkazy EuroGoPass musí používat přesnou HTTPS doménu `eurogopass.com`, locale shodný s jazykovou verzí a pouze ověřené cesty plánovače `/:locale#home-hero`, přehledu `/:locale/coverage`, země `/:locale/coverage/:country` nebo Plus `/:locale/plus`. Odkaz musí mít popisnou lokalizovanou kotvu; holé URL, vymyšlené cesty a automatická tvrzení o funkci cílové stránky nejsou povolené. Zákaznický text (`body_md`, perex, titulek, SEO pole) nesmí obsahovat odkaz, holou URL, závorku s doménou mimo `eurogopass.com`, název oficiálního portálu (edalnice, eznamka, nemzetiutdij, EPASS24, ASFINAG a podobně) ani údaj, že informace pochází z oficiálního webu. Rešerše na státních webech je povolená; oficiální URL smí být jen v interních `claims.source_urls`, nikoli ve čtenářském článku. Další krok čtenáře je vždy EuroGoPass, nikoli státní e-shop. EuroGoPass se nesmí označovat jako oficiální státní portál.

Endpointy `GET /api/editorial/keywords` a `POST /api/editorial/keywords/import` smějí číst a slučovat pouze redakční SEO/GEO výrazy v `blog_seo_keywords`. Import přijímá ruční seznam nebo CSV export Google Search Console, při shodě normalizovaného výrazu aktualizuje jeho redakční metriky a nesmí automaticky mazat chybějící řádky. Vazby vybraných výrazů na témata a články smějí vznikat pouze v `blog_topic_keywords` a `blog_post_keywords`.

Návrh tématu musí před výběrem článku posoudit společný významový cluster napříč jazyky a metrikami. Cena, nákup, kontrola a délky platnosti stejného produktu v jedné zemi se mají standardně stát podsekcemi jednoho hlavního článku; samostatné úzké téma je přípustné pouze při odlišném praktickém postupu nebo silném vlastním záměru. Počet navázaných výrazů nemá pevné minimum ani maximum. Řazení kandidátů musí být deterministické a rozmanitost se smí řídit pouze redakčními čítači využití, nikoli náhodným přeskupením jednotlivých dotazů. Po návrhu tématu nebo vygenerování článku musí priorita použitých výrazů výrazně klesnout. Nové téma nesmí zopakovat stejné primární klíčové slovo, silně se překrývající cluster ani téměř shodný titulek existujícího tématu nebo článku. Použitý výraz smí vstoupit do nového článku jen jako podpůrný v jiné kombinaci. Výchozí návrh tématu (`productFocus` zapnutý, výchozí `true`) musí mít hlavní záměr v nabídce EuroGoPass (e-známky CZ/SK/AT/HU/SI/RO/BG/CH/MD, rakouské úsekové mýto, rumunské a bulharské mosty, Free-Flow FR/NO/SE, Øresund, Plus u známek). Destinace bez produktu smí být jen podpůrný kontext trasy. `POST /api/editorial/topics/suggest` smí přepínač `productFocus: false` vypnout. Katalog vozidel platí vždy: články i návrhy témat jsou pro osobní a lehká vozidla do 3,5 t; nákladní auta, GO-Box, HU-GO, ekologické plakety a jiné neprodávané systémy nesmí být hlavní téma ani primární klíčové slovo, i když query zmiňuje prodejní zemi. Backend musí takové výrazy klasifikovat jako `out_of_scope` a z clusteru je vyřadit.

Vygenerovaný český `body_md` má cílit na `blog_topic_queue.target_characters` včetně mezer, plus minus 10 %, raději ke středu až spodku rozsahu a bez překročení maxima. Výchozí `target_characters` v redakčním UI a při chybějící hodnotě na tématu je 4 500. Prompt musí délku zadat jako závazný počet znaků. Backend musí délku po generování přepočítat, bezpečně zkrátit výplň bez změny čísel a odkazů a mimo rozsah provést nejvýše tři cílené opravy bez webové rešerše, změny faktů, čísel nebo odkazů. Pokud ani opravený text rozsah nesplní, článek se i tak uloží ke kontrole a délka se zapíše jen jako neblokující redakční upozornění; generační běh nesmí kvůli délce selhat. Pro cíl 4 500 znaků je preferovaný rozsah 4 050–4 950 znaků.

Při ručním kliknutí na návrh tématu pomocí AI musí `POST /api/editorial/topics/suggest` přijmout aktuální hodnotu `targetCharacters` z pole redaktora v rozsahu 500–12 000 a uložit ji beze změny do `blog_topic_queue.target_characters`. Tato explicitní hodnota má přednost před automatickým odhadem šíře clusteru. AI smí délku sama navrhnout pouze pro automatizaci nebo jiný redakční běh, který `targetCharacters` neposlal.

Endpoint `GET|POST /api/editorial/articles/:id/locales/:locale/seo-audit` smí číst nebo vytvořit pouze neblokující SEO/GEO redakční kontrolu v `blog_seo_audits`. Kontrola smí uložit samostatné poradní skóre SEO a GEO v rozsahu 0–100, krátký souhrn a strukturované dílčí kontroly; tyto hodnoty nikdy nesmějí být publikační podmínkou. Výsledek nesmí sám publikovat článek, měnit obchodní data ani zabránit ruční publikaci.

Endpoint `POST /api/editorial/articles/:id/locales/:locale/seo-refresh` smí provést pouze cílenou SEO/GEO optimalizaci existující jazykové verze. Z aktuálního redakčního poolu může znovu vybrat relevantní záměry, nahradit vazby výhradně pro daný `post_id` v `blog_post_keywords`, uložit novou konceptovou revizi do `blog_translation_drafts`, zapsat běh typu `rewrite` do `blog_generation_runs` a obnovit odpovídající `blog_seo_audits`. Pokud zůstane výběr i pořadí záměrů stejné, obsah ani jeho revize se nesmějí měnit. Výstup musí projít deterministickou kontrolou zachování podstatné části textu a přiměřené délky; při selhání se obsah ani vazby klíčových slov nesmějí změnit. Endpoint nesmí přidávat nová fakta, měnit zdroje, publikovat, přepisovat ostatní jazykové verze ani zapisovat mimo tabulky `blog_*`. Ostatní jazyky se po úspěšné změně označí stávajícím verzovacím mechanismem jako nesjednocené a aktualizují se až explicitním překladovým krokem.

Endpoint `POST /api/editorial/topics/:id/generate` smí před zařazením tématu do redakční fronty uložit pouze povolený profil `balanced`, `factual` nebo `roadmate` do `blog_topic_queue.style_profile`. Při vytvoření článku se profil smí zkopírovat pouze do `blog_posts.style_profile` a používat jako kontext tvorby, překladů, SEO/GEO aktualizace a kontroly. Endpoint pro ruční přepis textu existujícího tématu není součástí kontraktu.

`POST /api/auth/login` a `POST /api/auth/logout` mění pouze přihlašovací session dashboardu, nikoliv obchodní data v Supabase.

Při prvním úspěšném `POST /api/auth/login` pro e-mail z explicitního dashboard allowlistu smí server vytvořit lokální přihlašovací záznam v odděleném persistentním auth úložišti. Ukládá se pouze normalizovaný e-mail, náhodná sůl, `scrypt` hash hesla a čas vytvoření; heslo v otevřené podobě se nesmí uložit. Další přihlášení musí heslo ověřit časově bezpečným porovnáním. Tato operace nesmí vytvářet Supabase Auth účet ani měnit obchodní či redakční data.

Všechny e-maily v dashboard allowlistu mají totožná dashboard oprávnění. Přednastavené heslo účtu `info@eurogopass.com` smí být v aplikaci uloženo pouze jako osolený `scrypt` hash, nikdy v otevřené podobě.

## Pravidla pro další integrace

- Supabase, PostHog, logy, screenshoty, doklady a Retell AI jsou z pohledu dashboardu pouze zdroje pro čtení; výjimkou jsou výslovně povolené fulfillment, poznámky k položkám, plate-country ACK a redakční operace popsané výše.
- `GET /api/orders/bundle` a `GET /api/orders/summary` jsou pouze čtení: ZIP dokladů/screenshotů a interní technický PDF list jedné objednávky, bez zápisu do databáze.
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
