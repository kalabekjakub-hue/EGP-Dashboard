# Závazná bezpečnostní hranice

Veškerý přístup tohoto dashboardu a práce agentů k produkčním datům je **READ-ONLY**.

Povolené jsou pouze tři výjimky:

1. Ruční označení existující položky objednávky jako `FULFILLED` včetně souvisejícího auditního záznamu.
2. Zápisy nutné pro funkce Redakce/blogu do výhradně redakčních tabulek a úložišť.
3. Vytvoření lokálního dashboard přihlašovacího záznamu při prvním přihlášení výhradně pro e-maily na explicitním allowlistu. Záznam smí obsahovat pouze e-mail, kryptografickou sůl, `scrypt` hash hesla a čas vytvoření v odděleném lokálním auth úložišti; nesmí vzniknout Supabase Auth účet ani zápis do obchodních nebo redakčních dat.

Schválené redakční operace zahrnují také ruční smazání tématu přes `DELETE /api/editorial/topics/:id`; endpoint smí mazat pouze odpovídající řádek v `blog_topic_queue` a nesmí kaskádově měnit ani mazat obchodní data.

Ruční odstranění hlavního obrázku přes `DELETE /api/editorial/articles/:id/hero` smí smazat pouze objekt daného článku z redakčního bucketu `blog-hero-images` a nastavit `blog_posts.hero_image_url` na `null`.

Publikace článku smí do `blog_posts.published_by` uložit e-mail aktuálně přihlášeného uživatele jako redakční auditní údaj.

Správa AI podkladů smí vytvářet, upravovat, zapínat, vypínat a mazat pouze Markdown dokumenty v redakční tabulce `blog_editorial_guides`. Aktivní dokumenty smějí být použity výhradně jako kontext při generování redakčního obsahu.

Mimo tyto tři výjimky se nesmí v Supabase ani jiném produkčním zdroji nic vytvářet, měnit ani mazat. To zahrnuje zejména objednávky, jejich položky, platby, zákaznická data, dokumenty a fulfillment data. Filtrování, párování, deduplikace a skrývání objednávek musí probíhat pouze při čtení nebo v UI, nikdy zápisem do produkční databáze.

Jakákoli nová zapisovací operace vyžaduje předem výslovné potvrzení uživatele a aktualizaci tohoto souboru i `INTEGRATION-CONTRACT.md`.
