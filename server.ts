import connect from "connect";
import { createServer } from "node:http";
import { resolve } from "node:path";
import sirv from "sirv";
import { loadEnv, type ViteDevServer } from "vite";
import { createApiPlugins } from "./vite.config";

const mode = process.env.NODE_ENV === "development" ? "development" : "production";
const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env } as Record<string, string>;
const app = connect();

for (const plugin of createApiPlugins(env)) {
  plugin.configureServer({ middlewares: app } as ViteDevServer);
}

app.use(sirv(resolve("dist"), {
  dev: false,
  etag: true,
  gzip: true,
  brotli: true,
  single: true,
}));

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";
createServer(app).listen(port, host, () => {
  console.log(`EuroGoPass dashboard listening on http://${host}:${port}`);
});
