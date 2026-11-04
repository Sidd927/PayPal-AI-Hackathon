import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { diagnoseAll, diagnoseInvoice } from "@/lib/services/diagnose";

export const maxDuration = 120;
const Body = z.object({ invoiceId: z.string().max(128).optional(), force: z.boolean().optional() });

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  const body = Body.parse(await readJson(req));
  if (body.invoiceId) return json(await diagnoseInvoice(body.invoiceId, { force: body.force ?? true }));
  return json({ results: await diagnoseAll({ force: body.force }) });
});
