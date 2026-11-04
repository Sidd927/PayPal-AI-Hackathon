import { json, route } from "@/lib/http";
import { invoiceDetail } from "@/lib/services/board";

export const dynamic = "force-dynamic";
export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const d = invoiceDetail(id);
  return d ? json(d) : json({ error: "Not found" }, 404);
});
