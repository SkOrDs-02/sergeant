import { afterEach, describe, expect, it, vi } from "vitest";
import type { Express } from "express";

// sec-39: `Sentry.setupExpressErrorHandler` стоїть ПЕРЕД нашим errorHandler,
// і його дефолтний `shouldHandleError` рахує помилку без `.status` як 500.
// Тест перевіряє опцію, яку `attachSentryErrorHandler` РЕАЛЬНО передає в
// Sentry, а не окремий хелпер.
vi.mock("@sentry/node", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@sentry/node")>();
  return {
    ...actual,
    init: vi.fn(),
    setupExpressErrorHandler: vi.fn(),
  };
});

type HandlerOptions = { shouldHandleError?: (error: Error) => boolean };

async function capturedOptions(): Promise<HandlerOptions> {
  vi.resetModules();
  vi.stubEnv("SENTRY_DSN", "https://public@example.invalid/1");
  const Sentry = await import("@sentry/node");
  const { attachSentryErrorHandler } = await import("./sentry.js");
  const app = { use: vi.fn() } as unknown as Express;
  attachSentryErrorHandler(app);
  const setup = vi.mocked(Sentry.setupExpressErrorHandler);
  expect(setup).toHaveBeenCalledTimes(1);
  const [calledApp, options] = setup.mock.calls[0] ?? [];
  expect(calledApp).toBe(app);
  return (options ?? {}) as HandlerOptions;
}

function pgError(code: string): Error {
  return Object.assign(new Error("pg failure"), { code, severity: "ERROR" });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

vi.spyOn(console, "log").mockImplementation(() => {});

describe("attachSentryErrorHandler → shouldHandleError (sec-39)", () => {
  it("передає shouldHandleError у setupExpressErrorHandler", async () => {
    const options = await capturedOptions();
    expect(typeof options.shouldHandleError).toBe("function");
  });

  it("не шле в Sentry pg-помилки, які errorHandler мапить на 400/409/503", async () => {
    const { shouldHandleError } = await capturedOptions();
    expect(shouldHandleError?.(pgError("22P05"))).toBe(false);
    expect(shouldHandleError?.(pgError("23505"))).toBe(false);
    expect(
      shouldHandleError?.(new Error("wrap", { cause: pgError("23503") })),
    ).toBe(false);
    expect(shouldHandleError?.(pgError("40P01"))).toBe(false);
    expect(shouldHandleError?.(pgError("40001"))).toBe(false);
  });

  it("шле справжні 5xx: невідомий SQLSTATE, ZodError, звичайний Error", async () => {
    const { shouldHandleError } = await capturedOptions();
    const { z } = await import("zod");
    const zodErr = z.object({ a: z.number() }).safeParse({ a: "x" }).error;
    expect(shouldHandleError?.(pgError("42P01"))).toBe(true);
    expect(shouldHandleError?.(zodErr as Error)).toBe(true);
    expect(shouldHandleError?.(new Error("boom"))).toBe(true);
  });

  it("4xx із `.status` не шле, як і дефолт Sentry", async () => {
    const { shouldHandleError } = await capturedOptions();
    const badJson = Object.assign(new Error("bad json"), { status: 400 });
    expect(shouldHandleError?.(badJson)).toBe(false);
  });
});
