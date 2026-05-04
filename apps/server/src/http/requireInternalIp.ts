import net from "node:net";
import type { Request, RequestHandler } from "express";
import { getIp } from "./rateLimit.js";

/**
 * IP-allowlist middleware for internal endpoints
 * (`docs/security/hardening/M14-internal-push-ip-allowlist.md`).
 *
 * Wraps the existing `requireApiSecret` guard with a network-level check:
 * even with a valid `X-Api-Secret`, the request is rejected with 403
 * unless its source IP falls inside one of the configured allowlist
 * entries. This is defence-in-depth: if `INTERNAL_API_KEY` ever leaks
 * (Sentry breadcrumb, Railway env-var screenshot, …), the attacker still
 * needs to be coming from inside the deploy's private network to land
 * a payload on the user — public-internet exploitation is contained at
 * the network layer rather than relying solely on a shared secret.
 *
 * Allowlist semantics:
 *   * Each entry is either a single IPv4/IPv6 address (`10.0.0.5`,
 *     `::1`) or a CIDR (`100.64.0.0/10`, `fd00::/8`).
 *   * Entries are loaded into a `net.BlockList` once per middleware
 *     instance — `BlockList.check()` is O(entries) per call but the
 *     allowlist is small (single-digit count in production), so the
 *     hot-path cost is one synchronous string parse.
 *   * `getIp(req)` is the single source of truth for "what IP is this
 *     call from" — it already honours `app.set('trust proxy', …)` so
 *     X-Forwarded-For from Railway's edge is parsed consistently with
 *     `rateLimitSubject(req)`. This middleware deliberately does NOT
 *     reach into `req.socket.remoteAddress` directly: behind a proxy
 *     that would always resolve to the proxy's own IP and the
 *     allowlist would degrade into "always 403" or "always 200"
 *     depending on whether the proxy itself is listed.
 *
 * Default behaviour when `entries` is empty:
 *   * In `NODE_ENV !== "production"` → fail-open (skip the check). This
 *     keeps `pnpm dev` and the supertest harness running without
 *     forcing every developer to add `127.0.0.1` to a config file.
 *   * In `NODE_ENV === "production"` → fail-closed (return 503 with
 *     `code: NOT_CONFIGURED`). A misconfigured production deploy that
 *     forgot to set the allowlist must NOT silently accept every
 *     internal call — the symmetric error path mirrors how
 *     `requireApiSecret` 503s when its env var is missing.
 *
 * Reject path emits structured 403 (matches the project's existing
 * error-shape: `{ error, code }`). The `code` is `IP_NOT_ALLOWED` so
 * dashboards can alert on "X% of /api/push/send 403s in the last
 * window" without false-positives from auth/CSRF rejections.
 */

export interface RequireInternalIpOptions {
  /**
   * Comma-or-newline-separated allowlist (or pre-split array). Entries
   * may be plain IPs (`10.0.0.5`, `::1`) or CIDRs (`100.64.0.0/10`).
   * Whitespace around entries is trimmed; empty entries are skipped.
   * Loopback (`127.0.0.1`, `::1`) is always included so on-host calls
   * (`curl localhost`, supertest) succeed without operator action.
   */
  entries: string | readonly string[];

  /**
   * Optional callback invoked on every reject. Used by the push handler
   * to bump a Prometheus counter without coupling the middleware to the
   * obs/metrics module directly. Errors thrown from the callback are
   * swallowed — the audit/log path must never break the response.
   */
  onReject?: (info: { ip: string; path: string }) => void;

  /**
   * Override `NODE_ENV` detection for tests. When `true`, an empty
   * allowlist fails-closed (returns 503) regardless of `process.env
   * .NODE_ENV`. When `false`, an empty allowlist fails-open. When
   * unset, falls back to `process.env.NODE_ENV === "production"`.
   */
  failClosedOnEmpty?: boolean;
}

interface ParsedEntry {
  raw: string;
  type: "ipv4" | "ipv6";
  prefix: number;
  address: string;
}

const LOOPBACK_DEFAULTS: readonly string[] = ["127.0.0.1/32", "::1/128"];

/**
 * Parse a single allowlist token into `{ address, prefix, type }`.
 * Accepts:
 *   * `1.2.3.4`         → IPv4 /32
 *   * `1.2.3.4/24`      → IPv4 /24
 *   * `::1`             → IPv6 /128
 *   * `fd00::/8`        → IPv6 /8
 * Returns `null` on anything Node's `net.isIP` rejects so the caller
 * can log+skip rather than crash on a malformed env var.
 */
