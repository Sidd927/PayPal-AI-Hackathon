"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Mode = { paypal: "sandbox" | "simulation" | "misconfigured"; paypalError: string | null; webhookConfigured: boolean; ai: "claude" | "rules"; model: string | null };

export function AppHeader({ mode, business, right }: { mode?: Mode; business?: string; right?: React.ReactNode }) {
  const path = usePathname();
  const nav = [
    { href: "/", label: "Receivables" },
    { href: "/insights", label: "Insights" },
    { href: "/activity", label: "Activity" },
    { href: "/policy", label: "Your rules" },
  ];
  return (
    <header className="border-b border-rule bg-paper">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-8 gap-y-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Unstuck home">
          <svg viewBox="0 0 64 64" className="size-7" aria-hidden>
            <rect width="64" height="64" rx="14" fill="#17312a" />
            <path d="M20 18v17a12 12 0 0 0 24 0V18" fill="none" stroke="#eef2eb" strokeWidth="6" strokeLinecap="round" />
            <circle cx="44" cy="18" r="5" fill="#e3a02f" />
          </svg>
          <span className="font-display text-xl text-ink">Unstuck</span>
          {business && <span className="hidden text-sm text-ink-faint md:inline">for {business}</span>}
        </Link>
        <nav aria-label="Main" className="flex gap-1 text-sm">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className={`rounded-full px-3 py-1.5 ${path === n.href ? "bg-ink text-surface" : "text-ink-soft hover:bg-rule/50 hover:text-ink"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:ml-auto sm:w-auto">
          {mode && (
            <>
              <span
                title={mode.paypal === "sandbox" ? `Connected to the PayPal sandbox${mode.webhookConfigured ? ", webhooks verified" : ", webhook id not set (sync to see payments)"}` : mode.paypalError ?? "No PayPal credentials: local simulation, no PayPal calls are made"}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${mode.paypal === "sandbox" ? "bg-ok-wash text-ok" : "bg-marigold-wash text-marigold-deep"}`}
              >
                <span aria-hidden className={`size-1.5 rounded-full ${mode.paypal === "sandbox" ? "bg-ok" : "bg-marigold-deep"}`} />
                {mode.paypal === "sandbox" ? "PayPal sandbox" : mode.paypal === "misconfigured" ? "PayPal misconfigured" : <span>Simulation<span className="hidden sm:inline">, not PayPal</span></span>}
              </span>
              <span title={mode.model ?? "Set ANTHROPIC_API_KEY to enable Claude"} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${mode.ai === "claude" ? "bg-ok-wash text-ok" : "bg-rule/60 text-ink-soft"}`}>
                <span aria-hidden className={`size-1.5 rounded-full ${mode.ai === "claude" ? "bg-ok" : "bg-ink-faint"}`} />
                {mode.ai === "claude" ? "Claude" : "Rules only"}
              </span>
            </>
          )}
          {right}
        </div>
      </div>
    </header>
  );
}
