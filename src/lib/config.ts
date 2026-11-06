import { PayPalClient, PAYPAL_SANDBOX_BASE } from "./paypal/client";
import { type InvoiceGateway, LivePayPalGateway } from "./paypal/gateway";
import { SimulatedGateway } from "./paypal/simulated";

export type AiProviderId = "gemini" | "anthropic";
export const AI_PROVIDER_LABEL: Record<AiProviderId, string> = { gemini: "Gemini", anthropic: "Claude" };
/**
 * Default Gemini model. Google lists it as a stable (GA) model with structured output and function calling; its
 * free-tier eligibility and limits could not be confirmed from Google's own pages here, so `npm run verify:ai`
 * checks it live for your key. Override with GEMINI_MODEL.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

/**
 * AI provider selection. Gemini is the default; AI_PROVIDER=anthropic switches to Claude; AI_PROVIDER=none
 * (or the older UNSTUCK_AI=off) turns AI off. Only the selected provider's key is needed.
 */
/**
 * A numeric setting, or `fallback` when it is unset or not a finite number. Fails safe: a typo such as
 * GEMINI_MAX_RPM=ten must not switch pacing off, nor AI_DAILY_CALL_LIMIT=abc remove the daily cap.
 */
function numberOr(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function aiConfig(env: NodeJS.ProcessEnv) {
  const raw = (env.AI_PROVIDER || "gemini").trim().toLowerCase();
  const off = raw === "none" || raw === "off" || env.UNSTUCK_AI === "off";
  const known = raw === "gemini" || raw === "anthropic";
  const provider: AiProviderId = raw === "anthropic" ? "anthropic" : "gemini";
  const key = provider === "gemini" ? env.GEMINI_API_KEY : env.ANTHROPIC_API_KEY;
  const unavailableReason = off ? ("turned_off" as const) : !known ? ("unknown_provider" as const) : !key ? ("no_key" as const) : null;
  return {
    provider,
    providerLabel: AI_PROVIDER_LABEL[provider],
    /** The environment variable that holds the selected provider's key (for messages; never the key itself). */
    keyVariable: provider === "gemini" ? "GEMINI_API_KEY" : "ANTHROPIC_API_KEY",
    configured: unavailableReason === null,
    /** Why AI is unavailable, for display: turned off, an unknown AI_PROVIDER value, or no key for the provider. */
    unavailableReason,
    model: provider === "gemini" ? env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL : env.ANTHROPIC_MODEL || DEFAULT_ANTHROPIC_MODEL,
    /** Claude only: output_config.effort. */
    effort: (env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high",
    /** Gemini only: client-side requests-per-minute ceiling (free-tier limits are per minute and per day). */
    geminiMaxRpm: Math.max(1, numberOr(env.GEMINI_MAX_RPM, 10)),
    dailyCallLimit: Math.max(0, numberOr(env.AI_DAILY_CALL_LIMIT, 500)),
  };
}

/** Runtime configuration from environment variables. Secrets never leave the server. */
export function readConfig() {
  const env = process.env;
  const paypalConfigured = !!(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET);
  const forcedSimulation = env.UNSTUCK_MODE === "simulation";
  return {
    paypal: {
      configured: paypalConfigured,
      mode: (paypalConfigured && !forcedSimulation ? "live" : "simulated") as "live" | "simulated",
      environment: (env.PAYPAL_ENV ?? "sandbox") as string,
      webhookIdConfigured: !!env.PAYPAL_WEBHOOK_ID,
    },
    ai: aiConfig(env),
    appBaseUrl: (env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, ""),
    demoPayerEmail: env.DEMO_PAYER_EMAIL || "",
    allowDemoReset: env.ALLOW_DEMO_RESET !== "false",
  };
}

export type AppConfig = ReturnType<typeof readConfig>;

const g = globalThis as unknown as { __unstuckGateway?: InvoiceGateway; __unstuckGatewayKey?: string };

export function getGateway(): InvoiceGateway {
  const cfg = readConfig();
  const key = `${cfg.paypal.mode}:${process.env.PAYPAL_CLIENT_ID ?? ""}`;
  if (g.__unstuckGateway && g.__unstuckGatewayKey === key) return g.__unstuckGateway;
  if (cfg.paypal.mode === "live") {
    if (cfg.paypal.environment !== "sandbox") {
      // Hackathon build: refuse to touch real money.
      throw new Error(`PAYPAL_ENV=${cfg.paypal.environment} is not allowed. Unstuck's hackathon build only runs against the PayPal sandbox.`);
    }
    const baseUrl = process.env.PAYPAL_API_BASE || PAYPAL_SANDBOX_BASE;
    // A base-URL override is for local mocks only: a real PayPal host must be the sandbox.
    const host = new URL(baseUrl).hostname;
    if (/(^|\.)paypal\.com$/i.test(host) && !/sandbox/i.test(host)) {
      throw new Error(`PAYPAL_API_BASE=${host} is a production PayPal host. Unstuck's hackathon build only runs against the PayPal sandbox.`);
    }
    const client = new PayPalClient({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      baseUrl,
    });
    g.__unstuckGateway = new LivePayPalGateway(client, "sandbox", process.env.PAYPAL_WEBHOOK_ID);
  } else {
    g.__unstuckGateway = new SimulatedGateway();
  }
  g.__unstuckGatewayKey = key;
  return g.__unstuckGateway;
}

/** Test hook. */
export function setGateway(gw: InvoiceGateway) {
  g.__unstuckGateway = gw;
  g.__unstuckGatewayKey = `${readConfig().paypal.mode}:${process.env.PAYPAL_CLIENT_ID ?? ""}`;
}

export function resolutionUrl(token: string) {
  return `${readConfig().appBaseUrl}/r/${token}`;
}
