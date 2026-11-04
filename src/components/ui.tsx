"use client";
import type { ComponentProps, ReactNode } from "react";
import { REASON_META, type StuckReason } from "@/lib/domain";

const tone: Record<string, string> = {
  sky: "text-r-sky", amber: "text-r-amber", violet: "text-r-violet", rose: "text-r-rose",
  teal: "text-r-teal", emerald: "text-r-emerald", slate: "text-r-slate", stone: "text-r-stone",
};
const dot: Record<string, string> = {
  sky: "bg-r-sky", amber: "bg-r-amber", violet: "bg-r-violet", rose: "bg-r-rose",
  teal: "bg-r-teal", emerald: "bg-r-emerald", slate: "bg-r-slate", stone: "bg-r-stone",
};

export function reasonTone(reason: StuckReason | null) {
  return reason ? REASON_META[reason].tone : "stone";
}

/** The stuck reason as a human phrase — the product's signature element. */
export function ReasonPhrase({ reason, size = "md" }: { reason: StuckReason | null; size?: "sm" | "md" | "lg" }) {
  if (!reason) return <span className="text-ink-faint text-sm">Not diagnosed yet</span>;
  const t = REASON_META[reason].tone;
  const cls = size === "lg" ? "text-2xl" : size === "sm" ? "text-[0.95rem]" : "text-[1.05rem]";
  return (
    <span className={`inline-flex items-center gap-2 ${tone[t]}`}>
      <span aria-hidden className={`size-2 rounded-full ${dot[t]}`} />
      <span className={`font-display italic ${cls} leading-tight`}>{REASON_META[reason].label}</span>
    </span>
  );
}

export function ReasonDot({ reason }: { reason: StuckReason | "undiagnosed" }) {
  const t = reason === "undiagnosed" ? "stone" : REASON_META[reason].tone;
  return <span aria-hidden className={`inline-block size-2 rounded-full ${dot[t]}`} />;
}

type Variant = "primary" | "quiet" | "ghost" | "danger" | "money";
const variants: Record<Variant, string> = {
  primary: "bg-ink text-surface hover:bg-[#21443a] disabled:bg-ink-faint",
  money: "bg-marigold text-ink hover:bg-[#eab04e] disabled:opacity-60",
  quiet: "bg-surface text-ink border border-rule-strong hover:border-ink-soft disabled:opacity-50",
  ghost: "text-ink-soft hover:text-ink hover:bg-rule/40 disabled:opacity-50",
  danger: "text-alert border border-alert/30 hover:bg-alert-wash disabled:opacity-50",
};

export function Button({ variant = "quiet", busy, children, className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-[var(--radius-tight)] px-3.5 py-2 text-sm font-medium transition-colors ${variants[variant]} ${className}`}
    >
      {busy && <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {children}
    </button>
  );
}

export function StatusPill({ children, kind = "neutral" }: { children: ReactNode; kind?: "neutral" | "ok" | "warn" | "alert" | "live" }) {
  const k = {
    neutral: "bg-rule/60 text-ink-soft",
    ok: "bg-ok-wash text-ok",
    warn: "bg-marigold-wash text-marigold-deep",
    alert: "bg-alert-wash text-alert",
    live: "bg-ok-wash text-ok",
  }[kind];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${k}`}>{children}</span>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-soft">
      <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-ink-faint border-t-transparent" />
      {label}
    </span>
  );
}

/** Transparent risk badge: the title lists every factor and its points. */
export function RiskPill({ risk }: { risk: { score: number; band: "low" | "watch" | "high"; factors: { label: string; points: number }[] } }) {
  const k = { low: "bg-ok-wash text-ok", watch: "bg-marigold-wash text-marigold-deep", high: "bg-alert-wash text-alert" }[risk.band];
  const label = { low: "Low risk", watch: "Watch", high: "High risk" }[risk.band];
  return (
    <span title={risk.factors.map((f) => `${f.points >= 0 ? "+" : ""}${f.points}  ${f.label}`).join("\n")} className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular ${k}`}>
      {label}
      <span className="opacity-70">{risk.score}</span>
    </span>
  );
}
