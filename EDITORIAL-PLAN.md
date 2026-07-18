# Redakce článků – odsouhlasený návrh

Stav dokumentu: průběžný návrh vznikající při společném upřesňování zadání. Tento dokument zatím není pokynem k nasazení databázových změn ani k publikaci.

## Cíl

Do stávajícího interního dashboardu přidat redakci pro tvorbu krátkých praktických SEO článků o cestování, dálničních známkách a mýtném. Aplikace poběží na stávajícím solo VPS a použije stávající Supabase.

Článek má být přibližně na jednu A4, výchozí cíl kolem 2 200 znaků včetně mezer s tolerancí přibližně 1 800–2 600 znaků. Má být praktický, informační, dobře dohledatelný běžnými i AI vyhledávači a na konci organicky představit EuroGoPass jako zjednodušení cesty.

## Stávající data v Supabase

Zachovají se existující tabulky:

- `blog_posts` – společná identita článku, stav, publikace, hero obrázek, země, tagy a informace o zdroji generování;
- `blog_post_translations` – jazykové verze s titulkem, perexem a Markdown obsahem.

Existující články se nebudou přesouvat ani automaticky přepisovat. Nová redakční metadata a koncepty změn budou přidány aditivně. V době kontroly byly v databázi tři články a 24 jazykových verzí každého článku.

Výchozí sada 24 jazyků:

`bg`, `hr`, `cs`, `da`, `nl`, `en`, `et`, `fi`, `fr`, `de`, `el`, `hu`, `ga`, `it`, `lv`, `lt`, `mt`, `pl`, `pt`, `ro`, `sk`, `sl`, `es`, `sv`.

Sada jazyků musí být konfigurovatelná a později rozšiřitelná.

## Hlavní pracovní postup

1. Uživatel zadá pouze téma a volitelně požadovanou délku.
2. AI vytvoří český titulek, osnovu, český článek, SEO metadata, slug, země a tagy.
3. Automatizace smí bez lidské kontroly vytvářet pouze české koncepty.
4. Uživatel český koncept zkontroluje, případně ručně nebo pomocí AI upraví a schválí.
5. Teprve po lidském schválení lze spustit překlady.
6. Po dokončení překladů uživatel celý dostupný balík publikuje jedním potvrzením.
7. Pokud některý překlad selže, neblokuje publikaci úspěšných jazyků. Neúspěšný jazyk zůstane označený k opakování a lze jej doplnit později.

## Tabule témat a automatizace

Redakce bude obsahovat horní vstupní lištu a tabuli témat.

Vstupní lišta umožní:

- zadat jedno téma;
- vložit více témat najednou, například po řádcích;
- nechat AI navrhnout jedno nebo více témat;
- návrh před zařazením potvrdit nebo upravit.

Tabule bude rozlišovat například stavy `čeká`, `naplánováno`, `generuje se`, `čeká na kontrolu`, `připraveno`, `chyba`.

Uživatel bude moci:

- spustit vytvoření konkrétního českého konceptu ručně;
- nastavit automatický počet českých konceptů za den;
- měnit pořadí a prioritu témat;
- pozastavit automatizaci;
- vidět podobné existující články a varování před duplicitou.

Automatizace nesmí sama spouštět překlady ani publikaci.

Automatizace bude mít editovatelný limit nezkontrolovaných českých konceptů. Výchozí návrh je 10. Po dosažení limitu se další automatické generování pozastaví, témata zůstanou bezpečně ve frontě a redakce zobrazí důvod pozastavení. Změna limitu nebo uvolnění fronty umožní automatizaci znovu pokračovat. Nastavení může podporovat také hodnotu bez limitu, pokud ji uživatel vědomě zvolí.

Redakční upozornění se zobrazují pouze ve stávajícím **Centru pozornosti** dashboardu. Neposílají se e-mailem ani jiným externím kanálem. Centrum pozornosti má upozornit zejména na:

- nové české koncepty čekající na kontrolu;
- dosažení limitu a pozastavení automatizace;
- selhání generování českého konceptu;
- neúspěšné jazykové překlady;
- článek připravený k publikaci;
- neověřená nebo rozporná důležitá fakta před publikací.

## Detail článku a jazykový editor

Na hlavní stránce redakce budou zobrazené nejnovější články a jejich stav. Po otevření detailu článku:

