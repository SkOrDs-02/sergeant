/// <reference types="node" />
// `apps/web/tsconfig.json` ships `"types": ["vite/client"]` so the standalone
// `tsc-files` pre-commit (initiative 0009 PR 1.3) cannot see Node's globals
// when this file is checked in isolation. The triple-slash reference adds
// `@types/node` only for this file — vitest config already pulls it in for
// `pnpm typecheck`, so this is a no-op in the project-wide build.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * L2 — `docs/security/hardening/L2-permissions-policy-broader.md`.
 *
 * `apps/web/vercel.json` ships the `Permissions-Policy` response header
 * for the production SPA. The SPA does not need any of the powerful
 * device / sensor / clipboard / XR APIs covered below, so the header
 * must explicitly disable them with the `name=()` allowlist (empty
 * allowlist = no origin can use the feature).
 *
 * This test is the regression guard against silent re-enablement: a
 * future contributor cannot drop a directive from the header without
 * also editing this file, which makes the policy change reviewable.
 *
 * If a feature is intentionally added back (e.g. clipboard for a
 * future Pro feature), move it out of `REQUIRED_DISABLED_DIRECTIVES`
 * and document the carve-out in `docs/security/audit-exceptions.md`.
 */

interface PermissionsPolicy {
  [name: string]: string;
}

function parsePermissionsPolicy(raw: string): PermissionsPolicy {
  const out: PermissionsPolicy = {};
  for (const directive of raw.split(",")) {
    const trimmed = directive.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    out[name] = value;
  }
  return out;
}

function readVercelPermissionsPolicy(): string {
  const cfg = JSON.parse(
    readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
  ) as {
    headers: Array<{
      source: string;
      headers: Array<{ key: string; value: string }>;
    }>;
  };
  const wildcard = cfg.headers.find((h) => h.source === "/(.*)");
  if (!wildcard) throw new Error("vercel.json missing wildcard header block");
  const header = wildcard.headers.find((h) => h.key === "Permissions-Policy");
  if (!header)
    throw new Error("vercel.json wildcard block missing Permissions-Policy");
  return header.value;
}

// Directives that MUST be disabled (`name=()` — empty allowlist) on the
// production SPA. Adding to this list = tighter posture; removing =
// requires an audit-exceptions.md entry.
const REQUIRED_DISABLED_DIRECTIVES = [
  // Device + sensor (covered by the original C2 / H7 baseline).
  "camera",
  "microphone",
  "geolocation",
  "magnetometer",
  "accelerometer",
  "gyroscope",
  "usb",
  "payment",
  // Browser-level opt-out signals (FLoC / Topics).
  "interest-cohort",
  "browsing-topics",
  // L2 expansion — surfaces that a future XSS could reach without an
  // explicit denial.
  "clipboard-read",
  "clipboard-write",
  "screen-wake-lock",
  "xr-spatial-tracking",
  "bluetooth",
  "hid",
  "serial",
  "midi",
  "encrypted-media",
];

describe("L2: Permissions-Policy header (apps/web/vercel.json)", () => {
  const policy = parsePermissionsPolicy(readVercelPermissionsPolicy());

  it.each(REQUIRED_DISABLED_DIRECTIVES)(
    "disables %s with empty allowlist",
    (name) => {
      expect(policy).toHaveProperty(name);
      // `name=()` is the canonical empty-allowlist syntax. A trailing
      // semicolon, whitespace, or `*` would re-open the feature for
      // every origin and must be rejected.
      expect(policy[name]).toBe("()");
    },
  );

  it("does not enable any directive for an arbitrary origin", () => {
    for (const [name, value] of Object.entries(policy)) {
      // Star-allowlist (`name=*`) is the only way to silently re-open
      // a feature without naming an origin. Reject regardless of the
      // directive — every feature the SPA needs must list literal
      // origins.
      expect(value, `directive ${name} unexpectedly opens to *`).not.toBe("*");
    }
  });
});
