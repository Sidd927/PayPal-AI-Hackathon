import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { approveAction } from "@/lib/services/actions";

const Body = z.object({ params: z.unknown().optional() });

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  const body = Body.parse(await readJson(req));
  return json(await approveAction(id, body.params !== undefined ? { params: body.params } : undefined));
});
