import { PayPalClient, PAYPAL_SANDBOX_BASE } from "./paypal/client";
import { type InvoiceGateway, LivePayPalGateway } from "./paypal/gateway";
import { SimulatedGateway } from "./paypal/simulated";

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
    ai: {
      configured: !!env.ANTHROPIC_API_KEY && env.UNSTUCK_AI !== "off",
      /** Why AI is unavailable, for display: a key is set but UNSTUCK_AI=off, or no key at all. */
      unavailableReason: env.UNSTUCK_AI === "off" ? ("turned_off" as const) : !env.ANTHROPIC_API_KEY ? ("no_key" as const) : null,
      model: env.ANTHROPIC_MODEL || "claude-opus-5-5",
      effort: (env.ANTHROPIC_EFFORT || "medium") as "low" | "medium" | "high",
      dailyCallLimit: Number(env.AI_DAILY_CALL_LIMIT || 500),
    },
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
