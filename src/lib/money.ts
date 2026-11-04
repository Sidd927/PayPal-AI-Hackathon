/**
 * Money is always handled as integer minor units (cents) inside Unstuck.
 * PayPal represents amounts as decimal strings ("1200.50"); conversion happens
 * only at the PayPal boundary and at the UI boundary.
 */

/** Currencies with two minor-unit digits that Unstuck supports for the MVP. */
export const SUPPORTED_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

const DECIMAL_RE = /^(\d{1,12})(?:\.(\d{1,2}))?$/;

/** Parse a decimal string like "1200.5" into minor units (120050). Throws on invalid input. */
export function toMinor(value: string | number): number {
  const s = typeof value === "number" ? value.toFixed(2) : value.trim().replace(/,/g, "").replace(/^\$/, "");
  const m = DECIMAL_RE.exec(s);
  if (!m) throw new Error(`Invalid money amount: "${value}"`);
  const whole = Number(m[1]);
  const frac = Number((m[2] ?? "").padEnd(2, "0"));
  return whole * 100 + frac;
}

/** Safe variant that returns null instead of throwing. */
export function tryToMinor(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  try {
    return toMinor(value);
  } catch {
    return null;
  }
}

/** Format minor units as a PayPal decimal string ("1200.50"). */
export function fromMinor(minor: number): string {
  if (!Number.isInteger(minor) || minor < 0) throw new Error(`Invalid minor amount: ${minor}`);
  const whole = Math.floor(minor / 100);
  const frac = minor % 100;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

export function formatMoney(minor: number, currency = "USD", opts: { compact?: boolean } = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: opts.compact && minor % 100 === 0 ? 0 : 2,
    minimumFractionDigits: opts.compact && minor % 100 === 0 ? 0 : 2,
  }).format(minor / 100);
}

/** Split `total` into `parts` integer amounts that sum exactly to total (remainder goes to the first part). */
export function splitEvenly(total: number, parts: number): number[] {
  if (parts < 1) throw new Error("parts must be >= 1");
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => (i === 0 ? base + remainder : base));
}
