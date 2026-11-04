import { z } from "zod";
import { assertSameOrigin, json, readJson, route } from "@/lib/http";
import { repo } from "@/lib/db";

const Body = z.object({ author: z.enum(["client", "owner"]), body: z.string().trim().min(1).max(4000) });

/** Owner adds a client email (pasted/forwarded) or an internal note to an invoice's conversation. */
export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  assertSameOrigin(req);
  const { id } = await ctx.params;
  if (!repo.getInvoice(id)) return json({ error: "Not found" }, 404);
  const body = Body.parse(await readJson(req));
  const mid = repo.addMessage({ invoice_id: id, author: body.author, channel: body.author === "client" ? "email" : "note", body: body.body });
  repo.logEvent({ invoice_id: id, kind: body.author === "client" ? "client_message" : "owner_note", actor: "owner", summary: body.author === "client" ? "You added a client email" : "You added a note" });
  return json({ id: mid });
});
