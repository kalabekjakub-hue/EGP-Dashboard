import { createHash, randomUUID } from "node:crypto";
import { loadServerEnvironment } from "./server-config";

type Environment = Record<string, string | undefined>;

const editorialLocales = ["bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "sk", "sl", "es", "sv"];
const maxGuideCharacters = 20_000;
const maxGuidanceCharacters = 40_000;
const maxGuideFiles = 20;

function json(res: import("node:http").ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readBody(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (!chunks.length) return {} as Record<string, unknown>;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function config() {
  const environment = loadServerEnvironment() as Environment;
  return {
    supabaseUrl: environment.SUPABASE_URL?.replace(/\/$/, ""),
    supabaseKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    openaiKey: environment.OPENAI_API_KEY,
    articleModel: environment.OPENAI_ARTICLE_MODEL ?? "gpt-5.6-terra",
    translationModel: environment.OPENAI_TRANSLATION_MODEL ?? "gpt-5.6-luna",
  };
}

async function supabase(path: string, init: RequestInit = {}) {
  const { supabaseUrl, supabaseKey } = config();
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase konfigurace není dostupná");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Supabase ${response.status}: ${detail.slice(0, 500)}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
}

function guideFilename(value: unknown) {
  const filename = String(value ?? "").trim();
  if (!filename || filename.length > 120 || !filename.toLowerCase().endsWith(".md") || /[\\/\0]/.test(filename)) throw Object.assign(new Error("Soubor musí mít platný název zakončený .md"), { status: 400 });
  return filename;
}

function guideContent(value: unknown) {
  const content = String(value ?? "").replace(/\r\n/g, "\n").trim();
  if (!content) throw Object.assign(new Error("Markdown podklad nesmí být prázdný"), { status: 400 });
  if (content.length > maxGuideCharacters) throw Object.assign(new Error(`Jeden Markdown podklad může mít nejvýše ${maxGuideCharacters.toLocaleString("cs-CZ")} znaků`), { status: 400 });
  return content;
}

async function editorialGuidance() {
  try {
    const rows = await supabase("blog_editorial_guides?enabled=eq.true&select=filename,content&order=filename.asc") as Array<{ filename: string; content: string }>;
    let remaining = maxGuidanceCharacters;
    const sections: string[] = [];
    for (const row of rows) {
      if (remaining <= 0) break;
      const content = String(row.content ?? "").slice(0, remaining);
      if (!content.trim()) continue;
      sections.push(`## ${row.filename}\n${content}`);
      remaining -= content.length;
    }
    if (!sections.length) return "";
    return `INTERNÍ REDAKČNÍ PODKLADY EUROGOPASS\nŘiď se následujícími podklady pro kontext, styl, strukturu a terminologii. Neměň podle nich aktuální fakta, ceny ani právní pravidla bez ověření z aktuálních zdrojů.\n\n${sections.join("\n\n")}`;
  } catch (error) {
    if (error instanceof Error && /blog_editorial_guides|42P01|PGRST205/.test(error.message)) return "";
    throw error;
  }
}

function hashContent(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || `clanek-${Date.now()}`;
}

function outputText(payload: Record<string, unknown>) {
  const output = Array.isArray(payload.output) ? payload.output as Array<Record<string, unknown>> : [];
  for (const item of output) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const content of item.content as Array<Record<string, unknown>>) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  throw new Error("AI nevrátila textový výstup");
}

function webSources(payload: Record<string, unknown>) {
  const found = new Map<string, { url: string; title: string }>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    const citation = record.url_citation as Record<string, unknown> | undefined;
    const url = typeof record.url === "string" ? record.url : typeof citation?.url === "string" ? citation.url : undefined;
    if (url?.startsWith("http")) found.set(url, { url, title: typeof record.title === "string" ? record.title : typeof citation?.title === "string" ? citation.title : url });
    Object.values(record).forEach(visit);
  };
  visit(payload.output);
  return [...found.values()];
}

async function openaiResponse(input: string, schemaName: string, schema: Record<string, unknown>, model: string, web = false) {
  const { openaiKey } = config();
  if (!openaiKey) throw new Error("OPENAI_API_KEY není nastavený");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input,
      ...(web ? { tools: [{ type: "web_search" }] } : {}),
      text: { format: { type: "json_schema", name: schemaName, strict: true, schema } },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${JSON.stringify(payload).slice(0, 700)}`);
  return { data: JSON.parse(outputText(payload)) as Record<string, unknown>, raw: payload };
}

const articleSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "excerpt", "body_md", "seo_title", "seo_description", "slug", "countries", "tags", "claims"],
  properties: {
    title: { type: "string" }, excerpt: { type: "string" }, body_md: { type: "string" },
    seo_title: { type: "string" }, seo_description: { type: "string" }, slug: { type: "string" },
    countries: { type: "array", items: { type: "string" } }, tags: { type: "array", items: { type: "string" } },
    claims: { type: "array", items: { type: "object", additionalProperties: false, required: ["text", "verified", "source_urls"], properties: { text: { type: "string" }, verified: { type: "boolean" }, source_urls: { type: "array", items: { type: "string" } } } } },
  },
};

const translationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["translations"],
  properties: {
    translations: { type: "array", items: { type: "object", additionalProperties: false, required: ["locale", "title", "excerpt", "body_md", "seo_title", "seo_description", "slug", "hero_image_alt"], properties: {
      locale: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" }, body_md: { type: "string" }, seo_title: { type: "string" }, seo_description: { type: "string" }, slug: { type: "string" }, hero_image_alt: { type: "string" },
    } } },
  },
};

const topicSchema = { type: "object", additionalProperties: false, required: ["topic"], properties: { topic: { type: "string" } } };

async function listArticles() {
  const posts = await supabase("blog_posts?select=*&order=updated_at.desc") as Array<Record<string, unknown>>;
  let translations: Array<Record<string, unknown>>;
  try { translations = await supabase("blog_post_translations?select=*&order=locale.asc") as Array<Record<string, unknown>>; }
  catch { translations = []; }
  let drafts: Array<Record<string, unknown>> = [];
  try { drafts = await supabase("blog_translation_drafts?select=*") as Array<Record<string, unknown>>; } catch { /* migration not applied yet */ }
  return posts.map(post => ({
    ...post,
    translations: [...new Set([
      ...translations.filter(row => row.post_id === post.id).map(row => String(row.locale)),
      ...drafts.filter(row => row.post_id === post.id).map(row => String(row.locale)),
    ])].map(locale => {
      const published = translations.find(row => row.post_id === post.id && row.locale === locale);
      const draft = drafts.find(candidate => candidate.post_id === post.id && candidate.locale === locale);
      return { ...(published ?? { post_id: post.id, locale }), draft: draft ?? null };
    }),
  }));
}

async function saveDraft(postId: string, locale: string, body: Record<string, unknown>) {
  const current = (await supabase(`blog_translation_drafts?post_id=eq.${encodeURIComponent(postId)}&locale=eq.${encodeURIComponent(locale)}&select=*`) as Array<Record<string, unknown>>)[0];
  const isVersion = body.saveMode === "version";
  const localRevision = body.resetLocalRevision === true ? 0 : Number(current?.local_revision ?? body.local_revision ?? 0) + (isVersion ? 1 : 0);
  const record = {
    post_id: postId, locale,
    title: String(body.title ?? ""), excerpt: String(body.excerpt ?? ""), body_md: String(body.body_md ?? ""),
    slug: slugify(String(body.slug ?? body.title ?? "")), seo_title: String(body.seo_title ?? ""), seo_description: String(body.seo_description ?? ""), hero_image_alt: String(body.hero_image_alt ?? ""),
    common_revision: Number(body.common_revision ?? 1), local_revision: localRevision,
    source_locale: String(body.source_locale ?? locale), manually_edited: true,
    content_hash: hashContent(`${body.title ?? ""}\n${body.body_md ?? ""}`), save_state: isVersion ? "version" : "autosave", updated_at: new Date().toISOString(),
  };
  const saved = await supabase("blog_translation_drafts?on_conflict=post_id,locale", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(record) }) as Array<Record<string, unknown>>;
  return saved[0];
}

async function generateArticle(topicId: string) {
  const topics = await supabase(`blog_topic_queue?id=eq.${encodeURIComponent(topicId)}&select=*`) as Array<Record<string, unknown>>;
  const topic = topics[0];
  if (!topic) throw new Error("Téma nebylo nalezeno");
  await supabase(`blog_topic_queue?id=eq.${encodeURIComponent(topicId)}`, { method: "PATCH", body: JSON.stringify({ status: "generating", last_error: null, updated_at: new Date().toISOString() }) });
  const runId = randomUUID();
  const { articleModel } = config();
  await supabase("blog_generation_runs", { method: "POST", body: JSON.stringify({ id: runId, topic_id: topicId, run_type: "article", status: "running", source_locale: "cs", provider: "openai", model: articleModel }) });
  try {
    const target = Number(topic.target_characters ?? 2200);
    const guidance = await editorialGuidance();
    const prompt = `Napiš praktický český SEO článek pro EuroGoPass na téma: ${topic.topic}. Cíl je ${target} znaků včetně mezer, přijatelná odchylka 20 %. Udělej internetovou rešerši. Důležitá fakta ověř z více zdrojů, ceny a právní pravidla preferenčně z oficiálních zdrojů. Text musí dát přímou odpověď hned v úvodu, být přehledný a informační. EuroGoPass nabídni organicky pouze v posledním odstavci jako způsob, jak vyřídit potřebné dálniční známky na jednom místě. Nepoužívej neověřené superlativy. body_md vrať jako čistý Markdown bez H1 (titulek je samostatně). countries vrať jako ISO alpha-2 kódy. claims obsahuje jen důležitá faktická tvrzení, verified označ true pouze při skutečném ověření rešerší a source_urls musí obsahovat přesné plné URL zdrojů použitých pro dané tvrzení.${guidance ? `\n\n${guidance}` : ""}`;
    const generated = await openaiResponse(prompt, "eurogopass_article", articleSchema, articleModel, true);
    const article = generated.data;
    const post = (await supabase("blog_posts", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      slug: slugify(String(article.slug ?? article.title)), status: "draft", countries: article.countries, tags: article.tags,
      source_provider: "openai", source_model: articleModel, source_topic: topic.topic,
    }) }) as Array<Record<string, unknown>>)[0];
    const translation = (await supabase("blog_post_translations", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({
      post_id: post.id, locale: "cs", title: article.title, excerpt: article.excerpt, body_md: article.body_md,
      slug: slugify(String(article.slug ?? article.title)), seo_title: article.seo_title, seo_description: article.seo_description,
      common_revision: 1, local_revision: 0, source_locale: "cs", editorial_status: "ready", content_hash: hashContent(`${article.title}\n${article.body_md}`),
    }) }) as Array<Record<string, unknown>>)[0];
    const sources = webSources(generated.raw);
    const storedSources = sources.length ? await supabase("blog_research_sources", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(sources.map(source => ({ post_id: post.id, ...source, trust_level: "unknown" }))) }) as Array<Record<string, unknown>> : [];
    const claims = Array.isArray(article.claims) ? article.claims as Array<Record<string, unknown>> : [];
    for (const claim of claims) {
      const stored = (await supabase("blog_article_claims", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ post_id: post.id, locale: "cs", claim_text: claim.text, status: claim.verified ? "verified" : "unverified" }) }) as Array<Record<string, unknown>>)[0];
      const requestedUrls = Array.isArray(claim.source_urls) ? claim.source_urls.map(String) : [];
      const links = storedSources.filter(source => requestedUrls.includes(String(source.url))).map(source => ({ claim_id: stored.id, source_id: source.id }));
      if (links.length) await supabase("blog_claim_sources", { method: "POST", body: JSON.stringify(links) });
    }
    await supabase(`blog_topic_queue?id=eq.${encodeURIComponent(topicId)}`, { method: "PATCH", body: JSON.stringify({ status: "review", post_id: post.id, updated_at: new Date().toISOString() }) });
    await supabase(`blog_generation_runs?id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "completed", finished_at: new Date().toISOString() }) });
    return { post, translation };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generování selhalo";
    await supabase(`blog_topic_queue?id=eq.${encodeURIComponent(topicId)}`, { method: "PATCH", body: JSON.stringify({ status: "failed", last_error: message, updated_at: new Date().toISOString() }) }).catch(() => undefined);
    await supabase(`blog_generation_runs?id=eq.${runId}`, { method: "PATCH", body: JSON.stringify({ status: "failed", error: message, finished_at: new Date().toISOString() }) }).catch(() => undefined);
    throw error;
  }
}

