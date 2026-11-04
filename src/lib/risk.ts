/**
 * Transparent payment-risk heuristic.
 *
 * NOT a trained model: there is no historical outcome data to train on. Every point is attributable to a
 * named factor and shown in the UI, so the owner can see exactly why an invoice is ranked where it is.
 * Weights were chosen by hand from the reasons literature in research/USER_PROBLEM_DISCOVERY.md.
 */
import type { StuckReason } from "./domain";

export type RiskInput = {
  open: boolean;
  daysOverdue: number;
  dueMinor: number;
  reason: StuckReason | null;
  remindersSent: number;
  hasClientReply: boolean;
  history: { previous_invoices: number; paid_on_time: number; paid_late: number; average_days_late: number | null };
  plan: { onTrack: boolean } | null;
  promiseUntil: string | null; // ISO date of an open promise to pay
  today: string;
};

export type RiskFactor = { label: string; points: number };
export type Risk = { score: number; band: "low" | "watch" | "high"; factors: RiskFactor[] };

const REASON_POINTS: Partial<Record<StuckReason, number>> = {
  dispute: 22,
  unresponsive: 20,
  wrong_contact: 10,
  cash_flow: 10,
  missing_info: 6,
  unknown: 8,
  already_paid: -10,
};

export function scoreRisk(i: RiskInput): Risk {
  if (!i.open) return { score: 0, band: "low", factors: [{ label: "Settled", points: 0 }] };
  const f: RiskFactor[] = [];
  if (i.daysOverdue > 0) f.push({ label: `${i.daysOverdue} days past due`, points: Math.min(40, Math.round(i.daysOverdue * 1.2)) });
  else f.push({ label: i.daysOverdue === 0 ? "Due today" : `Due in ${-i.daysOverdue} days`, points: 0 });

  if (i.dueMinor >= 500_000) f.push({ label: "Large balance (≥ $5,000)", points: 10 });
  else if (i.dueMinor >= 200_000) f.push({ label: "Mid-size balance (≥ $2,000)", points: 6 });

  const h = i.history;
  if (h.previous_invoices === 0) f.push({ label: "New client, no payment history", points: 6 });
  else if (h.paid_late === 0 && h.paid_on_time >= 2) f.push({ label: `Paid ${h.paid_on_time} previous invoices on time`, points: -12 });
  else if (h.average_days_late !== null && h.average_days_late > 5) f.push({ label: `Usually pays ${h.average_days_late} days late`, points: 8 });

  if (i.reason && REASON_POINTS[i.reason]) f.push({ label: `Stuck reason: ${i.reason.replace("_", " ")}`, points: REASON_POINTS[i.reason]! });
  if (i.remindersSent >= 2 && !i.hasClientReply) f.push({ label: `${i.remindersSent} reminders, no reply`, points: 10 });
  if (i.plan?.onTrack) f.push({ label: "Payment plan on track", points: -18 });
  if (i.plan && !i.plan.onTrack) f.push({ label: "Plan installment overdue", points: 12 });
  if (i.promiseUntil && i.promiseUntil >= i.today) f.push({ label: `Promised to pay by ${i.promiseUntil}`, points: -10 });
  if (i.promiseUntil && i.promiseUntil < i.today) f.push({ label: `Missed promise (${i.promiseUntil})`, points: 15 });

  const score = Math.max(0, Math.min(100, f.reduce((s, x) => s + x.points, 0)));
  return { score, band: score >= 55 ? "high" : score >= 28 ? "watch" : "low", factors: f };
}
