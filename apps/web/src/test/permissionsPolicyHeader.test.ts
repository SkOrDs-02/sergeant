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
 * for the production SPA. Most powerful device / sensor / clipboard / XR
 * APIs are not needed, so the header disables them with the `name=()`
 * allowlist (empty allowlist = no origin can use the feature). The two
 * exceptions are `camera` and `microphone`, enabled for the app's OWN
 * origin (`name=(self)`) because shipped features depend on them
 * (barcode scanner + voice input — see `ENABLED_SELF_DIRECTIVES`).
 *
 * This test is the regression guard against silent re-enablement: a
 * future contributor cannot drop a directive, widen one to `*`, or
 * change a self-grant without also editing this file, which makes the
 * policy change reviewable.
 *
 * If a disabled feature is intentionally added back, move it out of
 * `REQUIRED_DISABLED_DIRECTIVES` (into `ENABLED_SELF_DIRECTIVES` when it
 * should be self-only) and document the carve-out in
 * `docs/04-governance/security/audit-exceptions.md`.
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
  // NB: `camera` + `microphone` are NOT here — they moved to
  // `ENABLED_SELF_DIRECTIVES` below because shipped barcode-scanner and
  // voice-input features need them. They stay locked to `(self)`.
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

// Directives enabled for the app's OWN origin only (`name=(self)`) — never
// `()` (would break the feature) and never `*` (would let any cross-origin
// iframe borrow the grant). `camera` — barcode scanner (`useBarcodeScanner`
// getUserMedia({video}) + `BarcodeScanner.tsx`); `microphone` — voice input
// (`useGroqVoiceInput` getUserMedia({audio}) + `useSpeech` SpeechRecognition).
// Carve-out documented in docs/04-governance/security/audit-exceptions.md.
const ENABLED_SELF_DIRECTIVES = ["camera", "microphone"];

describe("L2: Permissions-Policy header (apps/web/vercel.json)", () => {
  const policy = parsePermissionsPolicy(readVercelPermissionsPolicy());

  it.each(ENABLED_SELF_DIRECTIVES)(
    "enables %s for the self origin only (`(self)`, not `()` or `*`)",
    (name) => {
      expect(policy).toHaveProperty(name);
      expect(policy[name]).toBe("(self)");
    },
  );

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
