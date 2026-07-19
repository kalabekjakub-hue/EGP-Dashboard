import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Bold, Check, ChevronDown, FileText, ImagePlus, Italic, Languages, List, LoaderCircle, Save, Send, Sparkles, Trash2, X } from "lucide-react";

type EditorialDraft = {
  title: string; excerpt: string; body_md: string; slug?: string; seo_title?: string; seo_description?: string; hero_image_alt?: string;
  common_revision?: number; local_revision?: number; source_locale?: string; manually_edited?: boolean; updated_at?: string;
};

type EditorialTranslation = EditorialDraft & { id?: string; locale: string; draft?: EditorialDraft | null; editorial_status?: string; last_published_at?: string };
export type EditorialArticle = { id: string; slug: string; status: string; published_at?: string | null; hero_image_url?: string | null; countries: string[]; tags: string[]; source_topic?: string; created_at: string; updated_at: string; translations: EditorialTranslation[] };
type EditorialTopic = { id: string; topic: string; target_characters: number; status: string; source: string; post_id?: string | null; last_error?: string | null; created_at: string };
type EditorialSettings = { enabled: boolean; drafts_per_day: number; max_pending_reviews: number; generation_hour: number; autosave_enabled: boolean };
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

export function EditorialPreview({ onOpen }: { onOpen: () => void }) {
  const [preview, setPreview] = useState<{ topics: number; review: number; automation: boolean } | null>(null);
  useEffect(() => {
    void Promise.all([fetch("/api/editorial/topics"), fetch("/api/editorial/settings")])
      .then(async ([topicsResponse, settingsResponse]) => {
        if (!topicsResponse.ok || !settingsResponse.ok) throw new Error();
        const topicsPayload = await topicsResponse.json() as { topics?: EditorialTopic[] };
        const settingsPayload = await settingsResponse.json() as { settings?: EditorialSettings | null };
        const topics = topicsPayload.topics ?? [];
        setPreview({ topics: topics.length, review: topics.filter(topic => topic.status === "review").length, automation: settingsPayload.settings?.enabled === true });
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
  const [selectedTopic, setSelectedTopic] = useState("");
  const load = async () => {
    try { const [articleResponse, topicResponse, settingsResponse] = await Promise.all([fetch("/api/editorial/articles"), fetch("/api/editorial/topics"), fetch("/api/editorial/settings")]); if (!articleResponse.ok || !topicResponse.ok) throw new Error(); const articlePayload = await articleResponse.json() as { articles: EditorialArticle[] }; const topicPayload = await topicResponse.json() as { topics: EditorialTopic[]; setupRequired?: boolean }; const settingsPayload = settingsResponse.ok ? await settingsResponse.json() as { settings?: EditorialSettings | null } : null; setArticles(articlePayload.articles); setTopics(topicPayload.topics); if (settingsPayload?.settings) setAutomation({ enabled: settingsPayload.settings.enabled, generation_hour: settingsPayload.settings.generation_hour }); setMessage(topicPayload.setupRequired ? "Pro tabuli témat je potřeba aplikovat připravenou Supabase migraci." : ""); setState("ready"); } catch { setState("error"); }
  };
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const addTopics = async (event: FormEvent) => {
    event.preventDefault(); const values = topicInput.split(/\r?\n/).map(value => value.trim()).filter(Boolean); if (!values.length) return;
    setState("saving"); setMessage("");
    try { const response = await fetch("/api/editorial/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topics: values, targetCharacters: characters }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setTopicInput(""); await load(); }
    catch (error) { setState("ready"); setMessage(error instanceof Error ? error.message : "Témata se nepodařilo uložit"); }
  };
  const generate = async (topic: EditorialTopic) => {
    setGenerating(topic.id); setMessage("");
    try { const response = await fetch(`/api/editorial/topics/${topic.id}/generate`, { method: "POST" }); const payload = await response.json() as { post?: { id: string }; error?: string }; if (!response.ok) throw new Error(payload.error); if (payload.post?.id) openArticle(payload.post.id); else await load(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Generování selhalo"); await load(); }
    finally { setGenerating(""); }
  };
  const suggestTopic = async () => { setSuggesting(true); setMessage(""); try { const response = await fetch("/api/editorial/topics/suggest", { method: "POST" }); const payload = await response.json() as { topic?: string; error?: string }; if (!response.ok || !payload.topic) throw new Error(payload.error); setTopicInput(current => current.trim() ? `${current.trim()}\n${payload.topic}` : payload.topic!); } catch (error) { setMessage(error instanceof Error ? error.message : "Návrh tématu selhal"); } finally { setSuggesting(false); } };
  const deleteTopic = async (topic: EditorialTopic) => { setMessage(""); try { const response = await fetch(`/api/editorial/topics/${topic.id}`, { method: "DELETE" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); setSelectedTopic(""); setTopics(current => current.filter(item => item.id !== topic.id)); } catch (error) { setMessage(error instanceof Error ? error.message : "Téma se nepodařilo smazat"); } };
  const nextGeneration = useMemo(() => { const date = new Date(); date.setHours(automation.generation_hour, 0, 0, 0); if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1); return date.toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }); }, [automation.generation_hour]);
  return <main className="page-shell editorial-page"><button className="back-button" onClick={back}>← Zpět</button>
    <form className="editorial-topic-bar surface" onSubmit={event => void addTopics(event)}><textarea value={topicInput} onChange={event => setTopicInput(event.target.value)} placeholder="Napiš téma článku. Více témat můžeš vložit každé na nový řádek…" /><label className="editorial-length"><input aria-label="Počet znaků" title="Počet znaků" type="number" min={500} max={12000} step={100} value={characters} onChange={event => setCharacters(Number(event.target.value))} /></label><button type="button" className="suggest" aria-label="Navrhnout téma pomocí AI" title="Navrhnout téma pomocí AI" disabled={suggesting} onClick={() => void suggestTopic()}><Sparkles className={suggesting ? "spin" : undefined} size={19} /></button><button disabled={state === "saving" || !topicInput.trim()}>Přidat</button></form>
    {message && <div className="editorial-message"><AlertTriangle size={17} />{message}</div>}
    {state === "loading" ? <div className="editorial-empty surface">Načítám redakci…</div> : state === "error" ? <div className="editorial-empty surface error">Redakci se nepodařilo načíst.</div> : <section className="editorial-overview"><section className="editorial-overview-panel surface"><header><h2>Tabule témat</h2><b>{topics.length}</b></header><div className="editorial-topic-list">{topics.map(topic => <article className={selectedTopic === topic.id ? "selected" : ""} key={topic.id} onClick={() => setSelectedTopic(current => current === topic.id ? "" : topic.id)}><h3>{topic.topic}</h3>{selectedTopic === topic.id ? <button className="delete-topic" aria-label="Smazat téma" title="Smazat téma" onClick={event => { event.stopPropagation(); void deleteTopic(topic); }}><X size={18} /></button> : <div className="topic-actions">{topic.status === "review" ? <button aria-label="Otevřít článek" title="Otevřít článek" onClick={event => { event.stopPropagation(); if (topic.post_id) openArticle(topic.post_id); }}><FileText size={18} /></button> : <button className={automation.enabled ? "automatic" : ""} aria-label="Vygenerovat pomocí AI" title="Vygenerovat pomocí AI" disabled={generating === topic.id} onClick={event => { event.stopPropagation(); void generate(topic); }}>{generating === topic.id ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}</button>}{automation.enabled && topic.status !== "review" && <time>{nextGeneration}</time>}</div>}</article>)}{!topics.length && <div className="editorial-empty">Zatím tu nejsou žádná témata.</div>}</div></section><section className="editorial-overview-panel surface"><header><h2>Články</h2><b>{articles.length}</b></header><div className="editorial-overview-articles">{articles.map(article => { const cs = article.translations.find(row => row.locale === "cs") ?? article.translations[0]; const value = cs ? currentValue(cs) : null; return <button className="editorial-article-card" key={article.id} onClick={() => openArticle(article.id)}>{article.hero_image_url ? <img src={article.hero_image_url} alt="" /> : <span className="editorial-card-placeholder"><FileText size={25} /></span>}<div><span className={`editorial-status ${article.status}`}>{statusLabel(article.status)}</span><h2>{value?.title || article.source_topic || article.slug}</h2><p>{value?.excerpt || "Článek zatím nemá český perex."}</p><footer><span>{article.translations.length}/24 jazyků</span><b>{value ? versionLabel(value, cs?.locale ?? "cs") : "V1"}</b></footer></div></button>; })}{!articles.length && <div className="editorial-empty">Zatím tu nejsou žádné články.</div>}</div></section></section>}
  </main>;
}

export function EditorialSettingsModal({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<EditorialSettings>({ enabled: false, drafts_per_day: 2, max_pending_reviews: 10, generation_hour: 7, autosave_enabled: true });
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading");
  const [message, setMessage] = useState("");
  useEffect(() => {
    void fetch("/api/editorial/settings")
      .then(response => response.ok ? response.json() as Promise<{ settings?: EditorialSettings | null }> : Promise.reject())
      .then(payload => { if (payload.settings) setSettings(payload.settings); setState("ready"); })
      .catch(() => { setState("error"); setMessage("Nastavení Redakce se nepodařilo načíst."); });
  }, []);
  const save = async () => {
    setState("saving"); setMessage("");
    try {
      const response = await fetch("/api/editorial/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const payload = await response.json() as { settings?: EditorialSettings; error?: string };
      if (!response.ok) throw new Error(payload.error);
      if (payload.settings) setSettings(payload.settings);
      setState("saved"); setMessage("");
      window.setTimeout(() => setState(current => current === "saved" ? "ready" : current), 1800);
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Nastavení se nepodařilo uložit."); }
  };
  return <div className="editorial-settings-modal" role="presentation" onMouseDown={onClose}><section className="editorial-settings-dialog surface" role="dialog" aria-modal="true" aria-labelledby="editorial-settings-title" onMouseDown={event => event.stopPropagation()}><button className="editorial-settings-close" onClick={onClose} aria-label="Zavřít nastavení">×</button><h2 id="editorial-settings-title">Automatizace článků</h2><p>Nastavení automatické tvorby a ukládání článků.</p><section className="editorial-settings"><label><span>Konceptů denně</span><input type="number" min={0} max={50} value={settings.drafts_per_day || ""} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, drafts_per_day: Number(event.target.value) }))} /></label><label><span>Strop čekajících konceptů</span><input type="number" min={0} max={500} value={settings.max_pending_reviews || ""} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, max_pending_reviews: Number(event.target.value) }))} /></label><label><span>Hodina spuštění</span><select value={settings.generation_hour} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, generation_hour: Number(event.target.value) }))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour}:00</option>)}</select></label><div className="editorial-settings-switches"><label><span>Automatické generování</span><input type="checkbox" checked={settings.enabled} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, enabled: event.target.checked }))} /></label><label><span>Automatické ukládání</span><input type="checkbox" checked={settings.autosave_enabled} disabled={state === "loading" || state === "saving"} onChange={event => setSettings(current => ({ ...current, autosave_enabled: event.target.checked }))} /></label></div><button className={state === "saved" ? "saved" : ""} onClick={() => void save()} disabled={state === "loading" || state === "saving"}>{state === "saving" ? "Ukládám…" : state === "saved" ? "Uloženo" : "Uložit"}</button></section>{message && state === "error" && <div className="editorial-message error"><AlertTriangle size={17} />{message}</div>}</section></div>;
}

