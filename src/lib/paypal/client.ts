/**
 * Minimal, typed PayPal REST client.
 *
 * - OAuth2 client-credentials with token caching (refreshed 60 s before expiry, and once on 401).
 * - `PayPal-Request-Id` on every write so retries are idempotent.
 * - Retries 429/5xx/network errors with exponential backoff (writes only when a request id is set).
 * - Captures `paypal-debug-id` for every response so the audit log can reference PayPal's own trace.
 *
 * The PayPal server SDK does not cover Invoicing, so Unstuck calls Invoicing v2 directly.
 */

export const PAYPAL_SANDBOX_BASE = "https://api-m.sandbox.paypal.com";
export const PAYPAL_LIVE_BASE = "https://api-m.paypal.com";

export class PayPalApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly name_: string | undefined,
    readonly debugId: string | undefined,
    readonly details: unknown,
  ) {
    super(message);
    this.name = "PayPalApiError";
  }
}

export type PayPalResponse<T> = { status: number; data: T; debugId?: string };

export type RequestOptions = {
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  requestId?: string;
  headers?: Record<string, string>;
};

type FetchLike = typeof fetch;

export class PayPalClient {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly cfg: {
      clientId: string;
      clientSecret: string;
      baseUrl: string;
      fetchImpl?: FetchLike;
      timeoutMs?: number;
      maxRetries?: number;
      sleep?: (ms: number) => Promise<void>;
    },
  ) {}

  get baseUrl() {
    return this.cfg.baseUrl;
  }

  private get fetch(): FetchLike {
    return this.cfg.fetchImpl ?? fetch;
  }

  private sleep(ms: number) {
    return this.cfg.sleep ? this.cfg.sleep(ms) : new Promise<void>((r) => setTimeout(r, ms));
  }

  async getAccessToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.token.expiresAt) return this.token.value;
    const basic = Buffer.from(`${this.cfg.clientId}:${this.cfg.clientSecret}`).toString("base64");
    const res = await this.fetch(`${this.cfg.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
    });
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!res.ok || !json.access_token) {
      throw new PayPalApiError(
        `PayPal authentication failed (${res.status}): ${json.error_description ?? "check PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET"}`,
        res.status,
        "AUTHENTICATION_FAILURE",
        res.headers.get("paypal-debug-id") ?? undefined,
        json,
      );
    }
    const ttl = Math.max(60, (json.expires_in ?? 3600) - 60) * 1000;
    this.token = { value: json.access_token, expiresAt: Date.now() + ttl };
    return this.token.value;
  }

  async request<T = unknown>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, opts: RequestOptions = {}): Promise<PayPalResponse<T>> {
    const url = new URL(path, this.cfg.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));

    const isWrite = method !== "GET";
    const retryable = !isWrite || !!opts.requestId;
    const maxRetries = this.cfg.maxRetries ?? 2;
    let reauthed = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.getAccessToken();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.requestId ? { "PayPal-Request-Id": opts.requestId } : {}),
        ...opts.headers,
      };
      let res: Response;
      try {
        res = await this.fetch(url, {
          method,
          headers,
          body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
          signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 20_000),
        });
      } catch (err) {
        if (retryable && attempt < maxRetries) {
          await this.sleep(500 * 2 ** attempt);
          continue;
        }
        throw new PayPalApiError(`Network error calling PayPal ${method} ${url.pathname}: ${(err as Error).message}`, 0, "NETWORK_ERROR", undefined, null);
      }

      const debugId = res.headers.get("paypal-debug-id") ?? undefined;
      if (res.status === 401 && !reauthed) {
        reauthed = true;
        await this.getAccessToken(true);
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && retryable && attempt < maxRetries) {
        await this.sleep(500 * 2 ** attempt);
        continue;
      }

      const text = await res.text();
      let data: unknown = undefined;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = text;
        }
      }
      if (!res.ok) {
        const err = (data ?? {}) as { name?: string; message?: string; details?: { issue?: string; description?: string }[] };
        const detail = err.details?.map((d) => d.description ?? d.issue).filter(Boolean).join("; ");
        throw new PayPalApiError(
          `PayPal ${method} ${url.pathname} failed (${res.status} ${err.name ?? ""}): ${err.message ?? ""}${detail ? ` — ${detail}` : ""}`.trim(),
          res.status,
          err.name,
          debugId,
          data,
        );
      }
      return { status: res.status, data: data as T, debugId };
    }
  }
}
