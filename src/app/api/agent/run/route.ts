import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { runAgent, runView } from "@/lib/services/agent";

export const maxDuration = 300;
const Body = z.object({ force: z.boolean().optional() });

/**
 * Start an agent run. Owner (same-origin) or a scheduler presenting `Authorization: Bearer $AGENT_RUN_TOKEN`
 * (e.g. a Render cron job). The response returns when the run finishes; poll /api/agent/runs/latest for live steps.
 */
export const POST = route(async (req: Request) => {
  const token = process.env.AGENT_RUN_TOKEN;
  const scheduled = !!token && req.headers.get("authorization") === `Bearer ${token}`;
  if (!scheduled) assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  const r = await runAgent(scheduled ? "schedule" : "manual", { force: body.force });
  return json({ ...r, run: runView(r.runId) }, r.alreadyRunning ? 409 : 200);
});
