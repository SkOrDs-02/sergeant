import { describe, expect, it } from "vitest";
import type { Breadcrumb, ErrorEvent } from "@sentry/node";
import {
  applyBeforeBreadcrumb,
  applyBeforeSend,
  resolveSentryRelease,
  scrubPII,
} from "./sentry.js";

function makeEvent(overrides: Partial<ErrorEvent> = {}): ErrorEvent {
  return { type: undefined, ...overrides } as ErrorEvent;
}

// L9 — Sentry release tag must be the deployed git SHA so source-map lookup
// and incident attribution are deterministic across deploys. Helper is pure
// (takes env), so we don't need Sentry mocks here.
describe("resolveSentryRelease (L9)", () => {
  it("повертає `SENTRY_RELEASE` коли він явно заданий (override)", () => {
    expect(
      resolveSentryRelease({
        SENTRY_RELEASE: "v1.2.3",
        GITHUB_SHA: "deadbeef",
      }),
    ).toBe("v1.2.3");
  });

  it("віддає перевагу Railway SHA коли немає явного `SENTRY_RELEASE`", () => {
    expect(
      resolveSentryRelease({
        RAILWAY_GIT_COMMIT_SHA: "abc123",
        VERCEL_GIT_COMMIT_SHA: "def456",
        GITHUB_SHA: "ghi789",
      }),
    ).toBe("abc123");
  });

  it("падає на Vercel SHA коли немає Railway", () => {
    expect(
      resolveSentryRelease({
        VERCEL_GIT_COMMIT_SHA: "def456",
        GITHUB_SHA: "ghi789",
      }),
    ).toBe("def456");
  });

  it("падає на GITHUB_SHA коли немає host-specific SHA (mobile-shell CI)", () => {
    expect(resolveSentryRelease({ GITHUB_SHA: "ghi789" })).toBe("ghi789");
  });

  it("повертає undefined коли жодне змінне не задано", () => {
    expect(resolveSentryRelease({})).toBeUndefined();
  });

  it("ігнорує порожні рядки і whitespace-only значення", () => {
    expect(
      resolveSentryRelease({
        SENTRY_RELEASE: "",
        RAILWAY_GIT_COMMIT_SHA: "   ",
        VERCEL_GIT_COMMIT_SHA: "real-sha",
      }),
    ).toBe("real-sha");
  });

  it("trim-ить пробіли у валідному значенні", () => {
    expect(resolveSentryRelease({ SENTRY_RELEASE: "  v1.2.3  " })).toBe(
      "v1.2.3",
    );
  });
});

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

