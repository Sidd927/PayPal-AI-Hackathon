import { type NextRequest, NextResponse } from "next/server";

/**
 * Optional owner-console gate. Set OWNER_BASIC_AUTH="user:password" to require HTTP Basic auth
 * for the owner console and owner APIs. Payer pages (/r/*), payer APIs (/api/pay/*) and the
 * PayPal webhook stay public — they are protected by unguessable tokens and signature verification.
 */
export function proxy(req: NextRequest) {
  const creds = process.env.OWNER_BASIC_AUTH;
  if (!creds) return NextResponse.next();
  const header = req.headers.get("authorization") ?? "";
  // A scheduler (e.g. Render cron) may start agent runs with its own token instead of the owner's password.
  const runToken = process.env.AGENT_RUN_TOKEN;
  if (runToken && req.nextUrl.pathname === "/api/agent/run" && header === `Bearer ${runToken}`) return NextResponse.next();
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded && atob(encoded) === creds) return NextResponse.next();
  return new NextResponse("Authentication required", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Unstuck owner console"' } });
}

export const config = {
  matcher: ["/((?!r/|api/pay/|api/webhooks/|api/health|_next/|favicon|icon).*)"],
};
