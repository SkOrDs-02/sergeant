// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PRODUCT_MEMORY_SYNC_EVENTS,
  shouldSyncEventToMemory,
  syncEventToMemory,
} from "./productMemorySync";
import { ANALYTICS_EVENTS } from "@sergeant/shared";

describe("productMemorySync — shouldSyncEventToMemory", () => {
  it("повертає true для подій з allowlist", () => {
    expect(shouldSyncEventToMemory(ANALYTICS_EVENTS.ONBOARDING_COMPLETED)).toBe(
      true,
    );
    expect(
      shouldSyncEventToMemory(ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED),
    ).toBe(true);
    expect(shouldSyncEventToMemory(ANALYTICS_EVENTS.SIGNUP_COMPLETED)).toBe(
      true,
    );
    expect(shouldSyncEventToMemory(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED)).toBe(
      true,
    );
  });

  it("повертає false для довільних подій", () => {
    expect(shouldSyncEventToMemory("expense_added")).toBe(false);
    expect(shouldSyncEventToMemory("page_view")).toBe(false);
    expect(shouldSyncEventToMemory("")).toBe(false);
  });

  it("expose-ить allowlist у Set-формі (test-friendly)", () => {
    expect(PRODUCT_MEMORY_SYNC_EVENTS).toBeInstanceOf(Set);
    expect(PRODUCT_MEMORY_SYNC_EVENTS.size).toBeGreaterThanOrEqual(3);
  });
});

describe("productMemorySync — syncEventToMemory", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch | undefined;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    globalThis.fetch = fetchMock as unknown as typeof globalThis.fetch;
  });

  afterEach(() => {
    if (originalFetch) globalThis.fetch = originalFetch;
    else delete (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
  });

  it("POST-ить на /api/ai-memory/event-sync для allowlist-event", () => {
    syncEventToMemory(ANALYTICS_EVENTS.ONBOARDING_COMPLETED, {
      intent: "vibe_picked",
      picksCount: 2,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/ai-memory/event-sync");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(init.keepalive).toBe(true);
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    );
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe(
      "XMLHttpRequest",
    );
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      eventName: "onboarding_completed",
      payload: { intent: "vibe_picked", picksCount: 2 },
    });
  });

  it("НЕ дзвонить fetch для подій поза allowlist", () => {
    syncEventToMemory("expense_added", { amount_kop: 100 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("НЕ кидає коли fetch повертає rejected promise (network drop)", async () => {
    // Створюємо rejected-promise через `.catch(() => Promise.reject())`,
    // щоб обʼєкт-rejection-у мав хоча б один handler перед event-loop-ом
    // ловлячи unhandled-rejection. Виробничий код кріпить .catch() сам,
    // але mock повертає raw promise, який тест має закрити.
    fetchMock.mockImplementationOnce(() => {
      const p = Promise.reject(new Error("network_down"));
      // Підвʼязуємо catch одразу, щоб vitest не репортував unhandled.
      // Production-код у `syncEventToMemory` робить це сам (.catch()),
      // але тест має imitate-ити тільки сам call — і ми хочемо
      // переконатись, що caller-функція не throw-ить синхронно.
      p.catch(() => {});
      return p;
    });
    expect(() => {
      syncEventToMemory(ANALYTICS_EVENTS.SIGNUP_COMPLETED, { method: "email" });
    }).not.toThrow();
    // Дозволяє event-loop-у завершити microtask-черга з rejected promise.
    await new Promise((r) => setTimeout(r, 0));
  });

  it("НЕ кидає коли fetch синхронно throw-ає (CSP/lock-tab)", () => {
    fetchMock.mockImplementationOnce(() => {
      throw new Error("csp_violation");
    });
    expect(() => {
      syncEventToMemory(ANALYTICS_EVENTS.FIRST_ACTION_COMPLETED, {
        module: "finyk",
      });
    }).not.toThrow();
  });

  it("ігнорує порожній/невалідний eventName", () => {
    syncEventToMemory("", { a: 1 });
    syncEventToMemory(null as unknown as string, { a: 1 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("використовує {} як default payload коли caller не передає", () => {
    syncEventToMemory(ANALYTICS_EVENTS.SIGNUP_COMPLETED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.payload).toEqual({});
  });
});
