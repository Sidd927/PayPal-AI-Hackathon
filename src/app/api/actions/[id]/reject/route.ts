import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { rejectAction } from "@/lib/services/actions";

const Body = z.object({ reason: z.string().max(500).optional() });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  return json(rejectAction(id, Body.parse(await readJson(req)).reason));
});
