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

SEO/GEO pool smí importovat ručně vložené výrazy a CSV exporty Google Search Console pouze do redakčních tabulek `blog_seo_keywords`, `blog_topic_keywords`, `blog_post_keywords` a `blog_seo_audits`. Smí aktualizovat pouze redakční metriky, vazby témat a článků na klíčová slova a neblokující výsledky redakční kontroly. Nesmí zapisovat do Google Search Console, obchodních tabulek ani jiných produkčních zdrojů.

SEO/GEO kontrola smí v `blog_seo_audits` ukládat samostatné poradní skóre SEO a GEO 0–100, krátký souhrn a strukturované dílčí kontroly. Skóre je pouze informační, nesmí automaticky publikovat ani blokovat ruční publikaci.

Volba stylu článku smí před generováním uložit pouze jednu z povolených hodnot `balanced`, `factual` nebo `roadmate` do `blog_topic_queue.style_profile` a následně ji zkopírovat do `blog_posts.style_profile`. Hodnota smí sloužit výhradně jako redakční kontext pro tvorbu, překlady a pozdější optimalizaci článku.

Ruční SEO/GEO aktualizace přes `POST /api/editorial/articles/:id/locales/:locale/seo-refresh` smí pro zadaný článek znovu vybrat výrazy z redakčního poolu, nahradit pouze jeho vazby v `blog_post_keywords`, vytvořit novou konceptovou revizi dané jazykové verze v `blog_translation_drafts`, uložit generační audit do `blog_generation_runs` a obnovit kontrolu v `blog_seo_audits`. Musí zachovat fakta a podstatnou část původního textu, nesmí sama publikovat ani měnit obchodní data. Překlady se po této změně smějí aktualizovat pouze stávajícím redakčním překladovým tokem.

Mimo tyto tři výjimky se nesmí v Supabase ani jiném produkčním zdroji nic vytvářet, měnit ani mazat. To zahrnuje zejména objednávky, jejich položky, platby, zákaznická data, dokumenty a fulfillment data. Filtrování, párování, deduplikace a skrývání objednávek musí probíhat pouze při čtení nebo v UI, nikdy zápisem do produkční databáze.

Jakákoli nová zapisovací operace vyžaduje předem výslovné potvrzení uživatele a aktualizaci tohoto souboru i `INTEGRATION-CONTRACT.md`.
