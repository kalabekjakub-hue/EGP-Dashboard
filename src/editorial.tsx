import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Bold, Check, ChevronDown, FileText, ImagePlus, Italic, List, LoaderCircle, Sparkles, X } from "lucide-react";

type EditorialDraft = {
  title: string; excerpt: string; body_md: string; slug?: string; seo_title?: string; seo_description?: string; hero_image_alt?: string;
  common_revision?: number; local_revision?: number; source_locale?: string; manually_edited?: boolean; updated_at?: string;
};

type EditorialTranslation = EditorialDraft & { id?: string; locale: string; draft?: EditorialDraft | null; editorial_status?: string; last_published_at?: string };
export type EditorialArticle = { id: string; slug: string; status: string; published_at?: string | null; published_by?: string | null; hero_image_url?: string | null; countries: string[]; tags: string[]; source_topic?: string; created_at: string; updated_at: string; translations: EditorialTranslation[] };
type EditorialTopic = { id: string; topic: string; target_characters: number; status: string; source: string; post_id?: string | null; last_error?: string | null; created_at: string };
type EditorialSettings = { enabled: boolean; drafts_per_day: number; max_pending_reviews: number; generation_hour: number; autosave_enabled: boolean };
type EditorialGuide = { id: string; filename: string; content: string; enabled: boolean; updated_at: string; updated_by?: string | null };
type EditorialSource = { id: string; url: string; title: string; trust_level: string; fetched_at: string };
type EditorialClaim = { id: string; claim_text: string; status: string; blog_claim_sources?: Array<{ source_id: string }> };

const localeNames: Record<string, string> = { bg: "Bulharština", hr: "Chorvatština", cs: "Čeština", da: "Dánština", nl: "Nizozemština", en: "Angličtina", et: "Estonština", fi: "Finština", fr: "Francouzština", de: "Němčina", el: "Řečtina", hu: "Maďarština", ga: "Irština", it: "Italština", lv: "Lotyština", lt: "Litevština", mt: "Maltština", pl: "Polština", pt: "Portugalština", ro: "Rumunština", sk: "Slovenština", sl: "Slovinština", es: "Španělština", sv: "Švédština" };

function currentValue(row: EditorialTranslation): EditorialDraft & { locale: string } {
  return { ...row, ...(row.draft ?? {}), locale: row.locale };
}

function versionLabel(value: EditorialDraft, locale: string) {
  const common = value.common_revision ?? 1;
  const local = value.local_revision ?? 0;
  return local ? `V${common} · ${locale.toUpperCase()}${local}` : `V${common}`;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function markdownToHtml(markdown: string) {
  const inline = (value: string) => escapeHtml(value).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>").replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  const lines = markdown.split(/\r?\n/); const html: string[] = []; let list = false;
  const closeList = () => { if (list) { html.push("</ul>"); list = false; } };
  for (const line of lines) {
    if (line.startsWith("## ")) { closeList(); html.push(`<h2>${inline(line.slice(3))}</h2>`); }
    else if (line.startsWith("### ")) { closeList(); html.push(`<h3>${inline(line.slice(4))}</h3>`); }
    else if (/^[-*] /.test(line)) { if (!list) { html.push("<ul>"); list = true; } html.push(`<li>${inline(line.slice(2))}</li>`); }
    else if (!line.trim()) { closeList(); }
    else { closeList(); html.push(`<p>${inline(line)}</p>`); }
  }
  closeList(); return html.join("");
}

function htmlToMarkdown(html: string) {
  const root = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html").body.firstElementChild;
  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
    const element = node as HTMLElement; const content = [...element.childNodes].map(walk).join("");
    if (["STRONG", "B"].includes(element.tagName)) return `**${content}**`;
    if (["EM", "I"].includes(element.tagName)) return `*${content}*`;
    if (element.tagName === "A") return `[${content}](${element.getAttribute("href") ?? ""})`;
    if (element.tagName === "H2") return `## ${content}\n\n`;
    if (element.tagName === "H3") return `### ${content}\n\n`;
    if (element.tagName === "LI") return `- ${content}\n`;
    if (element.tagName === "P" || element.tagName === "DIV") return `${content}\n\n`;
    if (element.tagName === "BR") return "\n";
    return content;
  };
  return root ? walk(root).replace(/\n{3,}/g, "\n\n").trim() : "";
}

function statusLabel(status: string) {
  return ({ draft: "Koncept", published: "Publikováno", queued: "Čeká", scheduled: "Naplánováno", generating: "Generuje se", review: "Čeká na kontrolu", completed: "Hotovo", failed: "Chyba", paused: "Pozastaveno" } as Record<string, string>)[status] ?? status;
}

