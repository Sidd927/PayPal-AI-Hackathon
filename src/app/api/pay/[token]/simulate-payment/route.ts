import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { repo } from "@/lib/db";
import { toMinor } from "@/lib/money";
import { payerView, simulatePayment } from "@/lib/services/payer";

const Body = z.object({ amount: z.string().regex(/^\d{1,9}(\.\d{1,2})?$/) });

/** Simulation mode only — stands in for paying on PayPal's hosted invoice page. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ token: string }> }) => {
  assertSameOrigin(req);
  const { token } = await ctx.params;
  const row = repo.getInvoiceByToken(token);
  if (!row) return json({ error: "This link is not valid" }, 404);
  await simulatePayment(row, toMinor(Body.parse(await readJson(req)).amount));
  return json({ view: payerView(repo.getInvoice(row.id)!) });
});
