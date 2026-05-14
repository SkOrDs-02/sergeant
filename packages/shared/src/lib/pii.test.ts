import { describe, expect, it } from "vitest";

import {
  PII_REDACTED,
  PII_STRING_PATTERNS,
  REDACT_KEY_NAMES,
  SENSITIVE_QUERY_PARAM_NAMES,
  redactSensitiveQueryParams,
  scrubPII,
  scrubPIIString,
} from "./pii";

describe("scrubPII", () => {
  it("masks sensitive root keys", () => {
    const ev: Record<string, unknown> = {
      password: "p1",
      token: "t1",
      email: "e@x.com",
      phone: "+380",
      keep: "keep-me",
    };
    scrubPII(ev);
    expect(ev["password"]).toBe(PII_REDACTED);
    expect(ev["token"]).toBe(PII_REDACTED);
    expect(ev["email"]).toBe(PII_REDACTED);
    expect(ev["phone"]).toBe(PII_REDACTED);
    expect(ev["keep"]).toBe("keep-me");
  });

  it("matches keys case-insensitively (HTTP header casings)", () => {
    const ev: Record<string, unknown> = {
      Authorization: "Bearer xxx",
      "Set-Cookie": "auth=yyy",
      "X-CSRF-Token": "csrf-zzz",
      "X-Mono-Webhook-Secret": "mono",
    };
    scrubPII(ev);
    expect(ev["Authorization"]).toBe(PII_REDACTED);
    expect(ev["Set-Cookie"]).toBe(PII_REDACTED);
    expect(ev["X-CSRF-Token"]).toBe(PII_REDACTED);
    expect(ev["X-Mono-Webhook-Secret"]).toBe(PII_REDACTED);
  });

  it("recurses into nested objects (Sentry event.contexts shape)", () => {
    const ev = {
      contexts: {
        runtime: { name: "node", version: "20" },
        userPayload: {
          email: "leak@example.com",
          profile: { phone: "+38099", token: "leaked" },
        },
      },
      extra: {
        debug: { connectionString: "postgres://…" },
        items: [{ password: "x" }, { token: "y" }],
      },
    };
    scrubPII(ev);

    const ctx = ev.contexts.userPayload as Record<string, unknown>;
    expect(ctx["email"]).toBe(PII_REDACTED);
    const profile = ctx["profile"] as Record<string, unknown>;
    expect(profile["phone"]).toBe(PII_REDACTED);
    expect(profile["token"]).toBe(PII_REDACTED);

    const debug = ev.extra.debug as Record<string, unknown>;
    expect(debug["connectionString"]).toBe(PII_REDACTED);
    const items = ev.extra.items as Array<Record<string, unknown>>;
    expect(items[0]!["password"]).toBe(PII_REDACTED);
    expect(items[1]!["token"]).toBe(PII_REDACTED);

    // Neutral fields untouched.
    expect((ev.contexts.runtime as Record<string, unknown>)["name"]).toBe(
      "node",
    );
  });

  it("nulls object-typed values for redacted keys (keeps Sentry UI stable)", () => {
    const ev: Record<string, unknown> = {
      token: { value: "deep", meta: { ts: 1 } },
    };
    scrubPII(ev);
    expect(ev["token"]).toBeNull();
  });

  it("survives cyclic references (Error.cause chains)", () => {
    type Cyc = { password: string; self?: Cyc };
    const a: Cyc = { password: "x" };
    a.self = a;
    expect(() => scrubPII(a)).not.toThrow();
    expect(a.password).toBe(PII_REDACTED);
  });

  it("ignores primitives / null / undefined", () => {
    expect(() => scrubPII(null)).not.toThrow();
    expect(() => scrubPII(undefined)).not.toThrow();
    expect(() => scrubPII("string")).not.toThrow();
    expect(() => scrubPII(42)).not.toThrow();
  });

  it("walks top-level arrays", () => {
    const arr: Array<Record<string, unknown>> = [
      { password: "p1" },
      { email: "u@x.com", keep: "ok" },
    ];
    scrubPII(arr);
    expect(arr[0]!["password"]).toBe(PII_REDACTED);
    expect(arr[1]!["email"]).toBe(PII_REDACTED);
    expect(arr[1]!["keep"]).toBe("ok");
  });
});

describe("REDACT_KEY_NAMES", () => {
  it("covers the canonical Class A + Class B fields from pii-handling.md", () => {
    // Spot-check: if any of these names ever disappears from the canonical
    // list, downstream redaction silently regresses. Documentation lives in
    // docs/security/pii-handling.md.
    const required = [
      "password",
      "token",
      "authorization",
      "cookie",
      "set-cookie",
      "x-csrf-token",
      "x-mono-webhook-secret",
      "email",
      "phone",
      "anthropicKey",
      // PR-49 (sentry-pii-roast 2026-05-13 §P0-S1): closing the gap that
      // `x-signature` / `otp` / `magicLink` were not in the canonical list.
      "x-signature",
      "otp",
      "otpCode",
      "verificationCode",
      "magicLink",
      "passwordResetToken",
      "pin",
    ];
    for (const name of required) {
      expect(REDACT_KEY_NAMES).toContain(name);
    }
  });
});

