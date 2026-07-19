import { existsSync, readFileSync } from "node:fs";
import { loadEnv } from "vite";

type Environment = Record<string, string | undefined>;
const builtInAdminEmails = ["info@eurogopass.com", "kalabek.jakub@gmail.com", "adamskrivanek007@gmail.com"];

function readEnvFile(path: string): Environment {
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

export function loadServerEnvironment(mode = process.env.NODE_ENV === "development" ? "development" : "production"): Environment {
  const project = loadEnv(mode, process.cwd(), "") as Environment;
  const workerPath = process.env.EGP_WORKER_ENV_PATH ?? project.EGP_WORKER_ENV_PATH ?? "C:/Users/Jakub/eurogopass-fulfillment-worker/.env";
  return { ...project, ...readEnvFile(workerPath), ...process.env };
}

export function loadServerConfig(environment: Environment = loadServerEnvironment()) {
  return {
    supabaseUrl: environment.SUPABASE_URL?.replace(/\/$/, ""),
    supabaseServiceKey: environment.SUPABASE_SERVICE_ROLE_KEY,
    workerMonitorUrl: (environment.EGP_WORKER_MONITOR_URL ?? "http://127.0.0.1:3090").replace(/\/$/, ""),
    workerMonitorToken: environment.EGP_WORKER_MONITOR_TOKEN ?? environment.MONITOR_READ_TOKEN,
    adminEmails: [...new Set([...builtInAdminEmails, ...(environment.EGP_ADMIN_EMAILS ?? "").split(",")].map(value => value.trim().toLowerCase()).filter(Boolean))],
  };
}
