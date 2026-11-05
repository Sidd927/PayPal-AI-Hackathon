/**
 * Process-wide outbound network guard for verification scripts.
 *
 * Layer 1 (every client): each TCP connection is checked by hostname before it opens. This covers fetch (undici,
 * including redirect hops it follows internally), node:http/https, node-fetch/gaxios and WebSockets.
 * Layer 2 (fetch): checks the URL, counts allowed requests, and refuses redirects outright.
 * Anything not on the allowlist is refused; PayPal hosts are counted separately.
 */
import net from "node:net";

export type GuardLog = { paypal: string[]; other: string[]; allowedRequests: number };
export const isPayPalHost = (host: string) => /(^|\.)paypal\.com\.?$/i.test(host);

export function installNetworkGuard(allowedHosts: string[]): { log: GuardLog; uninstall: () => void } {
  const allowed = new Set(allowedHosts.map((h) => h.toLowerCase()));
  const log: GuardLog = { paypal: [], other: [], allowedRequests: 0 };
  const refuse = (host: string, what: string) => (isPayPalHost(host) ? log.paypal : log.other).push(`${what} ${host}`);

  const realConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: unknown[]) {
    const a0 = args[0] as unknown;
    const opts = (Array.isArray(a0) ? a0[0] : a0) as { host?: string; path?: string } | number | string;
    const host = typeof opts === "object" && opts ? (opts.path ? `unix:${opts.path}` : String(opts.host ?? "localhost")) : typeof args[1] === "string" ? (args[1] as string) : "localhost";
    if (!allowed.has(host.toLowerCase())) {
      refuse(host, "connect");
      process.nextTick(() => this.destroy(new Error(`Blocked by network guard: connection to ${host} is not allowed`)));
      return this;
    }
    return (realConnect as (...a: unknown[]) => net.Socket).apply(this, args);
  } as typeof net.Socket.prototype.connect;

  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (!allowed.has(url.hostname.toLowerCase())) {
      refuse(url.hostname, `${init?.method ?? (input instanceof Request ? input.method : "GET")} ${url.pathname}`);
      throw new Error(`Blocked by network guard: ${url.hostname} is not allowed`);
    }
    log.allowedRequests++;
    return realFetch(input instanceof Request ? new Request(input, { redirect: "error" }) : input, { ...init, redirect: "error" });
  }) as typeof fetch;

  return {
    log,
    uninstall() {
      net.Socket.prototype.connect = realConnect;
      globalThis.fetch = realFetch;
    },
  };
}