export async function runEditorialAutomationCycle() {
  const rows = await supabase("blog_automation_settings?select=*&limit=1") as Array<Record<string, unknown>>;
  const settings = rows[0];
  if (!settings?.enabled) return { action: "disabled" };
  const pragueParts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const part = (type: string) => pragueParts.find(candidate => candidate.type === type)?.value ?? "";
  const weekday = ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[part("weekday")];
  if (!(settings.weekdays as number[] | undefined)?.includes(weekday) || Number(part("hour")) < Number(settings.generation_hour ?? 7)) return { action: "outside_schedule" };
  const review = await supabase("blog_topic_queue?status=eq.review&select=id") as Array<Record<string, unknown>>;
  const limit = Number(settings.max_pending_reviews ?? 10);
  if (limit > 0 && review.length >= limit) return { action: "pending_limit", count: review.length };
  const pragueDate = `${part("year")}-${part("month")}-${part("day")}`;
  const lookback = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();
  const recentRuns = await supabase(`blog_generation_runs?run_type=eq.article&status=eq.completed&started_at=gte.${encodeURIComponent(lookback)}&select=id,started_at`) as Array<Record<string, unknown>>;
  const runs = recentRuns.filter(run => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(String(run.started_at))) === pragueDate);
  if (runs.length >= Number(settings.drafts_per_day ?? 2)) return { action: "daily_limit", count: runs.length };
  const topics = await supabase("blog_topic_queue?status=eq.queued&select=*&order=priority.desc,created_at.asc&limit=1") as Array<Record<string, unknown>>;
  if (!topics[0]) return { action: "empty_queue" };
  const result = await generateArticle(String(topics[0].id));
  return { action: "generated", postId: result.post.id };
}

