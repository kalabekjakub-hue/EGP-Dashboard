import assert from "node:assert/strict";
import test from "node:test";
import { articleLengthPrompt, articleLengthRange, articleLengthRepairSafety, articleLengthStatus, catalogEditorialGuideFilename, customerFacingOfficialMentions, deterministicInternalLinkWarnings, deterministicSeoGeoWarnings, editorialContentChanged, editorialProductFocus, fallbackSeoGeoReport, internalLinkContext, internalLinksContract, isDuplicateEditorialTopic, keywordClustersContract, keywordOpportunityScore, keywordPoolView, keywordRows, keywordSelectionChanged, keywordSetOverlap, keywordUsagePenalty, languagesNeedSync, localesNeedingSync, markdownLinks, nextLocalRevision, normalizeKeyword, orderEditorialGuides, parseDelimitedRows, primaryEditorialGuideFilename, promoteUnusedPrimary, requestedArticleLength, sanitizeCustomerFacingLinks, seoContentHash, seoGeoContract, seoRefreshSafety, topicIsOutOfCatalog, topicMatchesProductFocus, topicTitleSimilarity, trimArticleToLengthRange, writingStylesContract } from "./editorial-api";

test("normalizes keyword whitespace and case without losing language characters", () => {
  assert.equal(normalizeKeyword("  Dálniční   Známka ČR  "), "dálniční známka čr");
});

test("parses quoted Google Search Console CSV metrics", () => {
  const rows = keywordRows('Top queries,Clicks,Impressions,CTR,Position\n"norway pass",12,340,3.5%,8.2\n', "csv", "Queries.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].query, "norway pass");
  assert.equal(rows[0].clicks, 12);
  assert.equal(rows[0].impressions, 340);
  assert.equal(rows[0].ctr, 0.035);
  assert.equal(rows[0].position, 8.2);
});

test("parses Czech semicolon CSV with decimal commas", () => {
  const rows = keywordRows("Nejčastější dotazy;Kliknutí;Zobrazení;CTR;Pozice\nnorway highway;5;120;4,2%;11,7\n", "csv", "Dotazy.csv");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].clicks, 5);
  assert.equal(rows[0].ctr, 0.042);
  assert.equal(rows[0].position, 11.7);
});

test("keeps fractional CTR exports as a fraction", () => {
  const rows = keywordRows("Query,CTR\nnorway pass,0.035\n", "csv", "Queries.csv");
  assert.equal(rows[0].ctr, 0.035);
});

test("keeps delimiters inside quoted query values", () => {
  assert.deepEqual(parseDelimitedRows('Query,Clicks\n"bridge, denmark",4'), [["Query", "Clicks"], ["bridge, denmark", "4"]]);
});

test("parses manual input one keyword per non-empty line", () => {
  const rows = keywordRows("norway pass\n\n sweden bridge \n", "manual", "");
  assert.deepEqual(rows.map(row => row.query), ["norway pass", "sweden bridge"]);
});

test("loads the shared SEO/GEO contract for every AI stage", () => {
  assert.match(seoGeoContract, /Titulek/);
  assert.match(seoGeoContract, /Perex/);
  assert.match(seoGeoContract, /SEO title/);
  assert.match(seoGeoContract, /Meta description/);
  assert.match(seoGeoContract, /GEO/);
  assert.match(seoGeoContract, /klíčov/i);
  assert.match(internalLinksContract, /Markdown/);
  assert.match(internalLinksContract, /plánovač/i);
  assert.match(internalLinksContract, /lokaliz/i);
  assert.match(internalLinksContract, /claims\.source_urls/);
  assert.match(internalLinksContract, /eurogopass\.com/);
  assert.match(internalLinksContract, /oficiálního webu/);
  assert.match(seoGeoContract, /nákupní nebo plánovací krok/);
  assert.match(writingStylesContract, /balanced/);
  assert.match(writingStylesContract, /factual/);
  assert.match(writingStylesContract, /roadmate/);
  assert.match(writingStylesContract, /Faktická přesnost je ve všech profilech stejná/i);
  assert.match(writingStylesContract, /Markdown podklad/i);
  assert.equal(primaryEditorialGuideFilename, "editor-prompt.md");
  assert.equal(catalogEditorialGuideFilename, "eurogopass.md");
  assert.match(keywordClustersContract, /Nejdříve cluster, potom téma/i);
  assert.match(keywordClustersContract, /jeden den, deset dní, měsíc, dva měsíce nebo rok/i);
  assert.match(keywordClustersContract, /Priorita a rozmanitost/i);
  assert.match(keywordClustersContract, /produkt z katalogu EuroGoPass/i);
  assert.match(keywordClustersContract, /nákladních autech/i);
});

