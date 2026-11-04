import { assertSameOrigin, json, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { payerAcceptOffer, payerView } from "@/lib/services/payer";

export const POST = route(async (req: Request, ctx: { params: Promise<{ token: string; offerId: string }> }) => {
  assertSameOrigin(req);
  const { token, offerId } = await ctx.params;
  const row = repo.getInvoiceByToken(token);
  if (!row) return json({ error: "This link is not valid" }, 404);
  const out = await payerAcceptOffer(row, offerId);
  return json({ pendingOwner: out.pendingOwner, actionStatus: out.action.status, error: out.action.error, view: payerView(repo.getInvoice(row.id)!) });
});