async function generateTranslations(postId: string, sourceLocale: string) {
  const articles = await listArticles() as Array<Record<string, unknown>>;
  const post = articles.find(candidate => candidate.id === postId) as Record<string, unknown> | undefined;
  if (!post) throw new Error("Článek nebyl nalezen");
  const translations = post.translations as Array<Record<string, unknown>>;
  const sourceRow = translations.find(row => row.locale === sourceLocale);
  if (!sourceRow) throw new Error("Zdrojový jazyk nebyl nalezen");
  const source = (sourceRow.draft as Record<string, unknown> | null) ?? sourceRow;
  const currentRevision = Math.max(...translations.map(row => Number(((row.draft as Record<string, unknown> | null) ?? row).common_revision ?? 1)));
  const sourceRevision = Number(source.common_revision ?? 1);
  const sourceHasLocalChanges = Number(source.local_revision ?? 0) > 0;
  const nextRevision = sourceHasLocalChanges ? currentRevision + 1 : currentRevision;
  const targets = editorialLocales.filter(locale => {
    if (locale === sourceLocale) return false;
    const targetRow = translations.find(row => row.locale === locale);
    if (!targetRow) return true;
    const target = (targetRow.draft as Record<string, unknown> | null) ?? targetRow;
    return sourceHasLocalChanges || Number(target.common_revision ?? 1) < Math.max(sourceRevision, currentRevision);
  });
  const { translationModel } = config();
  const guidance = await editorialGuidance();
  for (let index = 0; index < targets.length; index += 6) {
    const locales = targets.slice(index, index + 6);
    const prompt = `Přelož následující článek z jazyka ${sourceLocale} do přesně těchto locale: ${locales.join(", ")}. Zachovej význam, fakta, Markdown strukturu a přirozený organický závěrečný odstavec o EuroGoPass. Titulek, SEO metadata, slug a alt text lokalizuj přirozeně pro každý jazyk. Nevkládej nové skutečnosti.\n\nTitulek: ${source.title}\nPerex: ${source.excerpt}\nSEO title: ${source.seo_title ?? ""}\nSEO description: ${source.seo_description ?? ""}\nObsah:\n${source.body_md}${guidance ? `\n\n${guidance}` : ""}`;
    const generated = await openaiResponse(prompt, "eurogopass_translations", translationSchema, translationModel, false);
    const rows = Array.isArray(generated.data.translations) ? generated.data.translations as Array<Record<string, unknown>> : [];
    for (const row of rows) {
      const locale = String(row.locale);
      if (!locales.includes(locale)) continue;
      await supabase("blog_translation_drafts?on_conflict=post_id,locale", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({
        post_id: postId, locale, title: row.title, excerpt: row.excerpt, body_md: row.body_md, slug: slugify(String(row.slug ?? row.title)), seo_title: row.seo_title, seo_description: row.seo_description, hero_image_alt: row.hero_image_alt,
        common_revision: nextRevision, local_revision: 0, source_locale: sourceLocale, manually_edited: false, content_hash: hashContent(`${row.title}\n${row.body_md}`), save_state: "version", updated_at: new Date().toISOString(),
      }) });
    }
  }
  await saveDraft(postId, sourceLocale, { ...source, common_revision: nextRevision, local_revision: 0, resetLocalRevision: true, source_locale: sourceLocale, saveMode: "autosave" });
  return { commonRevision: nextRevision, locales: targets, skippedLocales: editorialLocales.filter(locale => locale !== sourceLocale && !targets.includes(locale)) };
}

