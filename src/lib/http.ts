import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * CSRF defence for owner mutations: require a JSON content type (forces a CORS preflight for
 * cross-site requests) and, when the browser sends one, an Origin that matches the Host.
 */
export function assertSameOrigin(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw Object.assign(new Error("Expected application/json"), { status: 415 });
  const origin = req.headers.get("origin");
  if (origin) {
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!host || new URL(origin).host !== host) throw Object.assign(new Error("Cross-origin request rejected"), { status: 403 });
  }
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  const text = await req.text();
  if (text.length > 64_000) throw Object.assign(new Error("Request too large"), { status: 413 });
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw Object.assign(new Error("Invalid JSON"), { status: 400 });
  }
}

/** Wrap a route handler: maps thrown errors to JSON responses without leaking internals. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof ZodError) return json({ error: "Invalid input", issues: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
      const err = e as Error & { status?: number };
      const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
      if (status >= 500) console.error("[unstuck]", err);
      return json({ error: status >= 500 && process.env.NODE_ENV === "production" ? "Something went wrong" : err.message }, status);
    }
  };
}
