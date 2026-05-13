import { describe, expect, it } from "vitest";

import { PII_REDACTED, REDACT_KEY_NAMES, scrubPII } from "./pii";

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
    ];
    for (const name of required) {
      expect(REDACT_KEY_NAMES).toContain(name);
    }
  });
});
