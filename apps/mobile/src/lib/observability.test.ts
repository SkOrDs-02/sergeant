/**
 * Jest coverage for `initObservability` / `captureError` —
 * gating behaviour around `EXPO_PUBLIC_SENTRY_DSN`, Sentry handoff
 * when the DSN is set, and the `console.error` fallback in no-op mode.
 *
 * The DSN read lives in `./observability/env` so we can `jest.mock`
 * it here without fighting Expo's babel `EXPO_PUBLIC_*` env-inlining
 * plugin. `@sentry/react-native` is also mocked at module level so
 * we don't boot the native RNSentry bridge (unavailable under
 * jest-expo's node-side preset).
 */

jest.mock("@sentry/react-native", () => ({
  __esModule: true,
  init: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock("./observability/env", () => ({
  __esModule: true,
  getSentryDsn: jest.fn(),
}));

import * as Sentry from "@sentry/react-native";

import {
  __resetObservabilityForTests,
  applyMobileBeforeSend,
  captureError,
  initObservability,
  type MobileBeforeSendEvent,
} from "./observability";
import { getSentryDsn } from "./observability/env";

const initMock = Sentry.init as jest.Mock;
const captureExceptionMock = Sentry.captureException as jest.Mock;
const getSentryDsnMock = getSentryDsn as jest.Mock;

describe("observability", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    __resetObservabilityForTests();
    initMock.mockReset();
    captureExceptionMock.mockReset();
    getSentryDsnMock.mockReset();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  describe("initObservability", () => {
    it("is a no-op when EXPO_PUBLIC_SENTRY_DSN is absent and logs a diagnostic", () => {
      getSentryDsnMock.mockReturnValue(undefined);

      initObservability();

      expect(initMock).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[observability] sentry disabled (no DSN)",
      );
    });

    it("is a no-op when EXPO_PUBLIC_SENTRY_DSN is an empty string", () => {
      getSentryDsnMock.mockReturnValue("");

      initObservability();

      expect(initMock).not.toHaveBeenCalled();
    });

    it("calls Sentry.init with the DSN and the expected scaffold config when DSN is set", () => {
      getSentryDsnMock.mockReturnValue("https://example@sentry.io/1");

      initObservability();

      expect(initMock).toHaveBeenCalledTimes(1);
      const arg = initMock.mock.calls[0][0] as {
        dsn: string;
        enableAutoSessionTracking: boolean;
        tracesSampleRate: number;
        sendDefaultPii: boolean;
        beforeSend: (e: MobileBeforeSendEvent) => MobileBeforeSendEvent;
      };
      expect(arg.dsn).toBe("https://example@sentry.io/1");
      expect(arg.enableAutoSessionTracking).toBe(true);
      expect(arg.tracesSampleRate).toBe(0);
      // PII roast 2026-05-13 §P0-S5: mobile must opt out of default-PII
      // and run the beforeSend scrubber.
      expect(arg.sendDefaultPii).toBe(false);
      expect(typeof arg.beforeSend).toBe("function");
    });

    it("is idempotent — re-entry does not re-init Sentry", () => {
      getSentryDsnMock.mockReturnValue("https://example@sentry.io/1");

      initObservability();
      initObservability();
      initObservability();

      expect(initMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("captureError", () => {
    it("falls back to console.error when Sentry is not initialised", () => {
      getSentryDsnMock.mockReturnValue(undefined);
      initObservability(); // no-op path

      const err = new Error("boom");
      captureError(err, { componentStack: "stack" });

      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[observability] captureError",
        err,
        { componentStack: "stack" },
      );
    });

    it("forwards to Sentry.captureException with extras when Sentry is initialised", () => {
      getSentryDsnMock.mockReturnValue("https://example@sentry.io/1");
      initObservability();

      const err = new Error("kaboom");
      captureError(err, { foo: "bar" });

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(err, {
        extra: { foo: "bar" },
      });
      // Must not also hit console.error on the happy path.
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("falls back to console.error if Sentry.captureException throws", () => {
      getSentryDsnMock.mockReturnValue("https://example@sentry.io/1");
      initObservability();
      captureExceptionMock.mockImplementationOnce(() => {
        throw new Error("sentry down");
      });

      const err = new Error("kaboom");
      captureError(err);

      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[observability] captureError",
        err,
        undefined,
      );
    });

    it("accepts a missing context argument without throwing", () => {
      getSentryDsnMock.mockReturnValue(undefined);
      initObservability();

      expect(() => captureError(new Error("x"))).not.toThrow();
    });
  });

  describe("applyMobileBeforeSend (PII roast)", () => {
    it("drops request.data + request.cookies", () => {
      const ev: MobileBeforeSendEvent = {
        request: {
          data: { password: "p1" },
          cookies: { sid: "y" },
        },
      };
      applyMobileBeforeSend(ev);
      expect(ev.request?.data).toBeUndefined();
      expect(ev.request?.cookies).toBeUndefined();
    });

    it("scrubs Authorization + X-Signature headers", () => {
      const headers: Record<string, unknown> = {
        Authorization: "Bearer xxx",
        "X-Signature": "hmac-zzz",
        "Content-Type": "application/json",
      };
      const ev: MobileBeforeSendEvent = { request: { headers } };
      applyMobileBeforeSend(ev);
      expect(headers["Authorization"]).toBe("[redacted]");
      expect(headers["X-Signature"]).toBe("[redacted]");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("scrubs sensitive query-string params in request.url", () => {
      const ev: MobileBeforeSendEvent = {
        request: { url: "/auth/cb?token=abc&ok=1" },
      };
      applyMobileBeforeSend(ev);
      expect(ev.request?.url).toBe("/auth/cb?token=[redacted]&ok=1");
    });

    it("scrubs email in event.message", () => {
      const ev: MobileBeforeSendEvent = {
        message: "fetch failed for u@example.com",
      };
      applyMobileBeforeSend(ev);
      expect(ev.message).toBe("fetch failed for [email redacted]@example.com");
    });

    it("masks telegram bot token in exception.values[].value", () => {
      const token = "987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      const ev: MobileBeforeSendEvent = {
        exception: {
          values: [{ value: `push failed: ${token}` }],
        },
      };
      applyMobileBeforeSend(ev);
      expect(ev.exception?.values?.[0]?.value).toBe(
        "push failed: [telegram-token redacted]",
      );
    });

    it("normalises event.user to { id } only (strips email/ip_address)", () => {
      // Cast through `unknown` because real Sentry events carry richer
      // `user` shapes (email/phone/username) that we deliberately scrub.
      // `MobileBeforeSendEvent` keeps the surface narrow to keep the
      // applyMobileBeforeSend signature honest about what it *uses*.
      const ev: MobileBeforeSendEvent = {
        user: { id: "u-1", email: "leak@x.com", ip_address: "1.2.3.4" } as {
          id?: string | number;
          ip_address?: string;
        },
      };
      applyMobileBeforeSend(ev);
      expect(ev.user).toEqual({ id: "u-1" });
    });
  });
});