async function publishArticle(postId: string, publishedBy: string) {
  const drafts = await supabase(`blog_translation_drafts?post_id=eq.${encodeURIComponent(postId)}&select=*`) as Array<Record<string, unknown>>;
  for (const draft of drafts) {
    const record = { ...draft, id: undefined, save_state: undefined, created_at: undefined, updated_at: new Date().toISOString(), editorial_status: "published", last_published_at: new Date().toISOString() };
    await supabase("blog_post_translations?on_conflict=post_id,locale", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(record) });
  }
  await supabase(`blog_posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", body: JSON.stringify({ status: "published", published_at: new Date().toISOString(), published_by: publishedBy, updated_at: new Date().toISOString() }) });
  if (drafts.length) await supabase(`blog_translation_drafts?post_id=eq.${encodeURIComponent(postId)}`, { method: "DELETE" });
  return { published: true, locales: drafts.map(row => row.locale) };
}

async function uploadHero(postId: string, filename: string, contentType: string, req: import("node:http").IncomingMessage) {
  const { supabaseUrl, supabaseKey } = config();
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase konfigurace není dostupná");
  if (!contentType.startsWith("image/")) throw new Error("Vybraný soubor není obrázek");
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.length; if (size > 10 * 1024 * 1024) throw new Error("Obrázek může mít maximálně 10 MB"); chunks.push(buffer); }
  const extension = filename.toLowerCase().match(/\.(jpe?g|png|webp|avif)$/)?.[1] ?? "jpg";
  const path = `${postId}/hero-${Date.now()}.${extension}`;
  const response = await fetch(`${supabaseUrl}/storage/v1/object/blog-hero-images/${path}`, { method: "POST", headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}`, "Content-Type": contentType, "x-upsert": "true" }, body: Buffer.concat(chunks) });
  if (!response.ok) throw new Error(`Nahrání obrázku selhalo: ${await response.text()}`);
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/blog-hero-images/${path}`;
  await supabase(`blog_posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", body: JSON.stringify({ hero_image_url: publicUrl, updated_at: new Date().toISOString() }) });
  return { url: publicUrl };
}