- nahoře bude vizuální editor právě zvoleného jazyka;
- výchozí zobrazený jazyk bude čeština;
- pod editorem nebo v jeho bezprostřední blízkosti bude rozbalovací výběr všech jazyků;
- výběrem jazyka se ve stejném editoru vymění celý obsah za zvolenou jazykovou verzi;
- každou jazykovou verzi lze samostatně ručně upravit;
- Markdown zůstane úložným formátem v `body_md`, uživatel ale pracuje ve vizuálním editoru.

Editor bude mít automatické ukládání i tlačítko **Uložit verzi**. Automatické ukládání bude výchozí, ale uživatel je může vypnout v nastavení. Zobrazí stav `ukládám`, `uloženo` nebo chybu.

Automatické ukládání pouze chrání rozepsaný koncept a nemění číslo verze. Až explicitní kliknutí na **Uložit verzi** potvrdí aktuální obsah jako lokální revizi a zvýší její lokální číslo. Starší textové podoby se trvale neuchovávají; běžné undo/redo funguje pouze během aktuální práce v editoru.

## Synchronizace jazykových verzí

Jakákoliv jazyková verze se může stát zdrojem obsahové aktualizace.

Příklad: uživatel otevře polskou verzi, upraví ji a uloží. Systém označí článek upozorněním a nabídne dvě samostatné akce:

1. **Publikovat pouze změnu této jazykové verze** – ostatní jazyky se nezmění.
2. **Aktualizovat ostatní jazyky podle této verze** – upravená polská verze se stane zdrojem nové společné revize a systém z ní připraví aktualizace všech ostatních jazyků, včetně češtiny.

Synchronizace ostatních jazyků se nikdy nespustí pouhým uložením. Vyžaduje explicitní volbu uživatele. Nově vytvořené překlady se nejprve uloží jako koncepty a publikace změn zůstane samostatnou akcí. Starší plné texty se jako historie neuchovávají.

Verzování je dvouúrovňové:

- **společná verze** označuje poslední obsahovou revizi, ze které vznikl celý jazykový balík, například `V4`;
- **lokální revize** označuje samostatnou úpravu jednoho jazyka bez synchronizace ostatních, například `V4 · CS1` nebo `V4 · EN2`.

Po prvním překladu české `V4` nesou všechny jazyky označení `V4`. Pokud se samostatně upraví čeština, bude `V4 · CS1`, zatímco ostatní zůstanou `V4`. Pokud se samostatně upraví také angličtina, bude `V4 · EN1`. Číslo za kódem jazyka se zvýší jen po ručním kliknutí na **Uložit verzi**, nikoliv při automatickém ukládání.

Pokud uživatel zvolí **Aktualizovat ostatní jazyky podle této verze**, vznikne další společná verze, například `V5`, a všechny úspěšně synchronizované jazyky dostanou `V5` bez lokální přípony. Zdrojem nové společné verze může být kterýkoliv jazyk.

Publikace smí obsahovat i rozdílné lokální revize. Před publikací systém ukáže varování a přehled, například čeština `V4 · CS1`, angličtina `V4 · EN1`, ostatní `V4`. Uživatel může přesto potvrdit publikaci bez sjednocení.

Každá jazyková verze bude mít minimálně tato stavová metadata:

- stav konceptu/publikace a případná chyba;
- datum poslední úpravy;
- datum posledního překladu;
- datum poslední publikace;
- autor nebo původ změny (`manual`, `ai_edit`, `translation`);
- zdrojový jazyk;
- číslo společné verze a lokální revize;
- identifikátor zdrojové revize nebo hash zdrojového obsahu;
- zda je verze aktuální, zastaralá nebo ručně upravená.

## Publikované články a koncepty změn

Úprava publikovaného článku se nesmí projevit na webu okamžitě. Veřejná verze zůstane beze změny a redakce uloží samostatný koncept. Změny se zveřejní až tlačítkem **Publikovat změny**.

Přesný technický publikační mechanismus je nutné ověřit. Zatím není potvrzeno, zda web reaguje přímo na `blog_posts.status = 'published'`, nebo vyžaduje webhook, rebuild či jinou akci.

