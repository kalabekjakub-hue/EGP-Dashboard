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

U každého poplatku, který článek řeší, hned řekni, co s ním čtenář udělá v EuroGoPass, pokud je produkt ověřený: zadat trasu, vidět známku i zvláštní úsek, koupit dostupné položky najednou. Nevytvářej z toho samostatnou reklamu; napoj to na právě vysvětlené pravidlo.

### 5. Výjimky a časté chyby

Zařaď pouze výjimky, které mohou změnit nákup nebo platnost. Typicky jde o:

- jinou kategorii podle hmotnosti nebo počtu náprav;
- zvláštní pravidla pro motocykl, přívěs, obytné vozidlo či půjčený vůz;
- samostatně placený most, tunel nebo úsek;
- chybu v registrační značce či zemi registrace;
- odlišný okamžik začátku platnosti.

Nevytvářej dlouhý seznam málo pravděpodobných situací bez vztahu k tématu.

### 6. Stručný závěr a další krok

Shrň pouze rozhodující informaci a dej konkrétní další krok přes EuroGoPass: ověřit trasu, zkontrolovat potřebné produkty nebo dokončit nákup. Nepřidávej nový fakt, který nebyl vysvětlen v hlavním textu.

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

V `body_md` nesmí být Markdown odkaz, holá adresa ani závorka typu `(edalnice.gov.cz)`, `(eznamka.sk)` nebo `(nemzetiutdij.hu)`. Čtenářské odkazy vedou výhradně na eurogopass.com. Nevkládej výzvy typu „kupte na oficiálním webu“ ani alternativní místa nákupu.
