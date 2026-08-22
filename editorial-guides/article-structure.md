# Struktura článku EuroGoPass

## Hlavní princip

Strukturu přizpůsob záměru čtenáře. Článek nemá mechanicky vyplnit šablonu; má co nejrychleji dovést čtenáře od otázky ke správnému rozhodnutí. Povinné jsou přímá odpověď, praktické kroky, relevantní výjimky a ověřitelné zdroje.

## Doporučené pořadí

### 1. Titulek

Titulek musí přesně pojmenovat trasu, zemi, poplatek nebo problém. Slibuje pouze to, co článek skutečně zodpoví. Preferuj přirozenou otázku nebo jasné praktické sdělení; nepoužívej clickbait.

### 2. Krátký úvod s odpovědí

V prvním odstavci odpověz na hlavní otázku. Uveď nejdůležitější podmínku, pokud odpověď závisí na konkrétní trase, kategorii vozidla, hmotnosti, datu nebo místě registrace.

### 3. Co je potřeba pro danou trasu

U článků o trase postupuj po jednotlivých zemích nebo úsecích ve směru jízdy. U každého jasně uveď:

- zda je potřeba známka, mýto, zvláštní poplatek, nebo nic;
- pro kterou kategorii vozidla informace platí;
- kdy a kde se platí;
- jakou důležitou výjimku musí čtenář znát.

Pokud článek řeší jednu zemi nebo jeden problém, místo přehledu trasy použij logické členění podle rozhodnutí čtenáře.

### 4. Praktický postup

Popiš kroky v pořadí, v jakém je řidič provede. Uveď potřebné údaje, například registrační značku, zemi registrace, kategorii vozidla a začátek platnosti, jen pokud jsou pro daný proces relevantní.

U každého poplatku, který článek řeší, nejdřív vysvětli pravidlo. Hned potom popiš, jak to čtenář vyřídí v EuroGoPass: coverage stránku země, pokud je v seznamu, a nákup nebo naplánování trasy v plánovači. Tato nákupní pasáž je povinná, není to volitelná reklama.

### 5. Výjimky a časté chyby

Zařaď pouze výjimky, které mohou změnit nákup nebo platnost. Typicky jde o:

- hranici 3,5 t u známky (jedna věta, bez návodu pro kamiony);
- zvláštní pravidla pro motocykl, přívěs, obytné vozidlo či půjčený osobní vůz;
- samostatně placený most, tunel nebo úsek;
- chybu v registrační značce či zemi registrace;
- odlišný okamžik začátku platnosti.

Nevytvářej dlouhý seznam málo pravděpodobných situací bez vztahu k tématu.

### 6. Stručný závěr a další krok

Shrň pouze rozhodující informaci a dej konkrétní další krok přes EuroGoPass: ověřit trasu, zkontrolovat potřebné produkty nebo dokončit nákup. Nepřidávej nový fakt, který nebyl vysvětlen v hlavním textu. Krátké H2 otázky (FAQ) jsou v pořádku, pokud skutečně pokrývají hledaný záměr a každá začíná přímou odpovědí.

## Formát Markdown

- V těle článku nepoužívej nadpis úrovně H1; titul je samostatné pole editoru.
- Hlavní sekce označuj `##`, podsekce `###`.
- Nepřeskakuj úrovně nadpisů.
- Tabulku použij pro srovnání stejných údajů ve více zemích nebo kategoriích. Na mobilu musí zůstat srozumitelná.
- Tučné písmo používej pro klíčový údaj nebo rozhodnutí, ne pro celé věty.
- Odkaz pojmenuj podle cíle, nikoli „zde“ nebo „klikněte sem“.
- Do textu nevkládej HTML, pokud to úloha výslovně nevyžaduje.

## Délka

Respektuj cílový počet znaků z tématu. Za cílovou délku považuj hlavní text článku včetně mezer, nikoli metadata a seznam zdrojů. Povolená odchylka je nejvýše deset procent; piš spíš ke středu až spodku rozsahu a maximum nepřekračuj. Delší text není lepší.

Delší článek nevytvářej přidáváním obecných úvodů, historie bez vztahu k dotazu, výčtu silnic ani opakováním. Pokud je téma vyčerpáno dříve, dej přednost kvalitě a stručnosti. Encyklopedie země bez praktického kroku v EuroGoPass je chyba, ne pečlivost.

## Titulek, perex a metadata

- Titulek drž konkrétní a čitelný; hlavní hledaný výraz použij přirozeně.
- Perex má ve dvou až třech větách vysvětlit přínos článku, ne pouze zopakovat titulek.
- SEO title a meta description musí odpovídat obsahu a nesmí přidávat neověřený slib.
- Slug má být krátký, popisný, bez letopočtu, pokud článek není skutečně určen jen pro daný rok.
- Klíčová slova neopakuj na úkor přirozeného jazyka.

## Zdroje v článku

Oficiální státní weby používej jen při rešerši. Jejich URL zapiš do `claims.source_urls`, **ne do těla článku**.

V `body_md` nesmí být Markdown odkaz, holá adresa, závorka typu `(edalnice.gov.cz)` ani holý název portálu. Nepiš, že jsi údaj vzal z oficiálního webu. Čtenářské odkazy vedou výhradně na eurogopass.com. Další krok je vždy EuroGoPass, nikoli státní e-shop.