function parseEntry(raw: string): ParsedEntry | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const slash = trimmed.indexOf("/");
  const addr = slash === -1 ? trimmed : trimmed.slice(0, slash);
  const fam = net.isIP(addr);
  if (fam !== 4 && fam !== 6) return null;
  const type: "ipv4" | "ipv6" = fam === 4 ? "ipv4" : "ipv6";
  const max = type === "ipv4" ? 32 : 128;
  let prefix = max;
  if (slash !== -1) {
    const n = Number.parseInt(trimmed.slice(slash + 1), 10);
    if (!Number.isFinite(n) || n < 0 || n > max) return null;
    prefix = n;
  }
  return { raw: trimmed, type, prefix, address: addr };
}

function tokenize(entries: string | readonly string[]): readonly string[] {
  if (Array.isArray(entries)) return entries as readonly string[];
  if (typeof entries === "string") {
    return entries.split(/[\s,]+/).filter((s) => s.length > 0);
  }
  return [];
}

/**
 * Build a `net.BlockList` from the configured entries plus loopback
 * defaults. Returns `null` when the resulting list is empty (no valid
 * entries) so the caller can apply its empty-list policy.
 */
function buildBlockList(
  entries: string | readonly string[],
): { list: net.BlockList; parsed: readonly ParsedEntry[] } | null {
  const tokens = tokenize(entries);
  const all = [...LOOPBACK_DEFAULTS, ...tokens];
  const list = new net.BlockList();
  const parsed: ParsedEntry[] = [];
  for (const raw of all) {
    const p = parseEntry(raw);
    if (!p) continue;
    if (p.prefix === (p.type === "ipv4" ? 32 : 128)) {
      list.addAddress(p.address, p.type);
    } else {
      list.addSubnet(p.address, p.prefix, p.type);
    }
    parsed.push(p);
  }
  if (parsed.length === 0) return null;
  return { list, parsed };
}

/**
 * Strip an IPv4-mapped IPv6 prefix (`::ffff:1.2.3.4` → `1.2.3.4`).
 * Express returns this form on dual-stack listeners and `BlockList
 * .check(addr, "ipv6")` will not match an IPv4 entry on the wrapped
 * address, so we collapse to the underlying v4 representation before
 * checking.
 */
function normalizeIp(ip: string): { ip: string; type: "ipv4" | "ipv6" } {
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice("::ffff:".length);
    if (net.isIP(v4) === 4) return { ip: v4, type: "ipv4" };
  }
  const fam = net.isIP(lower);
  if (fam === 4) return { ip: lower, type: "ipv4" };
  if (fam === 6) return { ip: lower, type: "ipv6" };
  return { ip: lower, type: "ipv4" };
}

/**
 * `true` if `entries` (after parsing) was effectively empty — i.e. no
 * operator-supplied allowlist beyond the implicit loopback defaults.
 * Used to decide the "no allowlist configured" policy: fail-open in
 * dev, fail-closed in production.
 */
function isAllowlistEmpty(entries: string | readonly string[]): boolean {
  const tokens = tokenize(entries);
  for (const t of tokens) {
    if (parseEntry(t)) return false;
  }
  return true;
}

export function requireInternalIp(
  opts: RequireInternalIpOptions,
): RequestHandler {
  const built = buildBlockList(opts.entries);
  const allowlistEmpty = isAllowlistEmpty(opts.entries);
  const failClosed =
    opts.failClosedOnEmpty ?? process.env.NODE_ENV === "production";

  return (req: Request, res, next) => {
    if (!built) {
      // Should not happen — `buildBlockList` falls back to loopback
      // defaults — but defensively respect the fail-closed contract
      // rather than silently letting the request through.
      if (failClosed) {
        res.status(503).json({
          error: "IP allowlist not configured",
          code: "NOT_CONFIGURED",
        });
        return;
      }
      next();
      return;
    }
    if (allowlistEmpty && !failClosed) {
      // No operator allowlist + fail-open mode (dev/test): skip the
      // check entirely. Loopback would already match here, but a dev
      // running the API on a non-loopback interface (`HOST=0.0.0.0`,
      // talking from a LAN box) would otherwise hit a 403.
      next();
      return;
    }

    const rawIp = getIp(req);
    const { ip, type } = normalizeIp(rawIp);
    if (built.list.check(ip, type)) {
      next();
      return;
    }

    try {
      opts.onReject?.({ ip: rawIp, path: req.path });
    } catch {
      /* never break the response on observability errors */
    }
    res.status(403).json({
      error: "Не дозволена IP-адреса",
      code: "IP_NOT_ALLOWED",
    });
  };
}

/** Test-only export for asserting parser semantics without booting Express. */
export const __internal = {
  parseEntry,
  tokenize,
  normalizeIp,
  isAllowlistEmpty,
};
