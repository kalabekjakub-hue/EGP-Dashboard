export type DataMode = "demo" | "live";

const requestedMode = import.meta.env.VITE_DATA_MODE === "live" ? "live" : "demo";
const supabaseReady = Boolean(
  import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export const runtimeConfig = {
  dataMode: requestedMode === "live" && supabaseReady ? "live" : "demo" as DataMode,
  connectors: {
    supabase: supabaseReady,
    posthog: Boolean(import.meta.env.VITE_POSTHOG_KEY),
  },
};

