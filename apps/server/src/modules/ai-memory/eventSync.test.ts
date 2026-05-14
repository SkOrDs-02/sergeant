import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRODUCT_MEMORY_EVENTS,
  buildProductSourceRef,
  checkPayloadSize,
  dayKeyKyiv,
  formatEventAsMemoryText,
  isProductMemoryEvent,
  recordProductMemoryEvent,
  sanitizeEventPayload,
} from "./eventSync.js";

const { enqueueStub } = vi.hoisted(() => ({
  enqueueStub: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
}));

vi.mock("./ingestQueue.js", () => ({
  enqueueMemoryIngest: enqueueStub,
}));

const fakePool = {} as unknown as import("pg").Pool;

describe("eventSync — isProductMemoryEvent + allowlist", () => {
  it("повертає true для відомих подій", () => {
    for (const name of PRODUCT_MEMORY_EVENTS) {
      expect(isProductMemoryEvent(name)).toBe(true);
    }
  });

  it("повертає false для довільних рядків", () => {
    expect(isProductMemoryEvent("evil_event")).toBe(false);
    expect(isProductMemoryEvent("")).toBe(false);
    expect(isProductMemoryEvent("ONBOARDING_COMPLETED")).toBe(false);
  });
});

describe("eventSync — dayKeyKyiv", () => {
  it("формує YYYY-MM-DD у Europe/Kyiv", () => {
    // 2026-05-13 19:00 UTC → 22:00 Kyiv same day
    const utc = new Date("2026-05-13T19:00:00.000Z");
    expect(dayKeyKyiv(utc)).toBe("2026-05-13");
  });

  it("враховує перетин півночі по Київському часу", () => {
    // 23:00 UTC → 02:00 Kyiv наступного дня
    const utc = new Date("2026-05-13T23:00:00.000Z");
    expect(dayKeyKyiv(utc)).toBe("2026-05-14");
  });
});

describe("eventSync — sanitizeEventPayload (PII)", () => {
  it("видаляє email/password/apiKey глибоко", () => {
    const out = sanitizeEventPayload({
      module: "finyk",
      email: "founder@example.com",
      password: "hunter2",
      nested: { apiKey: "sk-secret", harmless: 42 },
    });
    expect(out["module"]).toBe("finyk");
    expect(out["email"]).toBe("[redacted]");
    expect(out["password"]).toBe("[redacted]");
    expect((out["nested"] as Record<string, unknown>)["apiKey"]).toBe(
      "[redacted]",
    );
    expect((out["nested"] as Record<string, unknown>)["harmless"]).toBe(42);
  });

  it("повертає {} для нерозпарсених/невалідних payload-ів", () => {
    expect(sanitizeEventPayload(undefined)).toEqual({});
    expect(sanitizeEventPayload({} as Record<string, unknown>)).toEqual({});
  });

  it("не мутує оригінальний payload (deep clone)", () => {
    const original = { email: "a@b.com", module: "fizruk" };
    const out = sanitizeEventPayload(original);
    expect(original["email"]).toBe("a@b.com");
    expect(out["email"]).toBe("[redacted]");
  });
});

describe("eventSync — formatEventAsMemoryText", () => {
  const now = new Date("2026-05-13T12:00:00.000Z");

  it("форматує signup_completed з method", () => {
    const out = formatEventAsMemoryText(
      "signup_completed",
      { method: "email" },
      now,
    );
    expect(out.content).toContain("2026-05-13");
    expect(out.content).toContain("signup");
    expect(out.content).toContain("email");
    expect(out.metadata).toMatchObject({
      event: "signup_completed",
      method: "email",
    });
  });

  it("форматує onboarding_completed з intent та picksCount", () => {
    const out = formatEventAsMemoryText(
      "onboarding_completed",
      { intent: "vibe_picked", picksCount: 3 },
      now,
    );
    expect(out.content).toContain("completed onboarding");
    expect(out.content).toContain("3 module picks");
    expect(out.content).toContain("vibe_picked");
    expect(out.metadata).toMatchObject({
      event: "onboarding_completed",
      intent: "vibe_picked",
      picksCount: 3,
    });
  });

  it("форматує first_action_completed з module", () => {
    const out = formatEventAsMemoryText(
      "first_action_completed",
      { module: "finyk" },
      now,
    );
    expect(out.content).toContain("first action completed");
    expect(out.content).toContain("finyk");
    expect(out.metadata).toMatchObject({
      event: "first_action_completed",
      module: "finyk",
    });
  });

  it("форматує subscription_started з plan + source", () => {
    const out = formatEventAsMemoryText(
      "subscription_started",
      { plan: "monthly", source: "paywall" },
      now,
    );
    expect(out.content).toContain("subscription started");
    expect(out.content).toContain("monthly");
    expect(out.content).toContain("paywall");
    expect(out.metadata).toMatchObject({
      event: "subscription_started",
      plan: "monthly",
      source: "paywall",
    });
  });

  it("витирає PII при форматуванні", () => {
    const out = formatEventAsMemoryText(
      "first_action_completed",
      { module: "nutrition", email: "leaked@example.com" },
      now,
    );
    expect(out.content).not.toContain("leaked@example.com");
  });

  it("використовує fallback `unknown` для пропущених полей", () => {
    const out = formatEventAsMemoryText("signup_completed", undefined, now);
    expect(out.content).toContain("email");
    expect(out.metadata["event"]).toBe("signup_completed");
  });
});

