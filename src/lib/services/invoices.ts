import { addDays, daysBetween, todayIso } from "../dates";
import { type InvoiceRow, repo } from "../db";
import { isOpenStatus } from "../domain";
import { fromMinor, toMinor } from "../money";
import type { PPInvoice } from "../paypal/types";
import { getGateway, resolutionUrl } from "../config";
import type { DiagnosisInput } from "../ai/diagnosis";
import type { Policy, PolicyContext } from "../policy";

/** Map a PayPal invoice onto Unstuck's mirrored row. */
export function rowFromPayPal(inv: PPInvoice): Omit<InvoiceRow, "payer_token" | "first_seen_at" | "disputed"> {
  const currency = inv.detail.currency_code;
  const total = inv.amount?.value ? toMinor(inv.amount.value) : 0;
  const paid = inv.payments?.paid_amount ? toMinor(inv.payments.paid_amount.value) : 0;
  const due = isOpenStatus(inv.status) ? (inv.due_amount ? toMinor(inv.due_amount.value) : Math.max(0, total - paid)) : 0;
  const bi = inv.primary_recipients?.[0]?.billing_info;
  const name = bi?.name?.full_name ?? ([bi?.name?.given_name, bi?.name?.surname].filter(Boolean).join(" ") || null);
  const pp = inv.configuration?.partial_payment;
  return {
    id: inv.id,
    number: inv.detail.invoice_number ?? null,
    status: inv.status,
    currency,
    total_minor: total,
    paid_minor: paid,
    due_minor: due,
    invoice_date: inv.detail.invoice_date ?? null,
    due_date: inv.detail.payment_term?.due_date ?? inv.detail.invoice_date ?? null,
    recipient_name: name,
    recipient_business: bi?.business_name ?? null,
    recipient_email: bi?.email_address ?? null,
    reference: inv.detail.reference ?? null,
    partial_allowed: pp?.allow_partial_payment ? 1 : 0,
    min_due_minor: pp?.minimum_amount_due ? toMinor(pp.minimum_amount_due.value) : null,
    recipient_view_url: inv.detail.metadata?.recipient_view_url ?? inv.links?.find((l) => l.rel === "payer-view")?.href ?? null,
    raw_json: JSON.stringify(inv),
    synced_at: new Date().toISOString(),
  };
}

export function storeInvoice(inv: PPInvoice): InvoiceRow {
  return repo.upsertInvoice(rowFromPayPal(inv));
}

export async function syncFromPayPal() {
  const gw = getGateway();
  const { invoices, receipt } = await gw.listInvoices();
  const paidChanged: string[] = [];
  for (const inv of invoices) {
    const before = repo.getInvoice(inv.id);
    const next = rowFromPayPal(inv);
    if (before && next.paid_minor > before.paid_minor) paidChanged.push(inv.id);
    else storeInvoice(inv);
  }
  // Payments seen during sync (e.g. a webhook was missed) go through the same path as webhooks.
  const { handleInvoicePaymentUpdate } = await import("./payments");
  for (const id of paidChanged) await handleInvoicePaymentUpdate(id, "sync");
  if (gw.mode === "live" && process.env.UNSTUCK_DEMO_CONVERSATIONS !== "off") {
    const { restoreDemoConversations } = await import("../demo/scenario");
    restoreDemoConversations(invoices.map((i) => ({ id: i.id, number: i.detail.invoice_number ?? null })));
  }
  repo.logEvent({ kind: "sync", actor: "system", summary: `Synced ${invoices.length} invoices from ${gw.environment === "simulation" ? "the simulation" : "PayPal " + gw.environment}`, data: receipt });
  return { count: invoices.length, receipt };
}

export async function refreshInvoice(id: string): Promise<InvoiceRow> {
  const inv = await getGateway().getInvoice(id);
  return storeInvoice(inv);
}

export function daysOverdue(row: Pick<InvoiceRow, "due_date">, today = todayIso()): number {
  return row.due_date ? daysBetween(row.due_date, today) : 0;
}

export function reminderStats(invoiceId: string, today = todayIso()) {
  const dates = repo
    .listEvents({ invoiceId, limit: 1000 })
    .filter((e) => e.kind === "reminder_sent")
    .map((e) => {
      const data = e.data_json ? (JSON.parse(e.data_json) as { historical?: boolean; days_ago?: number }) : {};
      return data.historical && typeof data.days_ago === "number" ? addDays(today, -data.days_ago) : e.at.slice(0, 10);
    })
    .sort();
  return { sent: dates.length, last: dates.at(-1) ?? null };
}

export function policyContextFor(row: InvoiceRow, today = todayIso()): PolicyContext {
  const r = reminderStats(row.id);
  return {
    invoice: { status: row.status, currency: row.currency, amountDueMinor: row.due_minor, totalMinor: row.total_minor, disputed: !!row.disputed },
    remindersSent: r.sent,
    lastReminderAt: r.last,
    today,
  };
}

export function clientHistory(row: InvoiceRow) {
  if (!row.recipient_email) return { previous_invoices: 0, paid_on_time: 0, paid_late: 0, average_days_late: null, relationship: "new" as const };
  const others = repo.listInvoices().filter((i) => i.id !== row.id && i.recipient_email?.toLowerCase() === row.recipient_email?.toLowerCase());
  let onTime = 0;
  let late = 0;
  const lateDays: number[] = [];
  for (const o of others) {
    if (isOpenStatus(o.status)) continue;
    const raw = JSON.parse(o.raw_json) as PPInvoice;
    const paidOn = raw.payments?.transactions?.map((t) => t.payment_date).filter(Boolean).sort().at(-1)?.slice(0, 10);
    if (!paidOn || !o.due_date) continue;
    const d = daysBetween(o.due_date, paidOn);
    if (d <= 0) onTime++;
    else (late++, lateDays.push(d));
  }
  const n = others.length;
  return {
    previous_invoices: n,
    paid_on_time: onTime,
    paid_late: late,
    average_days_late: lateDays.length ? Math.round(lateDays.reduce((a, b) => a + b, 0) / lateDays.length) : null,
    relationship: n === 0 ? ("new" as const) : n >= 3 ? ("long_term" as const) : ("repeat" as const),
  };
}

export function buildDiagnosisInput(row: InvoiceRow, policy: Policy, today = todayIso()): DiagnosisInput {
  const raw = JSON.parse(row.raw_json) as PPInvoice;
  const r = reminderStats(row.id);
  const plan = repo.activePlan(row.id);
  return {
    today,
    owner: { business: policy.businessName, name: policy.ownerName },
    invoice: {
      number: row.number,
      status: row.status,
      currency: row.currency,
      total: fromMinor(row.total_minor),
      amount_due: fromMinor(row.due_minor),
      amount_paid: fromMinor(row.paid_minor),
      invoice_date: row.invoice_date,
      due_date: row.due_date,
      days_overdue: daysOverdue(row, today),
      reference: row.reference,
      partial_payments_allowed: !!row.partial_allowed,
      items: (raw.items ?? []).map((i) => i.name).slice(0, 10),
      recipient: { name: row.recipient_name, business: row.recipient_business, email: row.recipient_email },
    },
    history: clientHistory(row),
    reminders: { sent: r.sent, last_sent: r.last },
    active_plan: plan ? plan.installments_json : null,
    messages: repo
      .listMessages(row.id)
      .filter((m) => m.author === "client" || m.author === "owner")
      .slice(-12)
      .map((m) => ({ from: m.author as "client" | "owner", date: m.created_at.slice(0, 10), text: m.body.slice(0, 2000) })),
  };
}

export { resolutionUrl };