test("editorial guides put editor-prompt.md first and eurogopass.md second", () => {
  const ordered = orderEditorialGuides([
    { filename: "writing-style.md" },
    { filename: "Editor-Prompt.md" },
    { filename: "brand-context.md" },
    { filename: "eurogopass.md" },
  ]);
  assert.deepEqual(ordered.map(row => row.filename), ["Editor-Prompt.md", "eurogopass.md", "brand-context.md", "writing-style.md"]);
});

test("keyword opportunity score is stable and does not use random ordering", () => {
  const keyword = {
    id: "keyword",
    query: "rakouská dálniční známka",
    normalized_query: "rakouská dálniční známka",
    source: "search_console" as const,
    impressions: 22,
    clicks: 0,
    ctr: 0,
    position: 62,
    suggested_count: 0,
    generated_count: 0,
    published_count: 0,
    last_imported_at: "2026-07-20T10:45:30.000Z",
  };
  const now = new Date("2026-07-20T12:00:00.000Z").getTime();
  assert.equal(keywordOpportunityScore(keyword, now), keywordOpportunityScore(keyword, now));
});

test("keyword opportunity values aggregate demand above one isolated good position", () => {
  const now = new Date("2026-07-20T12:00:00.000Z").getTime();
  const shared = { id: "", normalized_query: "", source: "search_console" as const, clicks: 0, ctr: 0, suggested_count: 0, generated_count: 0, published_count: 0, last_imported_at: "2026-07-20T10:45:30.000Z" };
  const broad = keywordOpportunityScore({ ...shared, id: "broad", query: "vignette österreich", normalized_query: "vignette österreich", impressions: 22, position: 62 }, now);
  const narrow = keywordOpportunityScore({ ...shared, id: "narrow", query: "rakúska diaľničná známka 10 dní", normalized_query: "rakúska diaľničná známka 10 dní", impressions: 1, position: 18 }, now);
  assert.ok(broad > narrow);
});

test("using a keyword drops its priority far below an unused twin", () => {
  const now = new Date("2026-07-20T12:00:00.000Z").getTime();
  const unused = { id: "a", query: "rakouská dálniční známka", normalized_query: "rakouská dálniční známka", source: "search_console" as const, impressions: 40, position: 28, clicks: 0, ctr: 0, suggested_count: 0, generated_count: 0, published_count: 0, last_imported_at: "2026-07-20T10:45:30.000Z" };
  const used = { ...unused, id: "b", suggested_count: 1 };
  assert.equal(keywordUsagePenalty(unused), 1);
  assert.equal(keywordUsagePenalty(used), 12);
  assert.ok(keywordOpportunityScore(unused, now) / keywordOpportunityScore(used, now) >= 10);
  const ranked = keywordPoolView([used, unused], now);
  assert.equal(ranked[0].id, "a");
  assert.equal(ranked[0].priority_rank, 1);
});

