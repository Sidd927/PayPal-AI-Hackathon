import { assertSameOrigin, json, route } from "@/lib/http";
import { syncFromPayPal } from "@/lib/services/invoices";

export const POST = route(async (req: Request) => {
  assertSameOrigin(req);
  return json(await syncFromPayPal());
});