describe("applyBeforeSend", () => {
  it("видаляє request.data і request.cookies (raw body / cookie jar)", () => {
    const ev = makeEvent({
      request: {
        url: "/api/me",
        data: { password: "leak" },
        cookies: { session: "leak" },
        headers: { "user-agent": "vitest" },
      },
    });
    const out = applyBeforeSend(ev);
    expect(out.request?.data).toBeUndefined();
    expect(out.request?.cookies).toBeUndefined();
    // headers не видаляємо — тільки скрабимо PII-значення.
    expect(out.request?.headers).toBeDefined();
  });

  it("скрабить sensitive headers (Authorization/Cookie)", () => {
    const ev = makeEvent({
      request: {
        url: "/api/me",
        headers: {
          authorization: "Bearer xxx",
          cookie: "session=yyy",
          "user-agent": "vitest",
        },
      },
    });
    const out = applyBeforeSend(ev);
    const headers = out.request!.headers as Record<string, unknown>;
    expect(headers.authorization).toBe("[redacted]");
    expect(headers.cookie).toBe("[redacted]");
    expect(headers["user-agent"]).toBe("vitest");
  });

  // ── C1 — URL redaction для secret-bearing path-ів ────────────
  // `docs/security/hardening/C1-mono-webhook-secret-in-url.md`
  // Sentry capture-ить `req.originalUrl` у `event.request.url`. Якщо webhook
  // прийшов на /api/mono/webhook/<secret>, без нашого хука секрет потрапив би
  // в Sentry-ingest (≥ 90 днів retention за замовчуванням).

  it("C1: маскує секрет у event.request.url для /api/mono/webhook/<secret>", () => {
    const ev = makeEvent({
      request: { url: "/api/mono/webhook/abc-very-secret-123" },
    });
    const out = applyBeforeSend(ev);
    expect(out.request?.url).toBe("/api/mono/webhook/[redacted]");
  });

  it("C1: зберігає query-string при редакції webhook URL", () => {
    const ev = makeEvent({
      request: { url: "/api/mono/webhook/abc?retry=2" },
    });
    const out = applyBeforeSend(ev);
    expect(out.request?.url).toBe("/api/mono/webhook/[redacted]?retry=2");
  });

  it("C1: маскує versioned-path /api/v1/mono/webhook/<secret>", () => {
    const ev = makeEvent({
      request: { url: "/api/v1/mono/webhook/secret-from-old-monobank-config" },
    });
    const out = applyBeforeSend(ev);
    expect(out.request?.url).toBe("/api/v1/mono/webhook/[redacted]");
  });

  it("C1: не чіпає URL без secret-prefix-у", () => {
    const ev = makeEvent({
      request: { url: "/api/finyk/transactions?from=2026-01-01" },
    });
    const out = applyBeforeSend(ev);
    expect(out.request?.url).toBe("/api/finyk/transactions?from=2026-01-01");
  });

  it("C1: працює, коли request.url відсутній (only-error-event)", () => {
    const ev = makeEvent({ request: undefined });
    const out = applyBeforeSend(ev);
    expect(out.request).toBeUndefined();
  });

  it("залишає тільки user.id (event.user re-shape)", () => {
    const ev = makeEvent({
      user: {
        id: "user_42",
        email: "leak@example.com",
        ip_address: "1.2.3.4",
      },
    });
    const out = applyBeforeSend(ev);
    expect(out.user).toEqual({ id: "user_42" });
  });

  it("скрабить event.extra рекурсивно", () => {
    const ev = makeEvent({
      extra: {
        debug: { connectionString: "postgres://x", keep: "ok" },
      },
    });
    const out = applyBeforeSend(ev);
    const debug = (out.extra as { debug: Record<string, unknown> }).debug;
    expect(debug.connectionString).toBe("[redacted]");
    expect(debug.keep).toBe("ok");
  });
});

describe("applyBeforeBreadcrumb", () => {
  it("видаляє request_body_size / response_body_size з http breadcrumb-у", () => {
    const bc: Breadcrumb = {
      category: "http",
      data: {
        url: "/api/me",
        request_body_size: 42,
        response_body_size: 100,
      },
    };
    const out = applyBeforeBreadcrumb(bc);
    expect(out?.data?.request_body_size).toBeUndefined();
    expect(out?.data?.response_body_size).toBeUndefined();
  });

  it("C1: маскує URL з секретом у http breadcrumb (outbound axios/fetch)", () => {
    const bc: Breadcrumb = {
      category: "http",
      data: {
        url: "/api/mono/webhook/leaked-secret-abc",
        method: "POST",
      },
    };
    const out = applyBeforeBreadcrumb(bc);
    expect(out?.data?.url).toBe("/api/mono/webhook/[redacted]");
  });

  it("не чіпає не-http breadcrumb-и (console/navigation)", () => {
    const bc: Breadcrumb = {
      category: "console",
      message: "log line",
      data: { foo: "bar" },
    };
    const out = applyBeforeBreadcrumb(bc);
    expect(out?.data?.foo).toBe("bar");
  });

  it("повертає breadcrumb without data незмінним", () => {
    const bc: Breadcrumb = { category: "http" };
    const out = applyBeforeBreadcrumb(bc);
    expect(out).toEqual({ category: "http" });
  });
});
