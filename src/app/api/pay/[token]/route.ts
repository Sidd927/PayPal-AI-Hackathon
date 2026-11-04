import { json, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { payerView } from "@/lib/services/payer";

export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: { params: Promise<{ token: string }> }) => {
  const { token } = await ctx.params;
  const row = repo.getInvoiceByToken(token);
  return row ? json(payerView(row)) : json({ error: "This link is not valid" }, 404);
});
