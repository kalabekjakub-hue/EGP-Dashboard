import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadServerConfig } from "../server-config";

const { supabaseUrl, supabaseServiceKey } = loadServerConfig();
if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase konfigurace není dostupná");

async function supabase(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: supabaseServiceKey,
      Authorization: `Bearer ${supabaseServiceKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${(await response.text()).slice(0, 500)}`);
  const text = await response.text();
  return text ? JSON.parse(text) as unknown : null;
}

const dir = join(process.cwd(), "editorial-guides");
const files = readdirSync(dir).filter(name => name.toLowerCase().endsWith(".md"));
const existing = await supabase("blog_editorial_guides?select=id,filename") as Array<{ id: string; filename: string }>;
for (const filename of files) {
  const content = readFileSync(join(dir, filename), "utf8");
  if (content.length > 20_000) throw new Error(`${filename} překračuje 20 000 znaků`);
  const row = existing.find(item => item.filename.toLowerCase() === filename.toLowerCase());
  if (row) {
    await supabase(`blog_editorial_guides?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ content, updated_at: new Date().toISOString() }) });
    console.log(`updated ${filename} (${content.length} chars)`);
  } else {
    await supabase("blog_editorial_guides", { method: "POST", body: JSON.stringify({ filename, content, enabled: true }) });
    console.log(`created ${filename} (${content.length} chars)`);
  }
}
const listed = await supabase("blog_editorial_guides?select=filename,enabled&order=filename.asc") as Array<{ filename: string; enabled: boolean }>;
for (const row of listed) console.log(`${row.enabled ? "on" : "off"}\t${row.filename}`);
