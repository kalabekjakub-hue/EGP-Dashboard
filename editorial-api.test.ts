import assert from "node:assert/strict";
import test from "node:test";
import { articleLengthRange, articleLengthRepairSafety, articleLengthStatus, deterministicInternalLinkWarnings, deterministicSeoGeoWarnings, fallbackSeoGeoReport, internalLinkContext, internalLinksContract, keywordClustersContract, keywordOpportunityScore, keywordRows, keywordSelectionChanged, markdownLinks, normalizeKeyword, parseDelimitedRows, requestedArticleLength, seoContentHash, seoGeoContract, seoRefreshSafety, writingStylesContract } from "./editorial-api";

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
  assert.match(writingStylesContract, /balanced/);
  assert.match(writingStylesContract, /factual/);
  assert.match(writingStylesContract, /roadmate/);
  assert.match(writingStylesContract, /Faktická přesnost je ve všech profilech stejná/i);
  assert.match(keywordClustersContract, /Nejdříve cluster, potom téma/i);
  assert.match(keywordClustersContract, /jeden den, deset dní, měsíc, dva měsíce nebo rok/i);
  assert.match(keywordClustersContract, /nemá pevné minimum ani maximum/i);
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

test("article target of 4500 characters allows only a ten percent deviation", () => {
  assert.deepEqual(articleLengthRange(4500), { target: 4500, minimum: 4050, maximum: 4950 });
  assert.equal(articleLengthStatus("x".repeat(4050), 4500).valid, true);
  assert.equal(articleLengthStatus("x".repeat(4950), 4500).valid, true);
  assert.equal(articleLengthStatus("x".repeat(4049), 4500).valid, false);
  assert.equal(articleLengthStatus("x".repeat(4951), 4500).valid, false);
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

test("builds a locale-specific allowlist for planner and country pages", () => {
  const context = internalLinkContext("de", ["CZ", "AT"]);
  assert.match(context, /https:\/\/eurogopass\.com\/de#home-hero/);
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
