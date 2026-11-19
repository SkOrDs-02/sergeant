// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.hoisted(() => vi.fn());
vi.mock("./sentry.js", () => ({ captureException }));

import {
  BOOT_WATCHDOG_REPORT_KEY,
  parseBootWatchdogReport,
  reportBootWatchdogIfAny,
} from "./bootWatchdogReport";

describe("bootWatchdogReport", () => {
  beforeEach(() => {
    sessionStorage.clear();
    captureException.mockReset();
  });

  it("без звіту нічого не шле", () => {
    expect(reportBootWatchdogIfAny()).toBe(false);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("шле звіт один раз і видаляє його", () => {
    sessionStorage.setItem(
      BOOT_WATCHDOG_REPORT_KEY,
      JSON.stringify({
        at: 1,
        rs: "loading",
        ctl: true,
        act: "bypass",
        snap: { pending: 2 },
      }),
    );
    expect(reportBootWatchdogIfAny()).toBe(true);
    expect(captureException).toHaveBeenCalledOnce();
    const hint = captureException.mock.calls[0]?.[1];
    expect(hint.tags["boot_watchdog.action"]).toBe("bypass");
    expect(hint.extra.report.snap).toEqual({ pending: 2 });
    expect(sessionStorage.getItem(BOOT_WATCHDOG_REPORT_KEY)).toBeNull();
    expect(reportBootWatchdogIfAny()).toBe(false);
  });

  it("сміття і завеликий payload відкидає", () => {
    expect(parseBootWatchdogReport("{oops")).toBeNull();
    expect(parseBootWatchdogReport('{"rs":"x"}')).toBeNull();
    expect(parseBootWatchdogReport("x".repeat(30_000))).toBeNull();
    expect(parseBootWatchdogReport(null)).toBeNull();
  });

  it("невідому дію зводить до none", () => {
    expect(parseBootWatchdogReport('{"at":1,"act":"rm -rf"}')?.act).toBe(
      "none",
    );
  });
});
