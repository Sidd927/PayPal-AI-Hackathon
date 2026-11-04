import { todayIso } from "../dates";
import { type InvoiceRow, repo } from "../db";
import { type Installment, isOpenStatus } from "../domain";
import { getGateway, readConfig } from "../config";
import { payerTurn } from "../ai/payer-agent";
import type { SimulatedGateway } from "../paypal/simulated";
import { proposeAction, viewAction } from "./actions";
import { approveActionInternal } from "./internal";
import { policyContextFor } from "./invoices";
import { handleInvoicePaymentUpdate, planProgress } from "./payments";

const MAX_MESSAGE = 1500;
const rate = new Map<string, number[]>();

/** 12 messages per 10 minutes per invoice link. */
export function allowPayerMessage(token: string, now = Date.now()) {
  const win = (rate.get(token) ?? []).filter((t) => now - t < 10 * 60_000);
  if (win.length >= 12) return false;
  win.push(now);
  rate.set(token, win);
  return true;
}

export function payerView(row: InvoiceRow) {
  const policy = repo.getPolicy();
  const plan = repo.latestPlan(row.id);
  const progress = plan ? planProgress(plan, row.paid_minor) : null;
  const offers = repo.listOffers(row.id).filter((o) => o.status !== "superseded").map((o) => ({ id: o.id, status: o.status, installments: JSON.parse(o.installments_json) as Installment[], created_at: o.created_at }));
  const gw = getGateway();
  return {
    business: policy.businessName,
    owner: policy.ownerName.split(" ")[0],
    invoice: {
      number: row.number,
      status: row.status,
      open: isOpenStatus(row.status),
      currency: row.currency,
      total_minor: row.total_minor,
      paid_minor: row.paid_minor,
      due_minor: row.due_minor,
      due_date: row.due_date,
      recipient_name: row.recipient_name ?? row.recipient_business,
      partial_allowed: !!row.partial_allowed,
      min_due_minor: row.min_due_minor,
      items: (JSON.parse(row.raw_json).items ?? []).map((i: { name: string; quantity?: string; unit_amount?: { value: string } }) => ({ name: i.name, quantity: i.quantity, unit: i.unit_amount?.value })),
    },
    payUrl: gw.mode === "live" ? row.recipient_view_url : null,
    simulation: gw.mode === "simulated",
    ai: readConfig().ai.configured,
    plan: plan && progress ? { status: plan.status, rows: progress.rows, next: progress.next } : null,
    offers,
    messages: repo
      .listMessages(row.id)
      .filter((m) => m.channel === "resolution_page" && (m.author === "client" || m.author === "agent"))
      .map((m) => ({ id: m.id, author: m.author, body: m.body, created_at: m.created_at })),
  };
}

export async function payerSendMessage(row: InvoiceRow, text: string) {
  const body = text.trim().slice(0, MAX_MESSAGE);
  if (!body) throw new Error("Message is empty");
  repo.addMessage({ invoice_id: row.id, author: "client", channel: "resolution_page", body });
  repo.logEvent({ invoice_id: row.id, kind: "client_message", actor: "client", summary: `Client wrote on the resolution page: “${body.slice(0, 120)}${body.length > 120 ? "…" : ""}”` });
  const result = await payerTurn(row, repo.getPolicy(), policyContextFor(row, todayIso()));
  if (result.reply) repo.addMessage({ invoice_id: row.id, author: "agent", channel: "resolution_page", body: result.reply });
  return result;
}

export async function payerAcceptOffer(row: InvoiceRow, offerId: string) {
  const offer = repo.getOffer(offerId);
  if (!offer || offer.invoice_id !== row.id) throw Object.assign(new Error("Offer not found"), { status: 404 });
  if (offer.status !== "open") throw Object.assign(new Error(`This offer is ${offer.status.replace("_", " ")}`), { status: 409 });
  const installments = JSON.parse(offer.installments_json) as Installment[];
  // Any older open offers are superseded by this choice.
  for (const o of repo.listOffers(row.id)) if (o.id !== offerId && o.status === "open") repo.setOfferStatus(o.id, "superseded");
  repo.logEvent({ invoice_id: row.id, kind: "offer_accepted", actor: "client", summary: `Client accepted a ${installments.length}-part payment plan` });
  const action = await proposeAction(row.id, { type: "offer_payment_plan", origin: "payer", rationale: "Client chose this plan on the resolution page.", params: { installments } }, { executeIfAuto: false });
  repo.setOfferStatus(offerId, action.decision === "auto" ? "accepted" : "pending_owner", action.id);
  if (action.status === "blocked") throw Object.assign(new Error(`This plan can't be applied: ${action.reasons.join("; ")}`), { status: 409 });
  if (action.decision === "auto") await approveActionInternal(action.id);
  const after = repo.getAction(action.id)!;
  return { action: viewAction(after), pendingOwner: action.decision !== "auto" };
}

/** Simulation only: stand in for the payer paying on PayPal's invoice page. */
export async function simulatePayment(row: InvoiceRow, amountMinor: number) {
  const gw = getGateway();
  // Check by mode, not instanceof: Next.js may load the gateway class in more than one bundle.
  if (gw.mode !== "simulated") throw Object.assign(new Error("Simulated payments are only available in simulation mode"), { status: 409 });
  (gw as SimulatedGateway).simulatePayerPayment(row.id, amountMinor);
  return handleInvoicePaymentUpdate(row.id, "simulation");
}