function isTopicOnBoard(topic: EditorialTopic) {
  return !topic.post_id && topic.status !== "review" && topic.status !== "completed";
}

export function EditorialPreview({ onOpen }: { onOpen: () => void }) {
  const [preview, setPreview] = useState<{ topics: number; review: number; automation: boolean } | null>(null);
  useEffect(() => {
    void Promise.all([fetch("/api/editorial/topics"), fetch("/api/editorial/settings")])
      .then(async ([topicsResponse, settingsResponse]) => {
        if (!topicsResponse.ok || !settingsResponse.ok) throw new Error();
        const topicsPayload = await topicsResponse.json() as { topics?: EditorialTopic[] };
        const settingsPayload = await settingsResponse.json() as { settings?: EditorialSettings | null };
        const topics = topicsPayload.topics ?? [];
        setPreview({ topics: topics.filter(isTopicOnBoard).length, review: topics.filter(topic => topic.status === "review").length, automation: settingsPayload.settings?.enabled === true });
      })
      .catch(() => setPreview(null));
  }, []);
  return <section className="editorial-preview surface"><div className="editorial-preview-metrics"><span><small>Témata na tabuli</small><strong>{preview?.topics ?? "–"}</strong></span><span><small>Čeká na schválení</small><strong>{preview?.review ?? "–"}</strong></span><span><small>Automatická tvorba</small><strong className={preview?.automation ? "enabled" : "disabled"}>{preview ? preview.automation ? "Zapnutá" : "Vypnutá" : "–"}</strong></span></div><button className="editorial-preview-open" onClick={onOpen}>Redakce</button></section>;
}