Redakce nebude mít koš ani soft delete. Odstranění tématu, konceptu nebo článku bude **tvrdé a nevratné smazání** ze Supabase. Před provedením musí potvrzovací dialog přesně vyjmenovat rozsah smazání. U celého článku se spolu s hlavním záznamem odstraní také jazykové verze, pracovní koncepty, rešerše, vazby zdrojů a související nahraný hero obrázek, pokud není sdílený. Publikovaný článek vyžaduje výraznější potvrzení než nepublikovaný koncept.

## Lokalizované SEO

Vstup uživatele je téma, nikoliv závazný titulek. AI vytvoří český titulek a při překladu lokalizované titulky.

Každá jazyková verze má mít vlastní:

- slug;
- SEO title;
- SEO description;
- titulek;
- perex;
- obsah;
- alternativní text hero obrázku.

Původní `blog_posts.slug` se zatím zachová jako stabilní interní identifikátor a kompatibilní fallback. Podporu lokalizovaných URL je nutné ověřit také na veřejném webu.

## Rešerše, fakta a interní zdroje

Rešerše smí používat všechny weby. Důležitá faktická tvrzení však musí mít přiřazené ověření:

- oficiální zdroj je preferovaný pro ceny, platnost a právní pravidla;
- neoficiální fakt se má potvrdit dalším nezávislým zdrojem;
- ukládá se URL, titul, datum načtení, typ/důvěryhodnost zdroje a krátká podpůrná pasáž;
- rozpory a neověřená tvrzení se zobrazí jako varování;
- zdroje budou pouze interní a nikdy se automaticky nezobrazí ve veřejném článku.

Detail článku bude mít záložku **Zdroje a fakta**, která propojí konkrétní tvrzení nebo pasáž textu s jedním či více zdroji.

## Znalostní báze a styl

Znalostní báze zatím neexistuje. Později vznikne společně jako verzovaný Markdown dokument, například `eurogopass-knowledge.md`. Systém musí umět začít i bez něj a dokument později připojit.

Faktický kontext a stylistické instrukce se mají spravovat odděleně. Základní tón článků:

- praktický a informační;
- přirozené SEO bez násilného opakování klíčových slov;
- přímá odpověď v úvodu;
- krátké nadpisy, přehledy a případně stručné FAQ;
- většina článku bez prodejních formulací;
- poslední odstavec organicky vysvětlí, jak EuroGoPass řeší problém popsaný v článku;
- neutrální formulace s přímým oslovením, například „S EuroGoPass si můžete…“;
- žádná neověřená superlativní nebo garanční tvrzení.

## AI úpravy a náklady

Editor umožní zadat pokyn k úpravě celého článku nebo označeného úseku. AI změna upraví aktuální koncept; trvalou lokální revizí se stane až po kliknutí na **Uložit verzi**. Předchozí plný text se dlouhodobě nearchivuje.

Náklady se omezí takto:

- rešerše se provede jednou pro zdrojový článek, ne znovu pro každý překlad;
- překlady se spustí až po lidském schválení;
- pro překlady a jednoduché úpravy lze použít levnější model;
- do modelu se posílá pouze potřebný kontext;
- redakce má evidovat model, tokeny a odhad/skutečnou cenu jednotlivých běhů;
- později lze přidat cenový limit na článek nebo den.

## Hero obrázek

AI obrázky se nebudou generovat. Uživatel může pouze nahrát obrázek z počítače. Soubor se uloží do Supabase Storage a URL do stávajícího `blog_posts.hero_image_url`. Externí URL se v redakci zadávat nebude.

## Předběžná databázová rozšíření

Přesný migrační návrh vznikne až po ověření veřejného webu. Očekávané doplňky:

- `blog_topic_queue`;
- `blog_generation_runs`;
- `blog_automation_settings`;
- úložiště aktuálních nepublikovaných konceptů jazykových změn bez historického archivu;
- `blog_research_sources`;
- `blog_article_claims`;
- `blog_claim_sources`;
- stavová a lokalizační pole v `blog_post_translations`.

Všechny změny musí být aditivní a bezpečné pro tři existující články a jejich překlady.

## Kontrolní bod před implementací UI

Před zahájením finální implementace uživatelského rozhraní se s uživatelem rychle projde návrh hlavní stránky redakce, tabule témat a detailu článku. UI se nemá bez této kontroly považovat za definitivní.