describe("scrubPIIString", () => {
  it("redacts the local-part of an email but preserves the domain hint", () => {
    expect(scrubPIIString("contact me at john.doe+tag@example.com today")).toBe(
      "contact me at [email redacted]@example.com today",
    );
  });

  it("redacts multiple emails in a single string", () => {
    expect(scrubPIIString("from a@x.com to b.c@y.io")).toBe(
      "from [email redacted]@x.com to [email redacted]@y.io",
    );
  });

  it("redacts telegram bot tokens (`<bot-id>:<35-char>`)", () => {
    const token = "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    expect(scrubPIIString(`telegram error: ${token} 401`)).toBe(
      "telegram error: [telegram-token redacted] 401",
    );
  });

  it("redacts JWT-shaped triples but ignores short identifier triples", () => {
    const jwt = `${"A".repeat(20)}.${"B".repeat(40)}.${"C".repeat(20)}`;
    expect(scrubPIIString(`auth failed: ${jwt}`)).toBe(
      "auth failed: [jwt redacted]",
    );
    // Short — not a JWT.
    expect(scrubPIIString("trace.id.short")).toBe("trace.id.short");
  });

  it("redacts AWS access key IDs (AKIA / ASIA / AROA prefixes)", () => {
    expect(scrubPIIString("uploaded with AKIAIOSFODNN7EXAMPLE")).toBe(
      "uploaded with [aws-key redacted]",
    );
    expect(scrubPIIString("temp creds: ASIAXXXXXXXXXXXXXXXX")).toBe(
      "temp creds: [aws-key redacted]",
    );
    expect(scrubPIIString("role: AROAJEXAMPLEKEYID123")).toBe(
      "role: [aws-key redacted]",
    );
  });

  it("redacts `Bearer <token>` substrings (axios upstream-failure traces)", () => {
    expect(scrubPIIString("upstream 401 Bearer eyJhbGciOiJIUzI1NiJ9_abc")).toBe(
      "upstream 401 Bearer [redacted]",
    );
    // Short bearer placeholder — left alone.
    expect(scrubPIIString("bearer short")).toBe("bearer short");
  });

  it("is a no-op for empty / non-string inputs", () => {
    expect(scrubPIIString("")).toBe("");
    expect(scrubPIIString("plain message with no PII")).toBe(
      "plain message with no PII",
    );
  });

  it("exposes its patterns for documentation / drift detection", () => {
    const names = PII_STRING_PATTERNS.map((p) => p.name);
    expect(names).toEqual([
      "email",
      "telegram-bot-token",
      "jwt",
      "aws-access-key",
      "bearer-token",
    ]);
  });
});

describe("redactSensitiveQueryParams", () => {
  it("redacts `token` and `api_key` in a magic-link callback URL", () => {
    expect(
      redactSensitiveQueryParams(
        "/auth/callback?token=abc123&api_key=xxx&ok=1",
      ),
    ).toBe(`/auth/callback?token=${PII_REDACTED}&api_key=${PII_REDACTED}&ok=1`);
  });

  it("redacts OAuth `code` and `state` (CSRF-bound)", () => {
    expect(
      redactSensitiveQueryParams(
        "https://example.com/auth/return?code=oauth-code-xxx&state=csrf-state",
      ),
    ).toBe(
      `https://example.com/auth/return?code=${PII_REDACTED}&state=${PII_REDACTED}`,
    );
  });

  it("matches param names case-insensitively", () => {
    expect(
      redactSensitiveQueryParams("/oauth?ApiKey=xxx&Access_Token=yyy"),
    ).toBe(`/oauth?ApiKey=${PII_REDACTED}&Access_Token=${PII_REDACTED}`);
  });

  it("preserves a `#fragment` suffix", () => {
    expect(redactSensitiveQueryParams("/auth/cb?token=abc#section")).toBe(
      `/auth/cb?token=${PII_REDACTED}#section`,
    );
  });

  it("is a no-op for URLs without a query string", () => {
    expect(redactSensitiveQueryParams("/api/me")).toBe("/api/me");
    expect(redactSensitiveQueryParams("")).toBe("");
  });

  it("leaves non-sensitive params untouched", () => {
    expect(redactSensitiveQueryParams("/list?page=2&sort=asc")).toBe(
      "/list?page=2&sort=asc",
    );
  });

  it("exposes a vetted list of sensitive param names", () => {
    expect(SENSITIVE_QUERY_PARAM_NAMES.has("token")).toBe(true);
    expect(SENSITIVE_QUERY_PARAM_NAMES.has("api_key")).toBe(true);
    expect(SENSITIVE_QUERY_PARAM_NAMES.has("verification_code")).toBe(true);
    // Sanity: a neutral param is NOT in the set.
    expect(SENSITIVE_QUERY_PARAM_NAMES.has("page")).toBe(false);
  });
});
