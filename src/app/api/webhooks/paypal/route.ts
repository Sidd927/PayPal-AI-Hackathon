import { json, route } from "@/lib/http";
import { processPayPalWebhook } from "@/lib/services/webhooks";

/** PayPal webhook receiver. Signature is verified with PayPal before anything is processed. */
export const POST = route(async (req: Request) => {
  const raw = await req.text();
  if (raw.length > 256_000) return json({ error: "Too large" }, 413);
  const out = await processPayPalWebhook(req.headers, raw);
  return json(out.body, out.status);
});
