import { assertSameOrigin, json, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { getGateway, readConfig } from "@/lib/config";
import { seedScenario } from "@/lib/demo/scenario";
import { refreshInvoice, syncFromPayPal } from "@/lib/services/invoices";

export const maxDuration = 120;

/**
 * Simulation: wipe and re-seed the demo scenario.
 * Sandbox: wipe Unstuck's local state and re-sync from PayPal (use `npm run seed:sandbox` to create sandbox invoices).
 */
export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  if (!readConfig().allowDemoReset) return json({ error: "Demo reset is disabled" }, 403);
  const gw = getGateway();
  const policy = repo.getPolicy();
  repo.resetAll();
  repo.setPolicy(policy);
  if (gw.mode === "simulated") {
    await seedScenario(gw, { refresh: refreshInvoice });
    repo.logEvent({ kind: "demo_reset", actor: "owner", summary: "Demo scenario re-seeded (simulation)" });
    return json({ ok: true, mode: "simulation" });
  }
  const r = await syncFromPayPal();
  repo.logEvent({ kind: "demo_reset", actor: "owner", summary: "Local state cleared and re-synced from the PayPal sandbox" });
  return json({ ok: true, mode: "sandbox", synced: r.count });
});