export function EditorialHome({ back, openArticle }: { back: () => void; openArticle: (id: string) => void }) {
  const [articles, setArticles] = useState<EditorialArticle[]>([]); const [topics, setTopics] = useState<EditorialTopic[]>([]);
  const [automation, setAutomation] = useState<Pick<EditorialSettings, "enabled" | "generation_hour">>({ enabled: false, generation_hour: 7 });
  const [topicInput, setTopicInput] = useState(""); const [characters, setCharacters] = useState(2200);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "error">("loading"); const [generating, setGenerating] = useState(""); const [message, setMessage] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiSuggestedTopics, setAiSuggestedTopics] = useState<string[]>([]);
  const [selectedTopic, setSelectedTopic] = useState("");
  const load = async () => {
    try { const [articleResponse, topicResponse, settingsResponse] = await Promise.all([fetch("/api/editorial/articles"), fetch("/api/editorial/topics"), fetch("/api/editorial/settings")]); if (!articleResponse.ok || !topicResponse.ok) throw new Error(); const articlePayload = await articleResponse.json() as { articles: EditorialArticle[] }; const topicPayload = await topicResponse.json() as { topics: EditorialTopic[]; setupRequired?: boolean }; const settingsPayload = settingsResponse.ok ? await settingsResponse.json() as { settings?: EditorialSettings | null } : null; setArticles(articlePayload.articles); setTopics(topicPayload.topics.filter(isTopicOnBoard)); if (settingsPayload?.settings) setAutomation({ enabled: settingsPayload.settings.enabled, generation_hour: settingsPayload.settings.generation_hour }); setMessage(topicPayload.setupRequired ? "Pro tabuli témat je potřeba aplikovat připravenou Supabase migraci." : ""); setState("ready"); } catch { setState("error"); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const addTopics = async (event: FormEvent) => {
    event.preventDefault(); const values = topicInput.split(/\r?\n/).map(value => value.trim()).filter(Boolean); if (!values.length) return;
    setState("saving"); setMessage("");
    try { const response = await fetch("/api/editorial/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topics: values.map(topic => ({ topic, source: aiSuggestedTopics.includes(topic) ? "ai" : "manual" })), targetCharacters: characters }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setTopicInput(""); setAiSuggestedTopics([]); await load(); }
    catch (error) { setState("ready"); setMessage(error instanceof Error ? error.message : "Témata se nepodařilo uložit"); }
  };
  const generate = async (topic: EditorialTopic) => {
    setGenerating(topic.id); setMessage("");
    try { const response = await fetch(`/api/editorial/topics/${topic.id}/generate`, { method: "POST" }); const payload = await response.json() as { post?: { id: string }; error?: string }; if (!response.ok) throw new Error(payload.error); if (payload.post?.id) { setTopics(current => current.filter(item => item.id !== topic.id)); openArticle(payload.post.id); } else await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Generování selhalo"); await load(); }
    finally { setGenerating(""); }
  };
  const suggestTopic = async () => { setSuggesting(true); setMessage(""); try { const response = await fetch("/api/editorial/topics/suggest", { method: "POST" }); const payload = await response.json() as { topic?: string; error?: string }; if (!response.ok || !payload.topic) throw new Error(payload.error); setAiSuggestedTopics(current => [...current, payload.topic!]); setTopicInput(current => current.trim() ? `${current.trim()}\n${payload.topic}` : payload.topic!); } catch (error) { setMessage(error instanceof Error ? error.message : "Návrh tématu selhal"); } finally { setSuggesting(false); } };
  const deleteTopic = async (topic: EditorialTopic) => { setMessage(""); try { const response = await fetch(`/api/editorial/topics/${topic.id}`, { method: "DELETE" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setSelectedTopic(""); setTopics(current => current.filter(item => item.id !== topic.id)); } catch (error) { setMessage(error instanceof Error ? error.message : "Téma se nepodařilo smazat"); } };
  const nextGeneration = useMemo(() => { const date = new Date(); date.setHours(automation.generation_hour, 0, 0, 0); if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1); return date.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); }, [automation.generation_hour]);
  return <main className="page-shell editorial-page"><button className="back-button" onClick={back}>← Zpět</button>
    <form className="editorial-topic-bar surface" onSubmit={event => void addTopics(event)}><textarea value={topicInput} onChange={event => setTopicInput(event.target.value)} placeholder="Napiš téma článku. Více témat můžeš vložit každé na nový řádek…" /><label className="editorial-length"><input aria-label="Počet znaků" title="Počet znaků" type="number" min={500} max={12000} step={100} value={characters} onChange={event => setCharacters(Number(event.target.value))} /></label><button type="button" className="suggest" aria-label="Navrhnout téma pomocí AI" title="Navrhnout téma pomocí AI" disabled={suggesting} onClick={() => void suggestTopic()}><Sparkles className={suggesting ? "spin" : undefined} size={19} /></button><button disabled={state === "saving" || !topicInput.trim()}>Přidat</button></form>
    {message && <div className="editorial-message"><AlertTriangle size={17} />{message}</div>}
{state === "loading" ? <div className="editorial-empty surface">Načítám redakci…</div> : state === "error" ? <div className="editorial-empty surface error">Redakci se nepodařilo načíst.</div> : <section className="editorial-overview"><section className="editorial-overview-panel surface"><header><h2>Tabule témat</h2><b>{topics.length}</b></header><div className="editorial-topic-list">{topics.map(topic => <article className={selectedTopic === topic.id ? "selected" : ""} key={topic.id} onClick={() => setSelectedTopic(current => current === topic.id ? "" : topic.id)}><div className="topic-title"><h3>{topic.topic}</h3><span className={`topic-source ${topic.source}`}>{topic.source === "ai" ? "AI" : "Člověk"}</span><span className="topic-characters">{topic.target_characters.toLocaleString("cs-CZ")} znaků</span></div>{selectedTopic === topic.id ? <button className="delete-topic" aria-label="Smazat téma" title="Smazat téma" onClick={event => { event.stopPropagation(); void deleteTopic(topic); }}><X size={18} /></button> : <div className="topic-actions">{topic.status === "review" ? <button aria-label="Otevřít článek" title="Otevřít článek" onClick={event => { event.stopPropagation(); if (topic.post_id) openArticle(topic.post_id); }}><FileText size={18} /></button> : <button className={automation.enabled ? "automatic" : ""} aria-label="Vygenerovat pomocí AI" title="Vygenerovat pomocí AI" disabled={generating === topic.id} onClick={event => { event.stopPropagation(); void generate(topic); }}>{generating === topic.id ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}</button>}{automation.enabled && topic.status !== "review" && <time>{nextGeneration}</time>}</div>}</article>)}{!topics.length && <div className="editorial-empty">Zatím tu nejsou žádná témata.</div>}</div></section><section className="editorial-overview-panel surface"><header><h2>Články</h2><b>{articles.length}</b></header><div className="editorial-overview-articles">{articles.map(article => { const cs = article.translations.find(row => row.locale === "cs") ?? article.translations[0]; const value = cs ? currentValue(cs) : null; return <button className="editorial-article-card" key={article.id} onClick={() => openArticle(article.id)}>{article.hero_image_url ? <img src={article.hero_image_url} alt="" /> : <span className="editorial-card-placeholder"><FileText size={25} /></span>}<div><span className={`editorial-status ${article.status}`}>{statusLabel(article.status)}</span><h2>{value?.title || article.source_topic || article.slug}</h2><p>{value?.excerpt || "Článek zatím nemá český perex."}</p><div className="article-publish-meta">{article.published_at ? <><span>{article.published_by || "Neznámý autor"}</span><time>{new Date(article.published_at).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time></> : <span>Dosud nepublikováno</span>}</div><footer><span>{article.translations.length}/24 jazyků</span><b>{value ? versionLabel(value, cs?.locale ?? "cs") : "V1"}</b></footer></div></button>; })}{!articles.length && <div className="editorial-empty">Zatím tu nejsou žádné články.</div>}</div></section></section>}
  </main>;
}

export function EditorialSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<EditorialSettings>({ enabled: false, drafts_per_day: 2, max_pending_reviews: 10, generation_hour: 7, autosave_enabled: true });
  const [guides, setGuides] = useState<EditorialGuide[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [guideState, setGuideState] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [guideSetupRequired, setGuideSetupRequired] = useState(false);
  const [expandedGuideId, setExpandedGuideId] = useState("");
  const [message, setMessage] = useState("");
  const [guideMessage, setGuideMessage] = useState("");
  const guidesEnabled = guides.length > 0 && guides.every(guide => guide.enabled);
  useEffect(() => {
    void Promise.all([fetch("/api/editorial/settings"), fetch("/api/editorial/guides")])
      .then(async ([settingsResponse, guidesResponse]) => {
        if (!settingsResponse.ok || !guidesResponse.ok) throw new Error();
        const settingsPayload = await settingsResponse.json() as { settings?: EditorialSettings | null };
        const guidesPayload = await guidesResponse.json() as { guides?: EditorialGuide[]; setupRequired?: boolean };
        if (settingsPayload.settings) setSettings(settingsPayload.settings);
        setGuides(guidesPayload.guides ?? []);
        setGuideSetupRequired(guidesPayload.setupRequired === true);
        setState("ready"); setGuideState("ready");
      })
      .catch(() => { setState("error"); setMessage("Nastavení Redakce se nepodařilo načíst."); });
  }, []);
  const save = async () => {
    setState("saving"); setGuideState("saving"); setMessage(""); setGuideMessage("");
    try {
      const [settingsResponse, ...guideResponses] = await Promise.all([
        fetch("/api/editorial/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) }),
        ...guides.map(guide => fetch(`/api/editorial/guides/${guide.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: guide.filename, content: guide.content, enabled: guide.enabled }) })),
      ]);
      const settingsPayload = await settingsResponse.json() as { settings?: EditorialSettings; error?: string };
      if (!settingsResponse.ok) throw new Error(settingsPayload.error);
      const savedGuides: EditorialGuide[] = [];
      for (const response of guideResponses) {
        const payload = await response.json() as { guide?: EditorialGuide; error?: string };
        if (!response.ok || !payload.guide) throw new Error(payload.error ?? "Podklad se nepodařilo uložit");
        savedGuides.push(payload.guide);
      }
      if (settingsPayload.settings) setSettings(settingsPayload.settings);
      setGuides(savedGuides.sort((a, b) => a.filename.localeCompare(b.filename, "cs")));
      setState("saved"); setGuideState("ready"); setMessage("");
      window.setTimeout(() => setState(current => current === "saved" ? "ready" : current), 1800);
    } catch (error) { setState("error"); setGuideState("error"); setMessage(error instanceof Error ? error.message : "Nastavení se nepodařilo uložit."); }
  };
  const uploadGuides = async (files: FileList | null) => {
    const selected = Array.from(files ?? []); if (!selected.length) return;
    setGuideState("saving"); setGuideMessage("");
    try {
      const created: EditorialGuide[] = [];
      for (const file of selected) {
        if (!file.name.toLowerCase().endsWith(".md")) throw new Error(`${file.name}: podporované jsou pouze soubory .md`);
        const response = await fetch("/api/editorial/guides", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filename: file.name, content: await file.text(), enabled: guidesEnabled }) });
        const payload = await response.json() as { guide?: EditorialGuide; error?: string };
        if (!response.ok || !payload.guide) throw new Error(payload.error ?? `${file.name} se nepodařilo nahrát`);
        created.push(payload.guide);
      }
      setGuides(current => [...current, ...created].sort((a, b) => a.filename.localeCompare(b.filename, "cs")));
      setGuideState("ready");
    } catch (error) { setGuideState("error"); setGuideMessage(error instanceof Error ? error.message : "Podklady se nepodařilo nahrát."); }
  };
  const deleteGuide = async (guide: EditorialGuide) => {
    if (!window.confirm(`Odstranit podklad „${guide.filename}“?`)) return;
    setGuideState("saving"); setGuideMessage("");
    try {
      const response = await fetch(`/api/editorial/guides/${guide.id}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Podklad se nepodařilo odstranit");
      setGuides(current => current.filter(item => item.id !== guide.id));
      setExpandedGuideId(current => current === guide.id ? "" : current);
      setGuideState("ready");
    } catch (error) { setGuideState("error"); setGuideMessage(error instanceof Error ? error.message : "Podklad se nepodařilo odstranit."); }
  };
  return <div className="editorial-settings-modal" role="presentation" onMouseDown={onClose}>
    <section className="editorial-settings-dialog surface" role="dialog" aria-modal="true" aria-labelledby="editorial-settings-title" onMouseDown={event => event.stopPropagation()}>
      <button className="editorial-settings-close" onClick={onClose} aria-label="Zavřít nastavení">×</button>
      <h2 id="editorial-settings-title">Nastavení Redakce</h2>
      <p>Automatizace a interní Markdown podklady pro AI.</p>
      <div className="editorial-settings-columns">
        <section>
          <header className="editorial-settings-section-title"><h3>Automatizace článků</h3></header>
          <section className="editorial-settings">
            <label><span>Konceptů denně</span><input type="number" min={0} max={50} value={settings.drafts_per_day || ""} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, drafts_per_day: Number(event.target.value) }))} /></label>
            <label><span>Strop čekajících konceptů</span><input type="number" min={0} max={500} value={settings.max_pending_reviews || ""} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, max_pending_reviews: Number(event.target.value) }))} /></label>
            <label><span>Hodina spuštění</span><select value={settings.generation_hour} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, generation_hour: Number(event.target.value) }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}</select></label>
            <div className="editorial-settings-switches">
              <label><span>Automatické generování</span><input type="checkbox" checked={settings.enabled} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} /></label>
              <label><span>Automatické ukládání</span><input type="checkbox" checked={settings.autosave_enabled} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, autosave_enabled: event.target.checked }))} /></label>
              <label><span>Podklady</span><input type="checkbox" checked={guidesEnabled} disabled={guideState === "saving" || !guides.length} onChange={event => setGuides(current => current.map(guide => ({ ...guide, enabled: event.target.checked })))} /></label>
            </div>
          </section>
          {message && state === "error" && <div className="editorial-message error"><AlertTriangle size={17} />{message}</div>}
        </section>
        <section className="editorial-guide-settings">
          <header className="editorial-settings-section-title">
            <div><h3>Podklady</h3><p>Aktivní soubory AI použije při tvorbě článků, překladů i témat.</p></div>
            <label className="editorial-guide-upload">Nahrát .md<input type="file" accept=".md,text/markdown" multiple disabled={guideState === "saving" || guideSetupRequired} onChange={event => { void uploadGuides(event.target.files); event.target.value = ""; }} /></label>
          </header>
          {guideSetupRequired ? <div className="editorial-guide-empty error">Nejdřív je potřeba aplikovat migraci pro AI podklady.</div> : guides.length ? <div className="editorial-guide-list">{guides.map(guide => <article className={expandedGuideId === guide.id ? "expanded" : ""} key={guide.id}><div className="editorial-guide-row"><button className="editorial-guide-view" onClick={() => setExpandedGuideId(current => current === guide.id ? "" : guide.id)} aria-expanded={expandedGuideId === guide.id}><span>{guide.filename}</span><ChevronDown size={17} /></button><button className="editorial-guide-delete" aria-label={`Smazat ${guide.filename}`} title="Smazat podklad" disabled={guideState === "saving"} onClick={() => void deleteGuide(guide)}><X size={16} /></button></div>{expandedGuideId === guide.id && <div className="editorial-guide-preview"><label><span>Název souboru</span><input aria-label="Název Markdown podkladu" value={guide.filename} maxLength={120} onChange={event => setGuides(current => current.map(item => item.id === guide.id ? { ...item, filename: event.target.value } : item))} /></label><textarea value={guide.content} maxLength={20000} spellCheck={false} onChange={event => setGuides(current => current.map(item => item.id === guide.id ? { ...item, content: event.target.value } : item))} /><small>{guide.content.length.toLocaleString("cs-CZ")} / 20 000 znaků</small></div>}</article>)}</div> : <div className="editorial-guide-empty">Zatím nejsou nahrané žádné podklady. Začni soubory brand-context.md, writing-style.md, article-structure.md a editorial-rules.md.</div>}
          {guideMessage && <div className="editorial-message error"><AlertTriangle size={17} />{guideMessage}</div>}
        </section>
      </div>
      <footer className="editorial-settings-actions">
        <button className={state === "saved" ? "saved" : ""} onClick={() => void save()} disabled={state === "loading" || state === "saving" || guideState === "saving"}>{state === "saving" ? "Ukládám…" : state === "saved" ? "Uloženo" : "Uložit nastavení"}</button>
      </footer>
    </section>
  </div>;
}

