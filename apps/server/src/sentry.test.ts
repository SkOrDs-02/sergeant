import { describe, expect, it } from "vitest";
import { scrubPII } from "./sentry.js";

describe("scrubPII", () => {
  it("маскує sensitive ключі у root", () => {
    const ev: Record<string, unknown> = {
      password: "p1",
      token: "t1",
      email: "e@x.com",
      phone: "+380",
      keep: "keep-me",
    };
    scrubPII(ev);
    expect(ev.password).toBe("[redacted]");
    expect(ev.token).toBe("[redacted]");
    expect(ev.email).toBe("[redacted]");
    expect(ev.phone).toBe("[redacted]");
    expect(ev.keep).toBe("keep-me");
  });

  it("маскує ключі case-insensitive", () => {
    const ev: Record<string, unknown> = {
      Authorization: "Bearer xxx",
      "Set-Cookie": "auth=yyy",
      "X-CSRF-Token": "csrf-zzz",
    };
    scrubPII(ev);
    expect(ev.Authorization).toBe("[redacted]");
    expect(ev["Set-Cookie"]).toBe("[redacted]");
    expect(ev["X-CSRF-Token"]).toBe("[redacted]");
  });

  it("ходить рекурсивно у nested об'єкти (event.contexts/extra сценарій)", () => {
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
    expect(ctx.email).toBe("[redacted]");
    const profile = ctx.profile as Record<string, unknown>;
    expect(profile.phone).toBe("[redacted]");
    expect(profile.token).toBe("[redacted]");
    const debug = ev.extra.debug as Record<string, unknown>;
    expect(debug.connectionString).toBe("[redacted]");
    const items = ev.extra.items as Array<Record<string, unknown>>;
    expect(items[0]!.password).toBe("[redacted]");
    expect(items[1]!.token).toBe("[redacted]");
    // Не зачіпає neutral поля
    expect((ev.contexts.runtime as Record<string, unknown>).name).toBe("node");
  });

  it("не падає на циклічних посиланнях", () => {
    type Cyc = { password: string; self?: Cyc };
    const a: Cyc = { password: "x" };
    a.self = a;
    expect(() => scrubPII(a)).not.toThrow();
    expect(a.password).toBe("[redacted]");
  });

  it("ігнорує примітиви/null/undefined", () => {
    expect(() => scrubPII(null)).not.toThrow();
    expect(() => scrubPII(undefined)).not.toThrow();
    expect(() => scrubPII("string")).not.toThrow();
    expect(() => scrubPII(42)).not.toThrow();
  });

  it("обробляє масиви на верхньому рівні", () => {
    const arr: Array<Record<string, unknown>> = [
      { password: "p1" },
      { token: "t1", keep: "ok" },
    ];
    scrubPII(arr);
    expect(arr[0]!.password).toBe("[redacted]");
    expect(arr[1]!.token).toBe("[redacted]");
    expect(arr[1]!.keep).toBe("ok");
  });

  it("маскує об'єктні значення на null (зберігає shape для Sentry UI)", () => {
    const ev = {
      // У Sentry SDK може бути { authorization: { Bearer: "..." } }
      authorization: { Bearer: "xxx" },
    };
    scrubPII(ev);
    expect(ev.authorization).toBeNull();
  });
});
