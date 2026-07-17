import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

type OAuthClientFile = {
  installed?: { client_id?: string; client_secret?: string };
  desktop?: { client_id?: string; client_secret?: string };
};

const credentialsPath = resolve(process.argv[2] || "gmail-oauth-client.json");
const redirectUri = "http://127.0.0.1:53682/oauth2/callback";
const state = randomBytes(24).toString("hex");
const scope = "https://www.googleapis.com/auth/gmail.readonly";

function openBrowser(url: string) {
  if (process.platform === "win32") {
    spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  } else if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
  } else {
    spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
  }
}

async function main() {
  const parsed = JSON.parse(await readFile(credentialsPath, "utf8")) as OAuthClientFile;
  const client = parsed.installed ?? parsed.desktop;
  if (!client?.client_id || !client.client_secret) throw new Error("JSON neobsahuje OAuth Desktop client");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    prompt: "consent",
    state,
    login_hint: "info@eurogopass.com",
  }).toString();

  const code = await new Promise<string>((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri);
      if (url.pathname !== "/oauth2/callback") {
        res.writeHead(404).end();
        return;
      }
      if (url.searchParams.get("state") !== state) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end("Neplatný OAuth state.");
        server.close();
        reject(new Error("OAuth state mismatch"));
        return;
      }
      const error = url.searchParams.get("error");
      const value = url.searchParams.get("code");
      if (error || !value) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(`Autorizace selhala: ${error ?? "missing code"}`);
        server.close();
        reject(new Error(error ?? "OAuth code missing"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<h1>EuroGoPass Gmail je autorizovaný</h1><p>Toto okno můžeš zavřít.</p>");
      server.close();
      resolveCode(value);
    });
    server.on("error", reject);
    server.listen(53682, "127.0.0.1", () => {
      console.log("Otevírám zabezpečené přihlášení Google pro info@eurogopass.com…");
      openBrowser(authUrl.toString());
    });
  });

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenResponse.ok) throw new Error(`Google token exchange selhal (${tokenResponse.status})`);
  const tokens = await tokenResponse.json() as { access_token?: string; refresh_token?: string };
  if (!tokens.access_token || !tokens.refresh_token) throw new Error("Google nevrátil refresh token; odeber starý grant a autorizaci zopakuj");

  const profileResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw new Error(`Ověření Gmail profilu selhalo (${profileResponse.status})`);
  const profile = await profileResponse.json() as { emailAddress?: string };
  if (profile.emailAddress?.toLowerCase() !== "info@eurogopass.com") {
    throw new Error(`Byl autorizován jiný účet: ${profile.emailAddress ?? "unknown"}`);
  }

  await mkdir(resolve("secrets"), { recursive: true });
  const content = [
    `GMAIL_CLIENT_ID=${client.client_id}`,
    `GMAIL_CLIENT_SECRET=${client.client_secret}`,
    `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`,
    "GMAIL_USER_ID=me",
    "",
  ].join("\n");
  await writeFile(resolve("secrets", "gmail.env"), content, { encoding: "utf8", mode: 0o600 });
  console.log("Hotovo. Přístup byl ověřen pro info@eurogopass.com a uložen do secrets/gmail.env.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