test("duplicate topic check blocks the same primary keyword and near-identical titles", () => {
  const existing = [{ topic: "Rakouská dálniční známka: ceny a platnost", keywordIds: ["at", "at-10", "at-year"], primaryKeywordId: "at" }];
  assert.equal(isDuplicateEditorialTopic({ topic: "Rakouská dálniční známka na dovolenou", keywordIds: ["at-weekend"], primaryKeywordId: "at" }, existing), true);
  assert.equal(isDuplicateEditorialTopic({ topic: "Rakouská dálniční známka: ceny a platnost", keywordIds: ["other"], primaryKeywordId: "other" }, existing), true);
  assert.equal(keywordSetOverlap(["at", "at-10", "at-year", "at-month"], ["at", "at-10", "at-year"]), 0.75);
  assert.ok(topicTitleSimilarity("Slovenská dálniční známka na 10 dní", "Maďarská dálniční známka na Balaton") < 0.68);
  assert.equal(isDuplicateEditorialTopic({ topic: "Slovenská dálniční známka na 10 dní", keywordIds: ["sk", "sk-10"], primaryKeywordId: "sk" }, existing), false);
});

test("unused keyword in a mixed selection becomes the primary intent", () => {
  const candidates = [
    { id: "used", query: "rakouská známka", normalized_query: "rakouská známka", source: "manual" as const, suggested_count: 1 },
    { id: "fresh", query: "slovenská známka", normalized_query: "slovenská známka", source: "manual" as const, suggested_count: 0 },
  ];
  assert.deepEqual(promoteUnusedPrimary(["used", "fresh"], candidates), ["fresh", "used"]);
});

test("product focus keeps destination queries as context and sellable countries as primary", () => {
  assert.equal(editorialProductFocus("rakouská dálniční známka"), "sellable");
  assert.equal(editorialProductFocus("france free-flow"), "sellable");
  assert.equal(editorialProductFocus("cesta do Itálie rakouská známka"), "sellable");
  assert.equal(editorialProductFocus("digitální známka"), "sellable");
  assert.equal(editorialProductFocus("rakouská známka do 3,5 t"), "sellable");
  assert.equal(editorialProductFocus("most v Řecku"), "context");
  assert.equal(editorialProductFocus("italská města"), "context");
  assert.equal(editorialProductFocus("Bosna a Hercegovina dálnice"), "context");
  assert.equal(topicMatchesProductFocus("Rakouská známka na cestě do Itálie", "cesta do itálie"), true);
  assert.equal(topicMatchesProductFocus("Mosty v Řecku, které stojí za vidění", "most v řecku"), false);
});

test("catalog scope rejects trucks and other systems EuroGoPass does not sell", () => {
  assert.equal(editorialProductFocus("rakouské mýto pro nákladní auta"), "out_of_scope");
  assert.equal(editorialProductFocus("GO-Box Rakousko"), "out_of_scope");
  assert.equal(editorialProductFocus("HU-GO maďarské mýto"), "out_of_scope");
  assert.equal(editorialProductFocus("LKW Maut Austria"), "out_of_scope");
  assert.equal(editorialProductFocus("Umweltplakette Německo"), "out_of_scope");
  assert.equal(editorialProductFocus("ekologická plaketa"), "out_of_scope");
  assert.equal(topicIsOutOfCatalog("Mýto pro kamiony v Rakousku", "nakladni myto rakousko"), true);
  assert.equal(topicMatchesProductFocus("Mýto pro kamiony v Rakousku", "rakouské mýto nákladní"), false);
  assert.equal(topicIsOutOfCatalog("Rakouská dálniční známka", "rakouská známka"), false);
});

test("product-focus ranking prefers a sellable query over a high-volume destination", () => {
  const now = new Date("2026-07-20T12:00:00.000Z").getTime();
  const shared = { normalized_query: "", source: "search_console" as const, clicks: 0, ctr: 0, suggested_count: 0, generated_count: 0, published_count: 0, last_imported_at: "2026-07-20T10:45:30.000Z", position: 20 };
  const italy = { ...shared, id: "it", query: "cesta do itálie", normalized_query: "cesta do itálie", impressions: 800 };
  const austria = { ...shared, id: "at", query: "rakouská dálniční známka", normalized_query: "rakouská dálniční známka", impressions: 40 };
  const truck = { ...shared, id: "hgv", query: "rakouské mýto nákladní auta", normalized_query: "rakouské mýto nákladní auta", impressions: 900 };
  const ranked = keywordPoolView([italy, truck, austria], now);
  assert.equal(ranked[0].id, "at");
  assert.equal(ranked[1].id, "it");
  assert.equal(ranked[2].id, "hgv");
  assert.deepEqual(promoteUnusedPrimary(["it", "at"], [italy, austria], true), ["at", "it"]);
  assert.deepEqual(promoteUnusedPrimary(["hgv", "at"], [truck, austria], true), ["at", "hgv"]);
});