async function removeHero(postId: string) {
  const { supabaseUrl, supabaseKey } = config();
  if (!supabaseUrl || !supabaseKey) throw new Error("Supabase konfigurace není dostupná");
  const rows = await supabase(`blog_posts?id=eq.${encodeURIComponent(postId)}&select=hero_image_url&limit=1`) as Array<{ hero_image_url?: string | null }>;
  const publicUrl = rows[0]?.hero_image_url;
  const marker = "/storage/v1/object/public/blog-hero-images/";
  if (publicUrl?.includes(marker)) {
    const path = publicUrl.split(marker)[1];
    const response = await fetch(`${supabaseUrl}/storage/v1/object/blog-hero-images/${path}`, { method: "DELETE", headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } });
    if (!response.ok && response.status !== 404) throw new Error(`Smazání obrázku selhalo: ${await response.text()}`);
  }
  await supabase(`blog_posts?id=eq.${encodeURIComponent(postId)}`, { method: "PATCH", body: JSON.stringify({ hero_image_url: null, updated_at: new Date().toISOString() }) });
  return { deleted: true };
}

export function editorialApi(actorEmail: (req: import("node:http").IncomingMessage) => string = () => "system") {
  return {
    name: "eurogopass-editorial-api",
    configureServer(server: import("vite").ViteDevServer) {
      server.middlewares.use("/api/editorial", async (req, res) => {
        const method = req.method ?? "GET";
        const url = new URL(req.url ?? "/", "http://localhost");
        const route = url.pathname.replace(/\/$/, "") || "/";
        try {
          if (method === "GET" && route === "/articles") return json(res, 200, { articles: await listArticles(), locales: editorialLocales });
          const researchMatch = route.match(/^\/articles\/([^/]+)\/research$/);
          if (method === "GET" && researchMatch) {
            const postId = encodeURIComponent(researchMatch[1]);
            const [sources, claims] = await Promise.all([supabase(`blog_research_sources?post_id=eq.${postId}&select=*&order=fetched_at.desc`), supabase(`blog_article_claims?post_id=eq.${postId}&select=*,blog_claim_sources(source_id)&order=created_at.asc`)]);
            return json(res, 200, { sources, claims });
          }
          if (method === "GET" && route === "/topics") {
            try { return json(res, 200, { topics: await supabase("blog_topic_queue?select=*&order=priority.desc,created_at.asc") }); }
            catch { return json(res, 200, { topics: [], setupRequired: true }); }
          }
          if (method === "GET" && route === "/settings") {
            try { const rows = await supabase("blog_automation_settings?select=*&limit=1") as Array<Record<string, unknown>>; return json(res, 200, { settings: rows[0] ?? null }); }
            catch { return json(res, 200, { settings: null, setupRequired: true }); }
          }
          if (method === "GET" && route === "/guides") {
            try { return json(res, 200, { guides: await supabase("blog_editorial_guides?select=*&order=filename.asc") }); }
            catch { return json(res, 200, { guides: [], setupRequired: true }); }
          }
          if (method === "PUT" && route === "/settings") {
            const body = await readBody(req);
            const record = { id: true, enabled: Boolean(body.enabled), drafts_per_day: Math.max(0, Math.min(50, Number(body.drafts_per_day ?? 2))), max_pending_reviews: Math.max(0, Math.min(500, Number(body.max_pending_reviews ?? 10))), generation_hour: Math.max(0, Math.min(23, Number(body.generation_hour ?? 7))), autosave_enabled: body.autosave_enabled !== false, updated_at: new Date().toISOString() };
            const rows = await supabase("blog_automation_settings?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=representation" }, body: JSON.stringify(record) }) as Array<Record<string, unknown>>;
            return json(res, 200, { settings: rows[0] });
          }
          if (method === "POST" && route === "/guides") {
            const existing = await supabase("blog_editorial_guides?select=id") as Array<Record<string, unknown>>;
            if (existing.length >= maxGuideFiles) throw Object.assign(new Error(`Lze uložit nejvýše ${maxGuideFiles} Markdown podkladů`), { status: 400 });
            const body = await readBody(req);
            const actor = actorEmail(req);
            const rows = await supabase("blog_editorial_guides", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ filename: guideFilename(body.filename), content: guideContent(body.content), enabled: body.enabled !== false, created_by: actor, updated_by: actor }) }) as Array<Record<string, unknown>>;
            return json(res, 201, { guide: rows[0] });
          }
          const guideMatch = route.match(/^\/guides\/([^/]+)$/);
          if (method === "PUT" && guideMatch) {
            const body = await readBody(req);
            const rows = await supabase(`blog_editorial_guides?id=eq.${encodeURIComponent(decodeURIComponent(guideMatch[1]))}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ filename: guideFilename(body.filename), content: guideContent(body.content), enabled: body.enabled !== false, updated_by: actorEmail(req), updated_at: new Date().toISOString() }) }) as Array<Record<string, unknown>>;
            if (!rows[0]) throw Object.assign(new Error("Markdown podklad nebyl nalezen"), { status: 404 });
            return json(res, 200, { guide: rows[0] });
          }
          if (method === "DELETE" && guideMatch) {
            await supabase(`blog_editorial_guides?id=eq.${encodeURIComponent(decodeURIComponent(guideMatch[1]))}`, { method: "DELETE" });
            return json(res, 200, { deleted: true });
          }
          if (method === "POST" && route === "/topics") {
            const body = await readBody(req); const raw = Array.isArray(body.topics) ? body.topics : [body.topic];
            const topics = raw.map(value => typeof value === "object" && value !== null ? { topic: String((value as Record<string, unknown>).topic ?? "").trim(), source: (value as Record<string, unknown>).source === "ai" ? "ai" : "manual" } : { topic: String(value ?? "").trim(), source: "manual" }).filter(value => value.topic);
            if (!topics.length) return json(res, 400, { error: "Zadej alespoň jedno téma" });
            const rows = await supabase("blog_topic_queue", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(topics.map(value => ({ topic: value.topic, target_characters: Number(body.targetCharacters ?? 2200), source: value.source }))) });
            return json(res, 201, { topics: rows });
          }
          if (method === "POST" && route === "/topics/suggest") {
            const articles = await listArticles() as Array<Record<string, unknown>>;
            const existing = articles.slice(0, 80).map(article => String(article.source_topic ?? article.slug)).join("\n- ");
            const { translationModel } = config();
            const guidance = await editorialGuidance();
            const generated = await openaiResponse(`Navrhni jedno konkrétní praktické SEO téma pro krátký článek EuroGoPass o dálničních známkách, mýtném nebo cestě autem mezi evropskými zeměmi. Má odpovídat reálnému dotazu cestovatele, nebýt duplicitní a mít jasný informační záměr. Vrať jen téma, ne hotový titulek. Existující témata:\n- ${existing}${guidance ? `\n\n${guidance}` : ""}`, "eurogopass_topic", topicSchema, translationModel, false);
            return json(res, 200, { topic: generated.data.topic });
          }
          const deleteTopicMatch = route.match(/^\/topics\/([^/]+)$/);
          if (method === "DELETE" && deleteTopicMatch) {
            await supabase(`blog_topic_queue?id=eq.${encodeURIComponent(decodeURIComponent(deleteTopicMatch[1]))}`, { method: "DELETE" });
            return json(res, 200, { deleted: true });
          }
          const generateMatch = route.match(/^\/topics\/([^/]+)\/generate$/);
          if (method === "POST" && generateMatch) return json(res, 200, await generateArticle(decodeURIComponent(generateMatch[1])));
          const saveMatch = route.match(/^\/articles\/([^/]+)\/locales\/([^/]+)$/);
          if (method === "PUT" && saveMatch) return json(res, 200, { draft: await saveDraft(decodeURIComponent(saveMatch[1]), decodeURIComponent(saveMatch[2]), await readBody(req)) });
          const translateMatch = route.match(/^\/articles\/([^/]+)\/translate$/);
          if (method === "POST" && translateMatch) { const body = await readBody(req); return json(res, 200, await generateTranslations(decodeURIComponent(translateMatch[1]), String(body.sourceLocale ?? "cs"))); }
          const publishMatch = route.match(/^\/articles\/([^/]+)\/publish$/);
          if (method === "POST" && publishMatch) return json(res, 200, await publishArticle(decodeURIComponent(publishMatch[1]), actorEmail(req)));
          const heroMatch = route.match(/^\/articles\/([^/]+)\/hero$/);
          if (method === "PUT" && heroMatch) return json(res, 200, await uploadHero(decodeURIComponent(heroMatch[1]), url.searchParams.get("filename") ?? "hero.jpg", req.headers["content-type"] ?? "application/octet-stream", req));
          if (method === "DELETE" && heroMatch) return json(res, 200, await removeHero(decodeURIComponent(heroMatch[1])));
          const deleteMatch = route.match(/^\/articles\/([^/]+)$/);
          if (method === "DELETE" && deleteMatch) { await supabase(`blog_posts?id=eq.${encodeURIComponent(deleteMatch[1])}`, { method: "DELETE" }); return json(res, 200, { deleted: true }); }
          json(res, 404, { error: "Editorial route not found" });
        } catch (error) {
          const status = error instanceof Error && "status" in error ? Number((error as Error & { status?: number }).status) : 500;
          json(res, Number.isInteger(status) && status >= 400 && status < 600 ? status : 500, { error: error instanceof Error ? error.message : "Redakční operace selhala" });
        }
      });
    },
  };
}
