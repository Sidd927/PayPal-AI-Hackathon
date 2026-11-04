import { z } from "zod";

/** PayPal `Money` object. */
export const PPMoney = z.object({ currency_code: z.string(), value: z.string() });
export type PPMoney = z.infer<typeof PPMoney>;

const Name = z.object({ given_name: z.string(), surname: z.string(), full_name: z.string() }).partial().passthrough();

export const PPRecipient = z
  .object({
    billing_info: z
      .object({ name: Name.optional(), business_name: z.string().optional(), email_address: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

/**
 * The subset of the PayPal Invoicing v2 invoice object Unstuck reads.
 * `.passthrough()` keeps every other field so a GET → modify → PUT round-trip never drops data.
 */
export const PPInvoice = z
  .object({
    id: z.string(),
    status: z.string(),
    detail: z
      .object({
        invoice_number: z.string().optional(),
        reference: z.string().optional(),
        currency_code: z.string(),
        note: z.string().optional(),
        memo: z.string().optional(),
        invoice_date: z.string().optional(),
        payment_term: z.object({ term_type: z.string().optional(), due_date: z.string().optional() }).passthrough().optional(),
        metadata: z
          .object({ recipient_view_url: z.string().optional(), invoicer_view_url: z.string().optional(), create_time: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough(),
    invoicer: z.object({ business_name: z.string().optional(), email_address: z.string().optional() }).passthrough().optional(),
    primary_recipients: z.array(PPRecipient).optional(),
    additional_recipients: z.array(z.object({ email_address: z.string() }).passthrough()).optional(),
    items: z.array(z.object({ name: z.string() }).passthrough()).optional(),
    configuration: z
      .object({
        partial_payment: z.object({ allow_partial_payment: z.boolean().optional(), minimum_amount_due: PPMoney.optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    amount: z.object({ currency_code: z.string().optional(), value: z.string().optional() }).passthrough().optional(),
    due_amount: PPMoney.optional(),
    payments: z
      .object({
        paid_amount: PPMoney.optional(),
        transactions: z
          .array(z.object({ payment_id: z.string().optional(), amount: PPMoney.optional(), payment_date: z.string().optional(), method: z.string().optional(), type: z.string().optional() }).passthrough())
          .optional(),
      })
      .passthrough()
      .optional(),
    links: z.array(z.object({ href: z.string(), rel: z.string() }).passthrough()).optional(),
  })
  .passthrough();
export type PPInvoice = z.infer<typeof PPInvoice>;

export const PPInvoiceList = z
  .object({ items: z.array(PPInvoice).optional(), total_items: z.number().optional(), total_pages: z.number().optional() })
  .passthrough();

/** Webhook event envelope. */
export const PPWebhookEvent = z
  .object({
    id: z.string(),
    event_type: z.string(),
    resource_type: z.string().optional(),
    create_time: z.string().optional(),
    resource: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
export type PPWebhookEvent = z.infer<typeof PPWebhookEvent>;

export type ReminderInput = { subject: string; note: string; additional_recipients?: string[] };
export type ConditionalRuleInput = {
  conditional_rule_type: "EARLY_PAYMENT_DISCOUNT";
  conditional_rule_value_type: "PERCENT";
  conditional_rule_value: string;
  rule_expiry_terms: { rule_expiry_condition: "SPECIFIC_DATE"; condition_rule_end_date: string };
};
export type RecordPaymentInput = { method: "CHECK" | "BANK_TRANSFER" | "CASH" | "OTHER"; payment_date: string; amount: PPMoney; note?: string };

/** Inputs for creating a demo invoice (seeding only). */
export type CreateInvoiceInput = {
  invoice_number?: string;
  reference?: string;
  currency_code: string;
  note?: string;
  invoice_date: string;
  due_date: string;
  invoicer: { business_name: string; email_address?: string };
  recipient: { business_name?: string; given_name?: string; surname?: string; email_address: string };
  items: { name: string; description?: string; quantity: string; unit_amount: PPMoney }[];
};