test("article target of 4500 characters allows only a ten percent deviation", () => {
  assert.deepEqual(articleLengthRange(4500), { target: 4500, minimum: 4050, maximum: 4950 });
  assert.equal(articleLengthStatus("x".repeat(4050), 4500).valid, true);
  assert.equal(articleLengthStatus("x".repeat(4950), 4500).valid, true);
  assert.equal(articleLengthStatus("x".repeat(4049), 4500).valid, false);
  assert.equal(articleLengthStatus("x".repeat(4951), 4500).valid, false);
});

test("article length prompt states the exact target and ten percent band", () => {
  const prompt = articleLengthPrompt(4500);
  assert.match(prompt, /4.?500/);
  assert.match(prompt, /10 %/);
  assert.match(prompt, /4.?050/);
  assert.match(prompt, /4.?950/);
  assert.match(prompt, /nad maximem/i);
});

test("length trim drops filler without touching numbers or links", () => {
  const intro = "Na švýcarských dálnicích potřebujete elektronickou známku před vjezdem. ".repeat(8);
  const filler = "Obecný popis krajiny a volnočasových tipů bez praktického údaje. ".repeat(18);
  const practical = "Roční známka stojí 40 CHF. [Naplánujte trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero). ".repeat(6);
  const closing = "Další krok je ověřit trasu a koupit dostupnou známku v EuroGoPass. ".repeat(8);
  const body = [intro, filler, practical, closing].join("\n\n");
  const target = 1600;
  assert.equal(articleLengthStatus(body, target).valid, false);
  const trimmed = trimArticleToLengthRange(body, target);
  assert.equal(articleLengthStatus(trimmed, target).valid, true);
  assert.match(trimmed, /40 CHF/);
  assert.match(trimmed, /eurogopass\.com\/cs#home-hero/);
  assert.doesNotMatch(trimmed, /volnočasových tipů/);
});

test("editorial target explicitly overrides AI topic length planning", () => {
  assert.equal(requestedArticleLength(2000), 2000);
  assert.equal(requestedArticleLength("4500"), 4500);
  assert.equal(requestedArticleLength(undefined), null);
  assert.throws(() => requestedArticleLength(499), /500/);
  assert.throws(() => requestedArticleLength(12001), /12 000/);
});

test("article length repair must preserve every number and Markdown destination", () => {
  const original = "Známka stojí 12,80 EUR a platí 10 dní. [Rakousko](https://eurogopass.com/cs/coverage/at)";
  assert.equal(articleLengthRepairSafety(original, `${original} Praktický krok bez nového faktu.`).safe, true);
  assert.equal(articleLengthRepairSafety(original, original.replace("10 dní", "deset dní")).safe, false);
  assert.equal(articleLengthRepairSafety(original, `${original} Cena pro motorku je 5,10 EUR.`).safe, false);
  assert.equal(articleLengthRepairSafety(original, original.replace("/coverage/at", "/coverage/de")).safe, false);
});

test("SEO audit hash becomes stale when metadata changes", () => {
  const base = { title: "Rakouská dálniční známka", excerpt: "Přímá odpověď", seo_title: "Rakouská dálniční známka pro cestu autem", seo_description: "Popis", slug: "rakouska-dalnicni-znamka", body_md: "Obsah" };
  assert.notEqual(seoContentHash(base), seoContentHash({ ...base, excerpt: "Změněná přímá odpověď" }));
  assert.notEqual(seoContentHash(base), seoContentHash({ ...base, seo_description: "Změněný SEO popis" }));
});

test("version save bumps local revision only when content actually changed", () => {
  const draft = { title: "Titulek", excerpt: "Perex", body_md: "Text", slug: "titulek", seo_title: "SEO", seo_description: "Popis", hero_image_alt: "Alt" };
  assert.equal(editorialContentChanged(draft, draft), false);
  assert.equal(editorialContentChanged(draft, { ...draft, body_md: "Jiný text" }), true);
  assert.equal(nextLocalRevision(0, { saveMode: "version", contentChanged: false }), 0);
  assert.equal(nextLocalRevision(0, { saveMode: "version", contentChanged: true }), 1);
  assert.equal(nextLocalRevision(2, { saveMode: "autosave", contentChanged: true }), 2);
  assert.equal(nextLocalRevision(2, { saveMode: "version", resetLocalRevision: true, contentChanged: true }), 0);
});

test("language sync warning ignores published-only articles and hero-only changes", () => {
  assert.equal(languagesNeedSync([
    { locale: "cs", common_revision: 2, local_revision: 1, hasDraft: false },
    { locale: "en", common_revision: 2, local_revision: 0, hasDraft: false },
  ]), false);
  assert.equal(languagesNeedSync([
    { locale: "cs", common_revision: 2, local_revision: 0, hasDraft: true },
    { locale: "en", common_revision: 2, local_revision: 0, hasDraft: true },
  ]), false);
  assert.equal(languagesNeedSync([
    { locale: "cs", common_revision: 2, local_revision: 1, hasDraft: true },
    { locale: "en", common_revision: 2, local_revision: 0, hasDraft: true },
  ]), true);
  assert.deepEqual(localesNeedingSync([
    { locale: "cs", common_revision: 2, local_revision: 1, hasDraft: true },
    { locale: "en", common_revision: 2, local_revision: 0, hasDraft: true },
    { locale: "de", common_revision: 1, local_revision: 0, hasDraft: true },
  ]), ["cs", "de"]);
});

test("SEO/GEO fallback report keeps the two quality dimensions independent", () => {
  const report = fallbackSeoGeoReport([
    { severity: "warning", location: "Meta description", message: "Meta description chybí." },
    { severity: "warning", location: "Nadpisy", message: "Sekce nemají konkrétní nadpisy." },
    { severity: "warning", location: "Fakta", message: "Důležité číslo nemá uvedený zdroj." },
  ]);
  assert.ok(report.seo_score < 100);
  assert.ok(report.geo_score < 100);
  assert.notEqual(report.seo_score, report.geo_score);
  assert.equal(report.seo_checks.length, 4);
  assert.equal(report.geo_checks.length, 4);
});

test("SEO/GEO fallback report returns a complete excellent baseline", () => {
  const report = fallbackSeoGeoReport([]);
  assert.equal(report.seo_score, 100);
  assert.equal(report.geo_score, 100);
  assert.match(report.summary, /velmi dobrém stavu/i);
});

test("deterministic SEO/GEO audit catches missing metadata and invalid H1", () => {
  const warnings = deterministicSeoGeoWarnings({ title: "Test", excerpt: "", seo_title: "", seo_description: "", slug: "", body_md: "# Nepovolený H1" });
  assert.ok(warnings.some(warning => warning.location === "Perex"));
  assert.ok(warnings.some(warning => warning.location === "SEO title"));
  assert.ok(warnings.some(warning => warning.location === "Meta description"));
  assert.ok(warnings.some(warning => warning.location === "Slug"));
  assert.ok(warnings.some(warning => warning.location === "Obsah"));
});

test("deterministic SEO/GEO audit verifies declared keyword placement", () => {
  const warnings = deterministicSeoGeoWarnings({
    title: "Dálniční známka Rakousko",
    excerpt: "Rakouská dálniční známka je pro většinu dálnic povinná ještě před vjezdem na placený úsek.",
    seo_title: "Dálniční známka Rakousko pro cestu autem",
    seo_description: "Zjistěte, kdy potřebujete rakouskou dálniční známku, jak funguje její platnost a co zkontrolovat před cestou autem.",
    slug: "dalnicni-znamka-rakousko",
    body_md: "## Kdy potřebujete známku\n\nRakouskou dálniční známku kupte před vjezdem na placenou dálnici.",
    keyword_usage: {
      primary_intent: "rakouská dálniční známka",
      title_phrase: "výraz, který v titulku není",
      excerpt_phrase: "Rakouská dálniční známka",
      seo_title_phrase: "Dálniční známka Rakousko",
      seo_description_phrase: "rakouskou dálniční známku",
      body_phrases: ["Rakouskou dálniční známku"],
    },
  });
  assert.ok(warnings.some(warning => warning.location === "Titulek" && warning.message.includes("ve skutečnosti nenachází")));
});

test("SEO/GEO refresh accepts a small targeted edit", () => {
  const original = `## Rakouská dálniční známka\n\nRakouská dálniční známka je povinná na většině dálnic. Desetidenní varianta platí 10 dní. Před cestou zkontrolujte registrační značku.\n\n## Nákup před cestou\n\nZnámku kupte před vjezdem na zpoplatněný úsek a uschovejte potvrzení.`;
  const revised = original.replace("Rakouská dálniční známka je povinná", "Pro většinu rakouských dálnic je dálniční známka povinná");
  const safety = seoRefreshSafety(original, revised);
  assert.equal(safety.safe, true);
  assert.ok(safety.similarity > 0.42);
});

test("SEO/GEO refresh rejects a wholesale rewrite", () => {
  const original = "Praktický článek o cestě autem po Rakousku, dálniční známce, její kontrole a nákupu před vjezdem na dálnici. ".repeat(12);
  const revised = "Úplně jiný text o plánování dovolené, výběru hotelu, balení zavazadel a návštěvě měst během letních prázdnin. ".repeat(12);
  assert.equal(seoRefreshSafety(original, revised).safe, false);
});

test("SEO/GEO refresh rejects removal of an existing number", () => {
  const original = "Známka platí 10 dní a stojí 12,40 EUR. Před nákupem ověřte údaje vozidla. ".repeat(8);
  const revised = original.replaceAll("12,40 EUR", "aktuální cenu");
  const safety = seoRefreshSafety(original, revised);
  assert.equal(safety.safe, false);
  assert.deepEqual(safety.missingNumbers, ["12.40"]);
});

test("SEO/GEO refresh runs only when the selected intent set or its priority changes", () => {
  assert.equal(keywordSelectionChanged(["primary", "supporting"], ["primary", "supporting"]), false);
  assert.equal(keywordSelectionChanged(["primary", "supporting"], ["supporting", "primary"]), true);
  assert.equal(keywordSelectionChanged(["primary"], ["primary", "new-supporting"]), true);
});

test("builds a locale-specific allowlist for planner, Plus and country pages", () => {
  const context = internalLinkContext("de", ["CZ", "AT"]);
  assert.match(context, /https:\/\/eurogopass\.com\/de#home-hero/);
  assert.match(context, /https:\/\/eurogopass\.com\/de\/plus/);
  assert.match(context, /https:\/\/eurogopass\.com\/de\/coverage\/cz/);
  assert.match(context, /https:\/\/eurogopass\.com\/de\/coverage\/at/);
  assert.doesNotMatch(context, /\/de\/coverage\/sk/);
});

test("extracts clickable Markdown links with descriptive anchors", () => {
  const links = markdownLinks("Naplánujte si [trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero) a projděte [informace o Česku](https://eurogopass.com/cs/coverage/cz).");
  assert.deepEqual(links.map(link => [link.anchor, link.href]), [
    ["trasu přes EuroGoPass", "https://eurogopass.com/cs#home-hero"],
    ["informace o Česku", "https://eurogopass.com/cs/coverage/cz"],
  ]);
});

test("internal-link audit accepts localized planner and country links", () => {
  const body = (`Praktické informace si můžete ověřit na stránce [dálničních poplatků v Česku](https://eurogopass.com/cs/coverage/cz). Pro další cestu můžete [naplánovat trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero). EuroGoPass tak navazuje až na konkrétní další krok. `).repeat(3);
  assert.deepEqual(deterministicInternalLinkWarnings({ body_md: body }, "cs", ["CZ"]), []);
});

test("internal-link audit catches missing and wrong-locale destinations", () => {
  const body = (`EuroGoPass pomůže s plánem cesty. [Naplánujte trasu](https://eurogopass.com/en#home-hero) a projděte [přehled zemí](https://eurogopass.com/en/coverage). `).repeat(5);
  const warnings = deterministicInternalLinkWarnings({ body_md: body }, "cs", ["CZ"]);
  assert.ok(warnings.some(warning => warning.location === "Lokalizace odkazů"));
  assert.ok(warnings.some(warning => warning.location === "Plánovač"));
  assert.ok(warnings.some(warning => warning.location === "Informace o zemi"));
});

test("strips official websites from customer-facing article body", () => {
  const body = [
    "Česko: desetidenní známka. ([edalnice.gov.cz](https://edalnice.gov.cz))",
    "Slovensko stojí 10,80 €. Pravidla v [EuroGoPass](https://eurogopass.com/cs/coverage/sk) (eznamka.sk).",
    "Maďarsko: [Informace k maďarské známce](https://eurogopass.com/cs/coverage/hu) (nemzetiutdij.hu).",
    "Naplánujte [trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero).",
  ].join(" ");
  const cleaned = sanitizeCustomerFacingLinks(body);
  assert.match(cleaned, /https:\/\/eurogopass\.com\/cs#home-hero/);
  assert.match(cleaned, /https:\/\/eurogopass\.com\/cs\/coverage\/sk/);
  assert.match(cleaned, /10,80 €/);
  assert.doesNotMatch(cleaned, /edalnice/i);
  assert.doesNotMatch(cleaned, /eznamka/i);
  assert.doesNotMatch(cleaned, /nemzetiutdij/i);
});

test("internal-link audit rejects leftover official website links", () => {
  const body = (`Praktické informace jsou na [oficiálním portálu](https://edalnice.gov.cz). [Naplánujte trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero) a [Česko v EuroGoPass](https://eurogopass.com/cs/coverage/cz). `).repeat(3);
  const warnings = deterministicInternalLinkWarnings({ body_md: body }, "cs", ["CZ"]);
  assert.ok(warnings.some(warning => warning.location === "Odkazy"));
});

test("internal-link catalog without countries lists only sellable coverage pages", () => {
  const context = internalLinkContext("cs");
  assert.match(context, /https:\/\/eurogopass\.com\/cs\/coverage\/cz/);
  assert.match(context, /https:\/\/eurogopass\.com\/cs\/coverage\/at/);
  assert.doesNotMatch(context, /\/cs\/coverage\/it/);
  assert.doesNotMatch(context, /\/cs\/coverage\/ba/);
});

test("rejects official portal names and source attribution in reader-facing copy", () => {
  const withPortal = (`Česko: desetidenní známka na edalnice. [Naplánujte trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero) a [Česko v EuroGoPass](https://eurogopass.com/cs/coverage/cz). `).repeat(3);
  const withPhrase = (`Známku koupíte na oficiálním webu. [Naplánujte trasu přes EuroGoPass](https://eurogopass.com/cs#home-hero) a [Česko v EuroGoPass](https://eurogopass.com/cs/coverage/cz). `).repeat(3);
  assert.ok(deterministicInternalLinkWarnings({ body_md: withPortal }, "cs", ["CZ"]).some(warning => warning.location === "Oficiální weby"));
  assert.ok(deterministicInternalLinkWarnings({ body_md: withPhrase }, "cs", ["CZ"]).some(warning => warning.location === "Oficiální weby"));
  assert.deepEqual(customerFacingOfficialMentions("Roční známka stojí 2300 Kč. V EuroGoPass ji koupíte v plánovači."), []);
  assert.ok(customerFacingOfficialMentions("Cenu ověřte na oficiálním webu.").length);
});
