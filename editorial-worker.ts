import "dotenv/config";
import { runEditorialAutomationCycle } from "./editorial-api";

const intervalMs = Math.max(60_000, Number(process.env.EDITORIAL_POLL_INTERVAL_MS ?? 300_000));
let cycleRunning = false;

async function cycle() {
  if (cycleRunning) return;
  cycleRunning = true;
  try {
    const result = await runEditorialAutomationCycle();
    console.log(JSON.stringify({ ts: new Date().toISOString(), worker: "editorial", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ ts: new Date().toISOString(), worker: "editorial", error: error instanceof Error ? error.message : String(error) }));
  } finally {
    cycleRunning = false;
  }
}

await cycle();
setInterval(() => void cycle(), intervalMs);
