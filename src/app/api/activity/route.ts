import { json, route } from "@/lib/http";
import { repo } from "@/lib/db";

export const dynamic = "force-dynamic";
export const GET = route(async () => {
  const invoices = new Map(repo.listInvoices().map((i) => [i.id, i]));
  return json(
    repo.listEvents({ limit: 500 }).map((e) => ({
      ...e,
      data: e.data_json ? JSON.parse(e.data_json) : null,
      data_json: undefined,
      invoice_number: e.invoice_id ? invoices.get(e.invoice_id)?.number ?? null : null,
      client: e.invoice_id ? invoices.get(e.invoice_id)?.recipient_business ?? null : null,
    })),
  );
});
