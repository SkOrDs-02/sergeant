/**
 * PR-38 — тести Voyage soft daily-budget gate-у:
 *
 *   1. `getVoyageDailyUsageUsd()` — sum по поточній UTC-добі;
 *      day rollover скидає bucket.
 *   2. `checkVoyageSoftBudget()` — allow/skip-логіка по criticality.
 *   3. Idempotent Sentry alert — один warning на (day, threshold).
 *   4. Soft-cap = 0 → gate no-op (allow=true завжди).
 *   5. Negative/NaN env → fallback на default ($1) через `floatFromEnv`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const ENV_VARS = [
  "VOYAGE_DAILY_BUDGET_USD_SOFT",
  "VOYAGE_DAILY_BUDGET_USD_HARD",
  "VOYAGE_MONTHLY_BUDGET_USD",
] as const;
const savedEnv: Record<string, string | undefined> = {};

const { captureMessageMock } = vi.hoisted(() => ({
  captureMessageMock: vi.fn(),
}));
vi.mock("../../sentry.js", () => ({
  Sentry: { captureMessage: captureMessageMock },
}));

beforeEach(() => {
  for (const k of ENV_VARS) savedEnv[k] = process.env[k];
  for (const k of ENV_VARS) delete process.env[k];
  captureMessageMock.mockClear();
  vi.resetModules();
});

afterEach(() => {
  for (const k of ENV_VARS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.useRealTimers();
});

describe("getVoyageSoftBudgetUsd() — PR-38", () => {
  it("повертає $1 fallback коли env unset (sensible default — захист від runaway)", async () => {
    const { getVoyageSoftBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageSoftBudgetUsd()).toBe(1);
  });

  it("читає env-value коли валідне float-число", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "3.5";
    const { getVoyageSoftBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageSoftBudgetUsd()).toBe(3.5);
  });

  it("повертає 0 (=вимкнено) коли env-значення <= 0", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "0";
    const { getVoyageSoftBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageSoftBudgetUsd()).toBe(0);
  });

  it("повертає 0 для негативних значень (захист від інверсії логіки в alert-expr)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "-2";
    const { getVoyageSoftBudgetUsd } = await import("./voyageBudget.js");
    // env.ts:floatFromEnv(1) пропускає -2, бо isFinite. У budget-функції
    // ми нормалізуємо <= 0 → 0 (вимкнено).
    expect(getVoyageSoftBudgetUsd()).toBe(0);
  });

  it("fallback-ить коли env-значення не парситься як float", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "not-a-number";
    const { getVoyageSoftBudgetUsd } = await import("./voyageBudget.js");
    // floatFromEnv → NaN → defaultValue=1.
    expect(getVoyageSoftBudgetUsd()).toBe(1);
  });
});

describe("getVoyageDailyUsageUsd() — PR-38", () => {
  it("повертає 0 коли жодного запису немає", async () => {
    const { getVoyageDailyUsageUsd, __resetVoyageBudgetState } =
      await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    expect(getVoyageDailyUsageUsd()).toBe(0);
  });

  it("акумулює USD-витрати по поточній UTC-добі", async () => {
    const {
      addVoyageDailyUsageUsd,
      getVoyageDailyUsageUsd,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(0.3);
    addVoyageDailyUsageUsd(0.2);
    addVoyageDailyUsageUsd(0.5);
    expect(getVoyageDailyUsageUsd()).toBeCloseTo(1.0, 9);
  });

  it("ignores zero/negative/NaN USD-deltas (не псуємо bucket)", async () => {
    const {
      addVoyageDailyUsageUsd,
      getVoyageDailyUsageUsd,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(0.1);
    addVoyageDailyUsageUsd(0);
    addVoyageDailyUsageUsd(-5);
    addVoyageDailyUsageUsd(Number.NaN);
    addVoyageDailyUsageUsd(Number.POSITIVE_INFINITY);
    expect(getVoyageDailyUsageUsd()).toBeCloseTo(0.1, 9);
  });

  it("day rollover (UTC midnight) скидає bucket до 0", async () => {
    const {
      addVoyageDailyUsageUsd,
      getVoyageDailyUsageUsd,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const day1 = Date.UTC(2026, 4, 13, 12, 0, 0);
    const day2 = Date.UTC(2026, 4, 14, 0, 30, 0);

    addVoyageDailyUsageUsd(2.0, day1);
    addVoyageDailyUsageUsd(0.5, day1);
    expect(getVoyageDailyUsageUsd(day1)).toBeCloseTo(2.5, 9);

    // Новий день → bucket reset-ить (prune stale-ключі при add).
    addVoyageDailyUsageUsd(0.1, day2);
    expect(getVoyageDailyUsageUsd(day2)).toBeCloseTo(0.1, 9);
    // Старий day-bucket теж prune-нутий (через add-time GC).
    expect(getVoyageDailyUsageUsd(day1)).toBe(0);
  });
});

describe("checkVoyageSoftBudget() — PR-38 thresholds", () => {
  it("allow=true коли usage <= threshold (precondition: не torch-имо нормальний траффік)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(0.5);

    const result = checkVoyageSoftBudget({ criticality: "non-critical" });
    expect(result.allow).toBe(true);
    expect(result.overSoftLimit).toBe(false);
    expect(result.usage).toBeCloseTo(0.5, 9);
    expect(result.threshold).toBe(1);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("non-critical виклик SKIP-ить коли usage > threshold (allow=false)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(1.5);

    const result = checkVoyageSoftBudget({ criticality: "non-critical" });
    expect(result.allow).toBe(false);
    expect(result.overSoftLimit).toBe(true);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it("critical виклик ВСЕ ОДНО пропускає (UX > soft-budget) — alert fire-иться але allow=true", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(1.5);

    const result = checkVoyageSoftBudget({ criticality: "critical" });
    expect(result.allow).toBe(true);
    expect(result.overSoftLimit).toBe(true);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it("soft-cap = 0 (вимкнено) → завжди allow=true, alert не fire-иться навіть при будь-якому usage", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "0";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(100);

    const result = checkVoyageSoftBudget({ criticality: "non-critical" });
    expect(result.allow).toBe(true);
    expect(result.overSoftLimit).toBe(false);
    expect(result.threshold).toBe(0);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("exactly-AT-threshold (usage === threshold) НЕ fire-ить (поріг ексклюзивний `>`)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(1);

    const result = checkVoyageSoftBudget({ criticality: "non-critical" });
    expect(result.allow).toBe(true);
    expect(result.overSoftLimit).toBe(false);
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});

describe("checkVoyageSoftBudget() — PR-38 Sentry idempotency", () => {
  it("emits Sentry warning ОДИН раз на (day, threshold) навіть при 100 viklik-ах", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(2);

    for (let i = 0; i < 100; i++) {
      checkVoyageSoftBudget({ criticality: "non-critical" });
    }
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it("fresh day → fresh Sentry alert (anti-spam-прапор очищується при day rollover)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const day1 = Date.UTC(2026, 4, 13, 12, 0, 0);
    const day2 = Date.UTC(2026, 4, 14, 12, 0, 0);

    addVoyageDailyUsageUsd(2, day1);
    checkVoyageSoftBudget({ criticality: "non-critical", now: day1 });
    checkVoyageSoftBudget({ criticality: "non-critical", now: day1 });
    expect(captureMessageMock).toHaveBeenCalledTimes(1);

    // День змінився → bucket reset-нувся, нова сума 2.5 знов breach-ить.
    addVoyageDailyUsageUsd(2.5, day2);
    checkVoyageSoftBudget({ criticality: "non-critical", now: day2 });
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });

  it("Sentry payload містить usage_usd, threshold_usd, day_key tags (для Grafana-correlation)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const day = Date.UTC(2026, 4, 13, 12, 0, 0);
    addVoyageDailyUsageUsd(1.23, day);
    checkVoyageSoftBudget({ criticality: "non-critical", now: day });

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0]!;
    expect(msg).toMatch(/Voyage soft daily budget exceeded/);
    expect(opts.level).toBe("warning");
    expect(opts.tags).toMatchObject({
      module: "ai-memory",
      op: "voyage_soft_budget_exceeded",
      day_key: "2026-05-13",
    });
    expect(opts.extra).toMatchObject({
      usage_usd: 1.23,
      threshold_usd: 1,
      day_key: "2026-05-13",
    });
  });

  it("Sentry-капча, що сама кидає виняток, НЕ ламає embedding-flow (logged only)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    captureMessageMock.mockImplementationOnce(() => {
      throw new Error("sentry transport failure");
    });

    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(2);

    // Має повернути результат без throw — embedding-flow продовжується.
    expect(() =>
      checkVoyageSoftBudget({ criticality: "critical" }),
    ).not.toThrow();
  });
});

describe("getVoyageUtcDayKey() — PR-38", () => {
  it("повертає YYYY-MM-DD у UTC незалежно від локального TZ-у", async () => {
    const { getVoyageUtcDayKey } = await import("./voyageBudget.js");
    // 2026-05-13T23:59:00Z — все ще "13" у UTC, навіть якщо локально 14-е.
    const utcLate = Date.UTC(2026, 4, 13, 23, 59, 0);
    expect(getVoyageUtcDayKey(utcLate)).toBe("2026-05-13");

    // 2026-05-14T00:01:00Z — вже "14".
    const utcAfterMidnight = Date.UTC(2026, 4, 14, 0, 1, 0);
    expect(getVoyageUtcDayKey(utcAfterMidnight)).toBe("2026-05-14");
  });
});

// Voyage daily cost alert — hard threshold + monthly projection (analogous to PR-14).
describe("getVoyageHardBudgetUsd() — Voyage daily cost alert", () => {
  it("повертає $5 fallback коли env unset (Anthropic-parity)", async () => {
    const { getVoyageHardBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageHardBudgetUsd()).toBe(5);
  });

  it("читає env-value коли валідне float-число", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "12.5";
    const { getVoyageHardBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageHardBudgetUsd()).toBe(12.5);
  });

  it("повертає 0 (=вимкнено) коли env <= 0", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "0";
    const { getVoyageHardBudgetUsd } = await import("./voyageBudget.js");
    expect(getVoyageHardBudgetUsd()).toBe(0);
  });
});

describe("runVoyageBudgetTick() — hard threshold", () => {
  it("Precondition: usage < hard → жодного hard alert, flag не взводиться", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10"; // soft off-path
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      isVoyageBudgetHardExceeded,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(3);
    runVoyageBudgetTick();
    expect(captureMessageMock).not.toHaveBeenCalled();
    expect(isVoyageBudgetHardExceeded()).toBe(false);
  });

  it("usage >= hard → fire-ить error-level alert + взводить hard-breach flag", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      isVoyageBudgetHardExceeded,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(5.25);
    runVoyageBudgetTick();
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0]!;
    expect(msg).toMatch(/Voyage HARD daily budget exceeded/);
    expect(opts.level).toBe("error");
    expect(opts.tags).toMatchObject({
      module: "ai-memory",
      op: "voyage_hard_budget_exceeded",
      threshold: "hard",
      error_signature: "voyage-daily-budget-hard",
    });
    expect(opts.extra).toMatchObject({
      threshold_usd: 5,
    });
    expect(isVoyageBudgetHardExceeded()).toBe(true);
  });

  it("hard alert idempotent — одна Sentry-капча на (day, hard) навіть при N тіках", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(6);
    for (let i = 0; i < 50; i++) runVoyageBudgetTick();
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it("hard=0 (вимкнено) → тік не fire-ить нічого", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "0";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      isVoyageBudgetHardExceeded,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(100);
    runVoyageBudgetTick();
    expect(captureMessageMock).not.toHaveBeenCalled();
    expect(isVoyageBudgetHardExceeded()).toBe(false);
  });

  it("hard breach-flag скидається на day rollover", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      isVoyageBudgetHardExceeded,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const day1 = Date.UTC(2026, 4, 13, 23, 0, 0);
    const day2 = Date.UTC(2026, 4, 14, 1, 0, 0);
    addVoyageDailyUsageUsd(6, day1);
    runVoyageBudgetTick(day1);
    expect(isVoyageBudgetHardExceeded(day1)).toBe(true);

    // На наступний день flag читається як неактуальний (sync-getter rolls
    // forward навіть якщо state ще не зачищений).
    expect(isVoyageBudgetHardExceeded(day2)).toBe(false);

    // Real-clear відбувається при наступному add-у; alertedTiers prune-ниться.
    addVoyageDailyUsageUsd(0.1, day2);
    expect(isVoyageBudgetHardExceeded(day2)).toBe(false);
  });

  it("hard alert ще можна знову fire-нути на свіжому дні (anti-spam clears on rollover)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "10";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const day1 = Date.UTC(2026, 4, 13, 12, 0, 0);
    const day2 = Date.UTC(2026, 4, 14, 12, 0, 0);
    addVoyageDailyUsageUsd(6, day1);
    runVoyageBudgetTick(day1);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);

    addVoyageDailyUsageUsd(6, day2);
    runVoyageBudgetTick(day2);
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });
});

describe("runVoyageBudgetTick() — monthly projection", () => {
  it("projection >= monthly → fire warning-level alert (один на (month, monthly))", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "100"; // soft off-path
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "100"; // hard off-path
    process.env["VOYAGE_MONTHLY_BUDGET_USD"] = "30";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    // May 2026 has 31 days. $1.2/day × 31 = $37.2 ≥ $30 → fire.
    const may15 = Date.UTC(2026, 4, 15, 12, 0, 0);
    addVoyageDailyUsageUsd(1.2, may15);
    runVoyageBudgetTick(may15);

    expect(captureMessageMock).toHaveBeenCalledTimes(1);
    const [msg, opts] = captureMessageMock.mock.calls[0]!;
    expect(msg).toMatch(/Voyage monthly budget projection breach/);
    expect(opts.level).toBe("warning");
    expect(opts.tags).toMatchObject({
      op: "voyage_monthly_projection_alert",
      threshold: "monthly",
      error_signature: "voyage-monthly-budget-projection",
      month_key: "2026-05",
    });
    expect(opts.extra).toMatchObject({
      monthly_budget_usd: 30,
      days_in_month: 31,
    });
  });

  it("monthly=0 (вимкнено) → projection alert не fire-иться", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1000";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "1000";
    process.env["VOYAGE_MONTHLY_BUDGET_USD"] = "0";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(50, Date.UTC(2026, 4, 15, 12, 0, 0));
    runVoyageBudgetTick(Date.UTC(2026, 4, 15, 12, 0, 0));
    expect(captureMessageMock).not.toHaveBeenCalled();
  });

  it("monthly idempotent — один alert на місяць навіть при N тіках різних днів", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "100";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "100";
    process.env["VOYAGE_MONTHLY_BUDGET_USD"] = "30";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const may13 = Date.UTC(2026, 4, 13, 12, 0, 0);
    addVoyageDailyUsageUsd(1.5, may13);
    runVoyageBudgetTick(may13);
    runVoyageBudgetTick(may13);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);

    // Інший день того ж місяця — все ще скіпаємо.
    const may14 = Date.UTC(2026, 4, 14, 12, 0, 0);
    addVoyageDailyUsageUsd(1.5, may14);
    runVoyageBudgetTick(may14);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);
  });

  it("month rollover → fresh projection alert allowed", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "100";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "100";
    process.env["VOYAGE_MONTHLY_BUDGET_USD"] = "30";
    const {
      addVoyageDailyUsageUsd,
      runVoyageBudgetTick,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();

    const may15 = Date.UTC(2026, 4, 15, 12, 0, 0);
    addVoyageDailyUsageUsd(1.5, may15);
    runVoyageBudgetTick(may15);
    expect(captureMessageMock).toHaveBeenCalledTimes(1);

    const jun01 = Date.UTC(2026, 5, 1, 12, 0, 0);
    addVoyageDailyUsageUsd(1.5, jun01);
    runVoyageBudgetTick(jun01);
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
  });
});

describe("checkVoyageSoftBudget() — інтеграція з hard tier", () => {
  it("usage > soft AND >= hard → шлемо ОБИДВА alerts (soft warning + hard error)", async () => {
    process.env["VOYAGE_DAILY_BUDGET_USD_SOFT"] = "1";
    process.env["VOYAGE_DAILY_BUDGET_USD_HARD"] = "5";
    const {
      addVoyageDailyUsageUsd,
      checkVoyageSoftBudget,
      isVoyageBudgetHardExceeded,
      __resetVoyageBudgetState,
    } = await import("./voyageBudget.js");
    __resetVoyageBudgetState();
    addVoyageDailyUsageUsd(6);

    const result = checkVoyageSoftBudget({ criticality: "non-critical" });
    expect(result.allow).toBe(false);
    expect(result.overSoftLimit).toBe(true);
    expect(captureMessageMock).toHaveBeenCalledTimes(2);
    const levels = captureMessageMock.mock.calls.map((c) => c[1]!.level).sort();
    expect(levels).toEqual(["error", "warning"]);
    expect(isVoyageBudgetHardExceeded()).toBe(true);
  });
});