export function EditorialArticleEditor({ articleId, back }: { articleId: string; back: () => void }) {
  const [article, setArticle] = useState<EditorialArticle | null>(null); const [locales, setLocales] = useState<string[]>([]); const [locale, setLocale] = useState("cs"); const [form, setForm] = useState<EditorialDraft>({ title: "", excerpt: "", body_md: "" }); const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [state, setState] = useState<"loading" | "ready" | "saving" | "saved" | "error">("loading"); const [action, setAction] = useState<"" | "translate" | "publish" | "delete">(""); const [message, setMessage] = useState(""); const [sources, setSources] = useState<EditorialSource[]>([]); const [claims, setClaims] = useState<EditorialClaim[]>([]); const editorRef = useRef<HTMLDivElement>(null); const autosaveRef = useRef<number | null>(null);
  const load = async (preferredLocale = locale) => { const response = await fetch("/api/editorial/articles"); if (!response.ok) throw new Error(); const payload = await response.json() as { articles: EditorialArticle[]; locales: string[] }; const found = payload.articles.find(candidate => candidate.id === articleId); if (!found) throw new Error(); setArticle(found); setLocales(payload.locales); const row = found.translations.find(candidate => candidate.locale === preferredLocale) ?? found.translations.find(candidate => candidate.locale === "cs") ?? found.translations[0]; if (row) { setLocale(row.locale); const value = currentValue(row); setForm(value); if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(value.body_md); } setState("ready"); };
  // Reload when the route selects another article; load intentionally captures the current locale.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const timer = window.setTimeout(() => void load().catch(() => setState("error")), 0); return () => window.clearTimeout(timer); }, [articleId]);
  useEffect(() => { void fetch("/api/editorial/settings").then(response => response.ok ? response.json() as Promise<{ settings?: EditorialSettings | null }> : Promise.reject()).then(payload => setAutosaveEnabled(payload.settings?.autosave_enabled !== false)).catch(() => undefined); }, []);
  useEffect(() => { void fetch(`/api/editorial/articles/${articleId}/research`).then(response => response.ok ? response.json() as Promise<{ sources?: EditorialSource[]; claims?: EditorialClaim[] }> : Promise.reject()).then(payload => { setSources(payload.sources ?? []); setClaims(payload.claims ?? []); }).catch(() => undefined); }, [articleId]);
  // The editor DOM is replaced only when switching language; form changes originate from this DOM.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (editorRef.current && state !== "saving") editorRef.current.innerHTML = markdownToHtml(form.body_md); }, [locale]);
  const row = article?.translations.find(candidate => candidate.locale === locale); const value = row ? currentValue(row) : null;
  const update = (next: Partial<EditorialDraft>) => { setForm(current => ({ ...current, ...next })); if (autosaveRef.current) window.clearTimeout(autosaveRef.current); if (autosaveEnabled) { setState("saving"); autosaveRef.current = window.setTimeout(() => void save("autosave"), 1200); } else setState("ready"); };
  const save = async (mode: "autosave" | "version") => {
    if (autosaveRef.current) window.clearTimeout(autosaveRef.current); setState("saving");
    try { const bodyMd = editorRef.current ? htmlToMarkdown(editorRef.current.innerHTML) : form.body_md; const response = await fetch(`/api/editorial/articles/${articleId}/locales/${locale}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, body_md: bodyMd, saveMode: mode }) }); const payload = await response.json() as { draft?: EditorialDraft; error?: string }; if (!response.ok) throw new Error(payload.error); if (payload.draft) setForm(payload.draft); setState("saved"); setMessage(mode === "version" ? "Verze byla uložena." : ""); await load(locale); }
    catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Uložení selhalo"); }
  };
  const switchLocale = async (next: string) => { if (state === "saving") await save("autosave"); const target = article?.translations.find(candidate => candidate.locale === next); setLocale(next); const nextValue = target ? currentValue(target) : { title: "", excerpt: "", body_md: "", common_revision: value?.common_revision ?? 1, local_revision: 0, source_locale: "cs" }; setForm(nextValue); window.setTimeout(() => { if (editorRef.current) editorRef.current.innerHTML = markdownToHtml(nextValue.body_md); }, 0); };
  const translate = async () => { setAction("translate"); setMessage("Překládám do ostatních jazyků. Může to chvíli trvat…"); try { await save("version"); const response = await fetch(`/api/editorial/articles/${articleId}/translate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceLocale: locale }) }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(locale); setMessage("Jazykové verze jsou připravené jako koncepty."); } catch (error) { setMessage(error instanceof Error ? error.message : "Překlad selhal"); } finally { setAction(""); } };
  const publish = async () => { setAction("publish"); setMessage(""); try { await save("version"); const response = await fetch(`/api/editorial/articles/${articleId}/publish`, { method: "POST" }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(locale); setMessage("Změny byly publikovány."); } catch (error) { setMessage(error instanceof Error ? error.message : "Publikace selhala"); } finally { setAction(""); } };
  const uploadHero = async (file?: File) => { if (!file) return; setMessage("Nahrávám hlavní obrázek…"); try { const response = await fetch(`/api/editorial/articles/${articleId}/hero?filename=${encodeURIComponent(file.name)}`, { method: "PUT", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file }); const payload = await response.json() as { error?: string }; if (!response.ok) throw new Error(payload.error); await load(locale); setMessage("Hlavní obrázek byl nahrán."); } catch (error) { setMessage(error instanceof Error ? error.message : "Nahrání obrázku selhalo"); } };
  const remove = async () => { if (!article || !window.confirm(`Trvale smazat článek „${form.title || article.slug}“ a všechny jeho jazykové verze? Tuto akci nelze vrátit.`)) return; setAction("delete"); const response = await fetch(`/api/editorial/articles/${articleId}`, { method: "DELETE" }); if (response.ok) back(); else { const payload = await response.json() as { error?: string }; setMessage(payload.error ?? "Smazání selhalo"); setAction(""); } };
  const command = (name: string, value?: string) => { editorRef.current?.focus(); document.execCommand(name, false, value); update({ body_md: editorRef.current ? htmlToMarkdown(editorRef.current.innerHTML) : form.body_md }); };
  const divergent = useMemo(() => { if (!article?.translations.length) return []; const versions = article.translations.map(item => ({ locale: item.locale, value: currentValue(item) })); const maxCommon = Math.max(...versions.map(item => item.value.common_revision ?? 1)); return versions.filter(item => (item.value.common_revision ?? 1) !== maxCommon || (item.value.local_revision ?? 0) > 0); }, [article]);
  if (state === "loading") return <main className="page-shell editorial-page"><div className="editorial-empty surface">Načítám článek…</div></main>;
  if (!article || state === "error" && !form.title) return <main className="page-shell editorial-page"><button className="back-button" onClick={back}>← Zpět</button><div className="editorial-empty surface error">Článek se nepodařilo načíst.</div></main>;
  return <main className="page-shell editorial-page editorial-editor-page"><div className="editorial-editor-top"><button className="back-button" onClick={back}>← Zpět</button><div className="editorial-save-state"><span className={state}>{state === "saving" ? "Ukládám…" : state === "saved" ? "Uloženo" : state === "error" ? "Chyba ukládání" : autosaveEnabled ? "Automatické ukládání" : "Automatické ukládání vypnuto"}</span><b>{versionLabel(form, locale)}</b></div></div>
    <section className="editorial-editor-head"><div><span className={`editorial-status ${article.status}`}>{statusLabel(article.status)}</span><h1>{form.title || "Nový článek"}</h1><p>{article.source_topic}</p></div><div className="editorial-actions"><button onClick={() => void save("version")} disabled={state === "saving"}><Save size={17} /> Uložit verzi</button><button onClick={() => void translate()} disabled={!!action || !form.body_md}><Languages size={17} />{action === "translate" ? "Překládám…" : article.translations.length > 1 ? "Aktualizovat jazyky" : "Vygenerovat jazyky"}</button><button className="primary" onClick={() => void publish()} disabled={!!action || !form.body_md}><Send size={17} />{action === "publish" ? "Publikuji…" : article.status === "published" ? "Publikovat změny" : "Publikovat"}</button></div></section>
    {divergent.length > 0 && article.translations.length > 1 && <div className="editorial-version-warning"><AlertTriangle size={18} /><span><strong>Jazykové verze nejsou úplně sjednocené.</strong><small>{divergent.map(item => `${item.locale.toUpperCase()} ${versionLabel(item.value, item.locale)}`).join(" · ")}</small></span><button onClick={() => void translate()}>Sjednotit podle {locale.toUpperCase()}</button></div>}
    {message && <div className="editorial-message"><Check size={17} />{message}</div>}
    <div className="editorial-editor-layout"><section className="editorial-document surface"><div className="editorial-fields"><label><span>Titulek</span><input value={form.title} onChange={event => update({ title: event.target.value })} /></label><label><span>Perex</span><textarea value={form.excerpt} onChange={event => update({ excerpt: event.target.value })} /></label></div><div className="editorial-toolbar"><button title="Tučně" onClick={() => command("bold")}><Bold size={16} /></button><button title="Kurzíva" onClick={() => command("italic")}><Italic size={16} /></button><button title="Nadpis" onClick={() => command("formatBlock", "h2")}>H2</button><button title="Odrážky" onClick={() => command("insertUnorderedList")}><List size={16} /></button><span>{form.body_md.length.toLocaleString("cs-CZ")} znaků</span></div><div className="editorial-rich-editor" ref={editorRef} contentEditable suppressContentEditableWarning onInput={event => update({ body_md: htmlToMarkdown(event.currentTarget.innerHTML) })} data-placeholder="Text článku…" /></section>
      <aside className="editorial-sidebar"><section className="surface"><label className="editorial-language-select"><span>Jazyková verze</span><div><select value={locale} onChange={event => void switchLocale(event.target.value)}>{locales.map(code => <option value={code} key={code}>{localeNames[code] ?? code.toUpperCase()} · {article.translations.some(row => row.locale === code) ? versionLabel(currentValue(article.translations.find(row => row.locale === code)!), code) : "nevytvořeno"}</option>)}</select><ChevronDown size={16} /></div></label><div className="editorial-language-progress"><span><b>{article.translations.length}</b> / {locales.length || 24}</span><small>vytvořených jazyků</small></div></section><section className="surface editorial-image-upload"><span>Hlavní obrázek</span>{article.hero_image_url ? <img src={article.hero_image_url} alt="" /> : <div><ImagePlus size={24} /><small>Zatím bez obrázku</small></div>}<label><ImagePlus size={16} /> Nahrát obrázek<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={event => { void uploadHero(event.target.files?.[0]); event.target.value = ""; }} /></label></section><section className="surface editorial-seo"><h3>SEO</h3><label><span>Slug</span><input value={form.slug ?? ""} onChange={event => update({ slug: event.target.value })} /></label><label><span>SEO title</span><input value={form.seo_title ?? ""} onChange={event => update({ seo_title: event.target.value })} /></label><label><span>Meta description</span><textarea value={form.seo_description ?? ""} onChange={event => update({ seo_description: event.target.value })} /></label></section><button className="editorial-delete" onClick={() => void remove()} disabled={!!action}><Trash2 size={16} /> Trvale smazat článek</button></aside></div>
    <details className="editorial-research surface"><summary><span><strong>Zdroje a fakta</strong><small>{claims.filter(claim => claim.status === "verified").length}/{claims.length} ověřených tvrzení · {sources.length} zdrojů</small></span><ChevronDown size={17} /></summary><div className="editorial-research-body"><section>{claims.map(claim => { const linked = sources.filter(source => claim.blog_claim_sources?.some(link => link.source_id === source.id)); return <article key={claim.id}><i className={claim.status}>{claim.status === "verified" ? <Check size={13} /> : <AlertTriangle size={13} />}</i><div><strong>{claim.claim_text}</strong>{linked.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.title}<small>{source.trust_level} · {new Date(source.fetched_at).toLocaleDateString("cs-CZ")}</small></a>)}{!linked.length && <small>Bez přiřazeného zdroje</small>}</div></article>; })}{!claims.length && <p>Pro tento článek zatím není uložená rešerše.</p>}</section><aside><h3>Všechny zdroje</h3>{sources.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.id}><strong>{source.title}</strong><small>{source.url}</small></a>)}</aside></div></details>
  </main>;
}
