"use client";
import { useEffect, useState } from "react";
import type { Policy } from "@/lib/policy";
import { api, money } from "@/lib/client";
import { AppHeader } from "./AppHeader";
import { Button, Spinner } from "./ui";

function Row({ title, help, children }: { title: string; help: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 border-b border-rule py-5 sm:grid-cols-[1fr_220px] sm:items-center">
      <div>
        <p className="font-medium text-ink">{title}</p>
        <p className="mt-0.5 text-sm text-ink-soft">{help}</p>
      </div>
      <div className="sm:justify-self-end">{children}</div>
    </div>
  );
}

const num = "w-24 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-1.5 text-right tabular";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-ink" : "bg-rule-strong"}`}>
      <span className={`absolute top-0.5 size-5 rounded-full bg-surface transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export function PolicyForm() {
  const [p, setP] = useState<Policy | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Policy>("/api/policy").then(setP).catch((e) => setError(e.message));
  }, []);
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setP((x) => (x ? { ...x, [k]: v } : x));
  async function save() {
    setBusy(true);
    setError(null);
    try {
      setP(await api<Policy>("/api/policy", { method: "PUT", body: p }));
      setSaved("Rules saved. They apply to the next decision Unstuck makes.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <h1 className="font-display text-3xl text-ink">Your rules</h1>
        <p className="mt-2 text-ink-soft">
          Claude suggests what to do; these rules decide what may happen without you. Anything that changes money waits for your approval unless a rule below says otherwise, and nothing outside them is ever sent.
        </p>
        {!p ? (
          <div className="py-10">{error ? <p className="text-alert">{error}</p> : <Spinner label="Loading" />}</div>
        ) : (
          <form
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <h2 className="mt-4 font-display text-xl text-ink">You</h2>
            <Row title="Business name" help="Shown to clients on their payment page.">
              <input value={p.businessName} onChange={(e) => set("businessName", e.target.value)} className="w-56 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-1.5" />
            </Row>
            <Row title="Your name" help="Reminders are written in your voice and signed with your first name.">
              <input value={p.ownerName} onChange={(e) => set("ownerName", e.target.value)} className="w-56 rounded-[var(--radius-tight)] border border-rule-strong bg-surface px-2.5 py-1.5" />
            </Row>

            <h2 className="mt-8 font-display text-xl text-ink">Reminders</h2>
            <Row title="Send reminders on my behalf" help="Reason-aware reminders go out through PayPal without asking you, within the limits below. New recipients and disputes always ask first.">
              <Toggle on={p.autoSendReminders} onChange={(v) => set("autoSendReminders", v)} label="Send reminders automatically" />
            </Row>
            <Row title="Days between reminders" help="Unstuck won't nudge the same client more often than this.">
              <input type="number" min={1} max={30} value={p.reminderQuietDays} onChange={(e) => set("reminderQuietDays", Number(e.target.value))} className={num} />
            </Row>
            <Row title="Most reminders per invoice" help="After this, Unstuck stops and tells you.">
              <input type="number" min={1} max={10} value={p.maxRemindersPerInvoice} onChange={(e) => set("maxRemindersPerInvoice", Number(e.target.value))} className={num} />
            </Row>

            <h2 className="mt-8 font-display text-xl text-ink">Payment plans</h2>
            <Row title="Let clients set up plans within these limits" help="If a client picks a plan on their payment page that fits every limit, it's applied in PayPal straight away. Anything else comes to you.">
              <Toggle on={p.autoApprovePayerPlans} onChange={(v) => set("autoApprovePayerPlans", v)} label="Auto-approve in-policy client plans" />
            </Row>
            <Row title="Most installments" help="Including the first payment.">
              <input type="number" min={2} max={12} value={p.maxInstallments} onChange={(e) => set("maxInstallments", Number(e.target.value))} className={num} />
            </Row>
            <Row title="Smallest first payment" help="As a share of what's owed.">
              <span className="inline-flex items-center gap-2">
                <input type="number" min={0} max={100} value={p.minFirstPaymentPct} onChange={(e) => set("minFirstPaymentPct", Number(e.target.value))} className={num} />%
              </span>
            </Row>
            <Row title="Plan must finish within" help="Days from the day the plan starts.">
              <span className="inline-flex items-center gap-2">
                <input type="number" min={7} max={180} value={p.maxPlanDays} onChange={(e) => set("maxPlanDays", Number(e.target.value))} className={num} /> days
              </span>
            </Row>

            <h2 className="mt-8 font-display text-xl text-ink">Early-payment discounts</h2>
            <Row title="Allow discounts for paying early" help="Unstuck may suggest one for large invoices. You always approve it.">
              <Toggle on={p.allowEarlyPaymentDiscount} onChange={(v) => set("allowEarlyPaymentDiscount", v)} label="Allow early-payment discounts" />
            </Row>
            <Row title="Largest discount" help="Applied in PayPal as an early-payment rule that expires on its own.">
              <span className="inline-flex items-center gap-2">
                <input type="number" min={0} max={20} step={0.5} value={p.maxDiscountPct} onChange={(e) => set("maxDiscountPct", Number(e.target.value))} className={num} />%
              </span>
            </Row>
            <Row title="Only for invoices of at least" help={`Currently ${money(p.minInvoiceForDiscountMinor, "USD", true)}.`}>
              <input type="number" min={0} step={100} value={p.minInvoiceForDiscountMinor / 100} onChange={(e) => set("minInvoiceForDiscountMinor", Math.round(Number(e.target.value) * 100))} className={num} />
            </Row>

            <div className="sticky bottom-0 mt-6 flex items-center justify-end gap-4 border-t border-rule bg-paper/95 py-4 backdrop-blur">
              {saved && <p className="text-sm text-ok" role="status">{saved}</p>}
              {error && <p className="text-sm text-alert" role="alert">{error}</p>}
              <Button type="submit" variant="primary" busy={busy}>
                Save rules
              </Button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
