import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { isOpenStatus } from "@/lib/domain";
import { allowPayerMessage, payerSendMessage, payerView } from "@/lib/services/payer";

export const maxDuration = 60;
const Body = z.object({ body: z.string().trim().min(1).max(1500) });

export const POST = route(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  assertSameOrigin(req);
  const { token } = await ctx.params;
  const row = repo.getInvoiceByToken(token);
  if (!row) return json({ error: "This link is not valid" }, 404);
  if (!isOpenStatus(row.status)) return json({ error: "This invoice is already settled" }, 409);
  if (!allowPayerMessage(token)) return json({ error: "Too many messages — please wait a few minutes" }, 429);
  const { body } = Body.parse(await readJson(req));
  const result = await payerSendMessage(row, body);
  return json({ result: { offerIds: result.offerIds, escalated: result.escalated, source: result.source }, view: payerView(repo.getInvoice(row.id)!) });
});
