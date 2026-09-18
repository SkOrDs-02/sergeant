// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Logger-contract тести:
 *   - DEV: `logger.{debug,info,warn,error}` → `console.{debug,info,warn,error}`,
 *     Sentry-breadcrumb / `captureException` НЕ викликаються.
 *   - production: console-шлях вимкнено; натомість `addSentryBreadcrumb`
 *     отримує наш `category: "web.logger"` breadcrumb, а серед аргументів
 *     `Error` → `captureException` приймає його як основний payload.
 *
 * `core/observability/sentry` замоканий — повертаємо vi.fn-stub-и, щоб
 * перевірити саме контракт виклику.
 */

const addSentryBreadcrumb = vi.fn();
const captureException = vi.fn();

vi.mock("../../../core/observability/sentry", () => ({
  addSentryBreadcrumb,
  captureException,
}));

beforeEach(() => {
  addSentryBreadcrumb.mockReset();
  captureException.mockReset();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("logger (DEV mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", true);
  });

  it("logger.debug → console.debug; Sentry не зачіпається", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.debug("[scope] hello", { meta: 1 });

    expect(spy).toHaveBeenCalledWith("[scope] hello", { meta: 1 });
    expect(addSentryBreadcrumb).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("logger.warn → console.warn; Sentry не зачіпається", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.warn("[scope] oops", new Error("boom"));

    expect(spy).toHaveBeenCalledTimes(1);
    expect(addSentryBreadcrumb).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("logger.error → console.error; Sentry.captureException не викликається у DEV", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { logger } = await import("./logger");
    const err = new Error("boom");

    logger.error("[scope] failure", err);

    expect(spy).toHaveBeenCalledWith("[scope] failure", err);
    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("logger (production mode)", () => {
  beforeEach(() => {
    vi.stubEnv("DEV", false);
  });

  it("logger.debug — повний no-op (нічого не пише)", async () => {
    const spy = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.debug("[scope] hidden", { meta: 1 });

    expect(spy).not.toHaveBeenCalled();
    expect(addSentryBreadcrumb).not.toHaveBeenCalled();
  });

  it("logger.warn → addSentryBreadcrumb({level:'warning'})", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { logger } = await import("./logger");

    logger.warn("[push] subscribe failed:", "network");

    expect(consoleSpy).not.toHaveBeenCalled();
    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    const call = addSentryBreadcrumb.mock.calls[0]?.[0] as {
      category: string;
      level: string;
      message: string;
    };
    expect(call.category).toBe("web.logger");
    expect(call.level).toBe("warning");
    expect(call.message).toContain("[push] subscribe failed:");
  });

  it("logger.info → addSentryBreadcrumb({level:'info'})", async () => {
    const { logger } = await import("./logger");

    logger.info("[analytics]", { name: "login" });

    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    const call = addSentryBreadcrumb.mock.calls[0]?.[0] as { level: string };
    expect(call.level).toBe("info");
  });

  it("logger.error з Error → captureException(err) + breadcrumb(level:'error')", async () => {
    const { logger } = await import("./logger");
    const err = new Error("network down");

    logger.error("[chunkReload]", err);

    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    const bc = addSentryBreadcrumb.mock.calls[0]?.[0] as { level: string };
    expect(bc.level).toBe("error");
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException).toHaveBeenCalledWith(err);
  });

  it("logger.error без Error — breadcrumb є, але captureException не викликається", async () => {
    const { logger } = await import("./logger");

    logger.error("[scope] something", { reason: "string-only" });

    expect(addSentryBreadcrumb).toHaveBeenCalledTimes(1);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("Breadcrumb-throw не пропагується назовні (захист контракту)", async () => {
    addSentryBreadcrumb.mockImplementation(() => {
      throw new Error("sentry exploded");
    });
    const { logger } = await import("./logger");

    expect(() => logger.warn("[scope] x")).not.toThrow();
  });
});
