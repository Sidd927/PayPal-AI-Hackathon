import { type NextRequest, NextResponse } from "next/server";

/** Constant-time string comparison (Edge-compatible), so the password can't be guessed byte by byte. */
function safeEqual(a: string, b: string) {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function decodeBasic(header: string) {
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return null;
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

/** Real PayPal credentials are configured and the app is not forced into simulation. */
function livePayPal() {
  return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET && process.env.UNSTUCK_MODE !== "simulation";
}

/**
 * Owner-console gate. Set OWNER_BASIC_AUTH="user:password" to require HTTP Basic auth for the owner
 * console and owner APIs. Payer pages (/r/*), payer APIs (/api/pay/*) and the PayPal webhook stay public:
 * they are protected by unguessable tokens and signature verification.
 *
 * Fails closed: a production server connected to PayPal refuses to serve the owner console (which can
 * approve actions that change invoices) until a password is set. Simulation-mode demos stay open.
 */
export function proxy(req: NextRequest) {
  const creds = process.env.OWNER_BASIC_AUTH;
  if (!creds) {
    if (process.env.NODE_ENV === "production" && livePayPal()) {
      return new NextResponse("Owner console locked: set OWNER_BASIC_AUTH before connecting PayPal in production.", { status: 503 });
    }
    return NextResponse.next();
  }
  const header = req.headers.get("authorization") ?? "";
  // A scheduler (e.g. Render cron) may start agent runs with its own token instead of the owner's password.
  const runToken = process.env.AGENT_RUN_TOKEN;
  if (runToken && req.nextUrl.pathname === "/api/agent/run" && safeEqual(header, `Bearer ${runToken}`)) return NextResponse.next();
  const given = decodeBasic(header);
  if (given !== null && safeEqual(given, creds)) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Unstuck owner console"' } });
}

export const config = {
  matcher: ["/((?!r/|api/pay/|api/webhooks/|api/health|_next/|favicon|icon).*)"],
};