export function EditorialArticleEditor({ articleId, initialLocale = "cs", onLocaleChange, back }: { articleId: string; initialLocale?: string; onLocaleChange?: (locale: string) => void; back: () => void }) {
  const [article, setArticle] = useState<EditorialArticle | null>(null); const [locales, setLocales] = useState<string[]>([]); const [locale, setLocale] = useState(initialLocale); const [form, setForm] = useState<EditorialDraft>({ title: "", excerpt: "", body_md: "" }); const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [imagePreviewOpen, setImagePreviewOpen] = useState(false); const [removingHero, setRemovingHero] = useState(false);
  const [hasPendingRevision, setHasPendingRevision] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading"); const [action, setAction] = useState<"" | "translate" | "publish" | "delete">(""); const [, setMessage] = useState(""); const [sources, setSources] = useState<EditorialSource[]>([]); const [claims, setClaims] = useState<EditorialClaim[]>([]); const editorRef = useRef<HTMLDivElement>(null); const autosaveRef = useRef<number | null>(null);
  const load = async (preferredLocale = locale) => { const response = await fetch("/api/editorial/articles"); if (!response.ok) throw new Error(); const payload = await response.json() as { articles: EditorialArticle[]; locales: string[] }; const found = payload.articles.find(candidate => candidate.id === articleId); if (!found) throw new Error(); setArticle(found); setLocales(payload.locales); const row = found.translations.find(candidate => candidate.locale === preferredLocale) ?? found.translations.find(candidate => candidate.locale === "cs") ?? found.translations[0]; if (row) { setLocale(row.locale); const value = currentValue(row); setForm(value); if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(value.body_md); } setState("ready"); };
  // Reload when the route selects another article; load intentionally captures the current locale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setState("error")), 0); return () => window.clearTimeout(timer); }, [articleId]);
  useEffect(() => { void fetch("/api/editorial/settings").then(response => response.ok ? response.json() as Promise<{ settings?: EditorialSettings | null }> : Promise.reject()).then(payload => setAutosaveEnabled(payload.settings?.autosave_enabled !== false)).catch(() => undefined); }, []);
  useEffect(() => { void fetch(`/api/editorial/articles/${articleId}/research`).then(response => response.ok ? response.json() as Promise<{ sources?: EditorialSource[]; claims?: EditorialClaim[] }> : Promise.reject()).then(payload => { setSources(payload.sources ?? []); setClaims(payload.claims ?? []); }).catch(() => undefined); }, [articleId]);
  // Hydrate the editor after the loading view is replaced and whenever the selected language changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (editorRef.current && state !== "saving") editorRef.current.innerHTML = markdownToHtml(form.body_md); }, [locale, state]);
  const row = article?.translations.find(candidate => candidate.locale === locale); const value = row ? currentValue(row) : null;
  const update = (next: Partial<EditorialDraft>) => { setForm(current => ({ ...current, ...next })); setHasPendingRevision(true); if (autosaveRef.current) window.clearTimeout(autosaveRef.current); if (autosaveEnabled) { setState("saving"); autosaveRef.current = window.setTimeout(() => void save("autosave"), 1200); } else setState("ready"); };
  const save = async (mode: "autosave" | "version") => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current); setState("saving");
    try { const editorHtml = editorRef.current?.innerHTML.trim(); const bodyMd = editorHtml ? htmlToMarkdown(editorHtml) : form.body_md; const response = await fetch(`/api/editorial/articles/${articleId}/locales/${locale}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, body_md: bodyMd, saveMode: mode }) }); const payload = await response.json() as { draft?: EditorialDraft; error?: string }; if (!response.ok) throw new Error(payload.error); if (payload.draft) setForm(payload.draft); if (mode === "version") setHasPendingRevision(false); setState("saved"); setMessage(mode === "version" ? "Verze byla uložená." : ""); await load(locale); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Uložení selhalo"); }
  };
  const switchLocale = async (next: string) => { if (state === "saving") await save("autosave"); onLocaleChange?.(next); const target = article?.translations.find(candidate => candidate.locale === next); setLocale(next); setHasPendingRevision(false); const nextValue = target ? currentValue(target) : { title: "", excerpt: "", body_md: "", common_revision: value?.common_revision ?? 1, local_revision: 0, source_locale: "cs" }; setForm(nextValue); window.setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(nextValue.body_md); }, 0); };
  const translate = async () => { setAction("translate"); setMessage("Překládám do ostatních jazyků. Může to chvíli trvat…"); try { if (hasPendingRevision) await save("version"); const response = await fetch(`/api/editorial/articles/${articleId}/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceLocale: locale }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setHasPendingRevision(false); await load(locale); setMessage("Jazykové verze jsou připravené jako koncepty."); } catch (error) { setMessage(error instanceof Error ? error.message : "Překlad selhal"); } finally { setAction(""); } };
  const publish = async () => { setAction("publish"); setMessage(""); try { await save("version"); const response = await fetch(`/api/editorial/articles/${articleId}/publish`, { method: "POST" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(locale); setMessage("Změny byly publikovány."); } catch (error) { setMessage(error instanceof Error ? error.message : "Publikace selhala"); } finally { setAction(""); } };
  const uploadHero = async (file?: File) => { if (!file) return; setMessage(""); try { const response = await fetch(`/api/editorial/articles/${articleId}/hero?filename=${encodeURIComponent(file.name)}`, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(locale); } catch (error) { setMessage(error instanceof Error ? error.message : "Nahrání obrázku selhalo"); } };
  const deleteHero = async () => { setRemovingHero(true); setMessage(""); try { const response = await fetch(`/api/editorial/articles/${articleId}/hero`, { method: "DELETE" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setImagePreviewOpen(false); await load(locale); } catch (error) { setMessage(error instanceof Error ? error.message : "Smazání obrázku selhalo"); } finally { setRemovingHero(false); } };
  const remove = async () => { if (!article || !window.confirm(`Trvale smazat článek „${form.title || article.slug}“ a všechny jeho jazykové verze? Tuto akci nelze vrátit.`)) return; setAction("delete"); const response = await fetch(`/api/editorial/articles/${articleId}`, { method: "DELETE" }); if (response.ok) back(); else { const payload = await response.json() as { error?: string }; setMessage(payload.error ?? "Smazání selhalo"); setAction(""); } };
  const command = (name: string, value?: string) => { editorRef.current?.focus(); document.execCommand(name, false, value); update({ body_md: editorRef.current ? htmlToMarkdown(editorRef.current.innerHTML) : form.body_md }); };
  const divergent = useMemo(() => { if (!article?.translations.length) return []; const versions = article.translations.map(item => ({ locale: item.locale, value: currentValue(item) })); const maxCommon = Math.max(...versions.map(item => item.value.common_revision ?? 1)); return versions.filter(item => (item.value.common_revision ?? 1) !== maxCommon || (item.value.local_revision ?? 0) > 0); }, [article]);
  const languagesOutOfSync = useMemo(() => {
    if (!article || article.translations.length < 2) return false;
    const versions = article.translations.map(item => currentValue(item));
    const commonRevisions = new Set(versions.map(item => item.common_revision ?? 1));
    return commonRevisions.size > 1 || versions.some(item => (item.local_revision ?? 0) > 0);
  }, [article]);
  const latestCommonRevision = useMemo(() => Math.max(1, ...(article?.translations.map(item => currentValue(item).common_revision ?? 1) ?? [1])), [article]);
  if (state === "loading") return <main className="page-shell editorial-page"><div className="editorial-empty surface">Načítám článek…</div></main>;
  if (!article || state === "error" && !form.title) return <main className="page-shell editorial-page"><button className="back-button" onClick={back}>← Zpět</button><div className="editorial-empty surface error">Článek se nepodařilo načíst.</div></main>;
  return <main className="page-shell editorial-page editorial-editor-page"><div className="editorial-editor-top"><button className="back-button" onClick={back}>← Zpět</button></div>
    <section className="editorial-editor-head"><div className="editorial-current-version"><span>{localeNames[locale] ?? locale.toUpperCase()}</span><strong>{versionLabel(form, locale)}</strong></div><div className="editorial-actions">{languagesOutOfSync && <button className="sync-warning" onClick={() => void translate()} disabled={!!action || !form.body_md}>Jazyky nejsou sjednocené · {versionLabel(form, locale)}</button>}<button className="save" onClick={() => void save("version")} disabled={state === "saving"}>Uložit</button><button className="translate" onClick={() => void translate()} disabled={!!action || !form.body_md}>{action === "translate" ? "Překládám…" : article.translations.length > 1 ? "Aktualizovat jazyky" : "Vygenerovat jazyky"}</button><button className="primary" onClick={() => void publish()} disabled={!!action || !form.body_md}>{action === "publish" ? "Publikuji…" : article.status === "published" ? "Publikovat změny" : "Publikovat"}</button></div></section>
    <div className="editorial-editor-layout"><section className="editorial-document surface"><div className="editorial-fields"><label><span>Titulek</span><input value={form.title} onChange={event => update({ title: event.target.value })} /></label><label><span>Perex</span><textarea value={form.excerpt} onChange={event => update({ excerpt: event.target.value })} /></label></div><div className="editorial-toolbar"><button title="Tučně" onClick={() => command("bold")}><Bold size={16} /></button><button title="Kurzíva" onClick={() => command("italic")}><Italic size={16} /></button><button title="Nadpis" onClick={() => command("formatBlock", "h2")}>H2</button><button title="Odrážky" onClick={() => command("insertUnorderedList")}><List size={16} /></button><span>{form.body_md.length.toLocaleString("cs-CZ")} znaků</span></div><div className="editorial-rich-editor" ref={editorRef} contentEditable suppressContentEditableWarning onInput={event => update({ body_md: htmlToMarkdown(event.currentTarget.innerHTML) })} data-placeholder="Text článku…" /></section>
      <aside className="editorial-sidebar"><section className="surface editorial-image-upload"><span>Hlavní obrázek</span>{article.hero_image_url ? <button className="editorial-image-preview" type="button" onClick={() => setImagePreviewOpen(true)} aria-label="Zvětšit náhled obrázku"><img src={article.hero_image_url} alt="" /></button> : <div><ImagePlus size={24} /><small>Zatím bez obrázku</small></div>}<div className="editorial-image-actions"><label>Nahrát obrázek<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => { void uploadHero(event.target.files?.[0]); event.target.value = ""; }} /></label>{article.hero_image_url && <button type="button" className="remove-image" aria-label="Smazat obrázek" title="Smazat obrázek" disabled={removingHero} onClick={() => void deleteHero()}><X size={17} /></button>}</div></section><section className="surface editorial-research-card"><header><h3>Zdroje a fakta</h3><small>{claims.filter(claim => claim.status === "verified").length}/{claims.length} ověřeno · {sources.length} zdrojů</small></header><div className="editorial-research-claims">{claims.map(claim => <div key={claim.id}><i className={claim.status}>{claim.status === "verified" ? <Check size={12} /> : <AlertTriangle size={12} />}</i><span>{claim.claim_text}</span></div>)}{!claims.length && <p>Bez uložené rešerše.</p>}</div>{sources.length > 0 && <div className="editorial-research-sources">{sources.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.title}</a>)}</div>}</section><section className="surface editorial-seo"><h3>SEO</h3><label><span>Slug</span><input value={form.slug ?? ""} onChange={event => update({ slug: event.target.value })} /></label><label><span>SEO title</span><input value={form.seo_title ?? ""} onChange={event => update({ seo_title: event.target.value })} /></label><label><span>Meta description</span><textarea value={form.seo_description ?? ""} onChange={event => update({ seo_description: event.target.value })} /></label></section><button className="editorial-delete" onClick={() => void remove()} disabled={!!action}>Trvale smazat</button></aside></div>
    {imagePreviewOpen && article.hero_image_url && <div className="editorial-image-modal" role="presentation" onClick={() => setImagePreviewOpen(false)}><button type="button" aria-label="Zavřít náhled" onClick={() => setImagePreviewOpen(false)}><X size={20} /></button><img src={article.hero_image_url} alt="Náhled hlavního obrázku" onClick={event => event.stopPropagation()} /></div>}
    <details className="editorial-languages editorial-languages-wide surface"><summary><span><strong>Jazykové verze</strong><small>{article.translations.length}/{locales.length || 24} vytvořených jazyků</small></span><ChevronDown size={17} /></summary><div className="editorial-language-list">{locales.map(code => { const translation = article.translations.find(row => row.locale === code); const needsSync = !translation || divergent.some(item => item.locale === code); return <button className={locale === code ? "active" : ""} key={code} onClick={() => void switchLocale(code)}><span>{localeNames[code] ?? code.toUpperCase()}</span><span className="language-version"><b>{translation ? versionLabel(currentValue(translation), code) : "Nevytvořeno"}</b>{needsSync && <i title={`Není na aktuální verzi V${latestCommonRevision}`}>!</i>}</span></button>; })}</div></details>
  </main>;
}