describe("eventSync — buildProductSourceRef", () => {
  it("формує канонічну форму", () => {
    const ref = buildProductSourceRef(
      "onboarding_completed",
      "user_123",
      "2026-05-13",
    );
    expect(ref).toBe("onboarding_completed:user_123:2026-05-13");
  });
});

describe("eventSync — checkPayloadSize", () => {
  it("ok для невеликих payload-ів", () => {
    expect(checkPayloadSize({ a: 1, b: "x" })).toEqual({ ok: true });
  });

  it("ok для undefined", () => {
    expect(checkPayloadSize(undefined)).toEqual({ ok: true });
  });

  it("відмова на >4KB", () => {
    const big = { blob: "x".repeat(5000) };
    const result = checkPayloadSize(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("too_large");
  });
});

describe("eventSync — recordProductMemoryEvent", () => {
  beforeEach(() => {
    enqueueStub.mockClear();
    enqueueStub.mockImplementation(async () => {});
  });

  it("enqueueує product event у memory ingest queue", async () => {
    const result = await recordProductMemoryEvent(fakePool, {
      userId: "user_abc",
      eventName: "onboarding_completed",
      payload: { intent: "vibe_picked", picksCount: 2 },
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    expect(result.enqueued).toBe(true);
    expect(result.sourceRef).toBe("onboarding_completed:user_abc:2026-05-13");
    expect(enqueueStub).toHaveBeenCalledTimes(1);
    const call = enqueueStub.mock.calls[0]?.[0] as {
      userId: string;
      source: string;
      sourceRef: string | null;
      content: string;
      metadata: Record<string, unknown>;
    };
    expect(call.userId).toBe("user_abc");
    expect(call.source).toBe("product");
    expect(call.sourceRef).toBe("onboarding_completed:user_abc:2026-05-13");
    expect(call.content).toContain("completed onboarding");
    expect(call.metadata).toMatchObject({
      event: "onboarding_completed",
      intent: "vibe_picked",
    });
  });

  it("чистить PII з payload перед enqueueом", async () => {
    await recordProductMemoryEvent(fakePool, {
      userId: "user_xyz",
      eventName: "signup_completed",
      payload: { method: "email", email: "founder@example.com" },
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    const call = enqueueStub.mock.calls[0]?.[0] as {
      content: string;
      metadata: Record<string, unknown>;
    };
    expect(call.content).not.toContain("founder@example.com");
    expect(call.metadata).not.toHaveProperty("email");
  });

  it("повертає enqueued=false для невідомих подій без throw", async () => {
    const result = await recordProductMemoryEvent(fakePool, {
      userId: "user_x",
      // @ts-expect-error — навмисно невалідний event для defense-in-depth
      eventName: "evil_event",
      payload: {},
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    expect(result.enqueued).toBe(false);
    expect(enqueueStub).not.toHaveBeenCalled();
  });

  it("повертає enqueued=false якщо enqueueMemoryIngest throw-нув (best-effort)", async () => {
    enqueueStub.mockImplementationOnce(async () => {
      throw new Error("redis_down");
    });
    const result = await recordProductMemoryEvent(fakePool, {
      userId: "user_q",
      eventName: "first_action_completed",
      payload: { module: "finyk" },
      now: new Date("2026-05-13T12:00:00.000Z"),
    });
    expect(result.enqueued).toBe(false);
    expect(result.sourceRef).toBe("first_action_completed:user_q:2026-05-13");
  });
});
