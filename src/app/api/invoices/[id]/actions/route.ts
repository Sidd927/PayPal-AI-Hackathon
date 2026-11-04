import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { ACTION_TYPES, parseActionParams, type ProposedAction } from "@/lib/domain";
import { proposeAction } from "@/lib/services/actions";

const Body = z.object({ type: z.enum(ACTION_TYPES), params: z.unknown(), rationale: z.string().max(500).optional() });

/** Owner-initiated action (still validated and policy-checked; owner origin relaxes approval). */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!repo.getInvoice(id)) return json({ error: "Not found" }, 404);
  const body = Body.parse(await readJson(req));
  const params = parseActionParams(body.type, body.params);
  const action = await proposeAction(id, { type: body.type, params, origin: "owner", rationale: body.rationale ?? "Owner action" } as ProposedAction);
  return json(action, action.status === "blocked" ? 422 : 200);
});
