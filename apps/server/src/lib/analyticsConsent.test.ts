// priv-09: кешована серверна перевірка `user_preferences.analytics`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db.js", () => ({ pool: { query: queryMock } }));

const loggerMock = vi.hoisted(() => ({ warn: vi.fn() }));
vi.mock("../obs/logger.js", () => ({ logger: loggerMock }));

import {
  ANALYTICS_CONSENT_TTL_MS,
  invalidateAnalyticsConsent,
  peekAnalyticsConsent,
  resetAnalyticsConsentForTests,
  resolveAnalyticsConsent,
} from "./analyticsConsent.js";

beforeEach(() => {
  resetAnalyticsConsentForTests();
  queryMock.mockReset();
  loggerMock.warn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("analyticsConsent", () => {
  it("analytics=true → згода; результат кешується (другий виклик без SQL)", async () => {
    queryMock.mockResolvedValue({ rows: [{ analytics: true }] });
    expect(peekAnalyticsConsent("u1")).toBeUndefined();
    expect(await resolveAnalyticsConsent("u1")).toBe(true);
    expect(peekAnalyticsConsent("u1")).toBe(true);
    expect(await resolveAnalyticsConsent("u1")).toBe(true);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["analytics=false", { rows: [{ analytics: false }] }],
    ["analytics=null", { rows: [{ analytics: null }] }],
    ["немає рядка (дефолт — без згоди)", { rows: [] }],
  ])("%s → згоди немає", async (_n, result) => {
    queryMock.mockResolvedValue(result);
    expect(await resolveAnalyticsConsent("u1")).toBe(false);
    expect(peekAnalyticsConsent("u1")).toBe(false);
  });

  it("збій БД → fail-closed і НЕ кешується", async () => {
    queryMock.mockRejectedValueOnce(new Error("db down"));
    expect(await resolveAnalyticsConsent("u1")).toBe(false);
    expect(peekAnalyticsConsent("u1")).toBeUndefined();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "analytics_consent_check_failed" }),
    );
    queryMock.mockResolvedValueOnce({ rows: [{ analytics: true }] });
    expect(await resolveAnalyticsConsent("u1")).toBe(true);
  });

  it("паралельні промахи одного користувача зливаються в один запит", async () => {
    queryMock.mockResolvedValue({ rows: [{ analytics: true }] });
    const results = await Promise.all([
      resolveAnalyticsConsent("u1"),
      resolveAnalyticsConsent("u1"),
      resolveAnalyticsConsent("u1"),
    ]);
    expect(results).toEqual([true, true, true]);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it("запис протухає після TTL", async () => {
    vi.useFakeTimers();
    queryMock.mockResolvedValue({ rows: [{ analytics: true }] });
    await resolveAnalyticsConsent("u1");
    vi.advanceTimersByTime(ANALYTICS_CONSENT_TTL_MS + 1);
    expect(peekAnalyticsConsent("u1")).toBeUndefined();
  });

  it("invalidate скидає кеш: відкликана згода діє одразу", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ analytics: true }] });
    await resolveAnalyticsConsent("u1");
    invalidateAnalyticsConsent("u1");
    expect(peekAnalyticsConsent("u1")).toBeUndefined();
    queryMock.mockResolvedValueOnce({ rows: [{ analytics: false }] });
    expect(await resolveAnalyticsConsent("u1")).toBe(false);
  });

  it("invalidate під час польоту запиту: застаріла відповідь у кеш не потрапляє", async () => {
    let release!: (v: unknown) => void;
    queryMock.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = resolveAnalyticsConsent("u1");
    invalidateAnalyticsConsent("u1");
    release({ rows: [{ analytics: true }] });
    await pending;
    expect(peekAnalyticsConsent("u1")).toBeUndefined();
  });
});
