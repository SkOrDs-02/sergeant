import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../../db.js", () => {
  const pool = { query: vi.fn() };
  return { default: pool, pool };
});

import _pool from "../../db.js";
import {
  recordDbError,
  getDbErrorCount,
  resetDbErrorWindow,
  dbHealthProbe,
  __aiQuotaHealthTestHooks,
} from "./aiQuotaHealth.js";

const pool = _pool as unknown as { query: ReturnType<typeof vi.fn> };

beforeEach(() => {
  resetDbErrorWindow();
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("recordDbError + getDbErrorCount (sliding window)", () => {
  it("starts empty", () => {
    expect(getDbErrorCount()).toBe(0);
  });

  it("counts errors recorded in the window", () => {
    recordDbError(new Error("boom"));
    recordDbError(Object.assign(new Error("boom"), { code: "ECONNREFUSED" }));
    expect(getDbErrorCount()).toBe(2);
  });

  it("evicts errors older than windowMs", () => {
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    recordDbError();
    recordDbError();

    // ще в межах вікна
    vi.setSystemTime(new Date("2026-05-01T00:00:30Z"));
    expect(getDbErrorCount(60_000)).toBe(2);

    // за 61 секунду — старі вже випали
    vi.setSystemTime(new Date("2026-05-01T00:01:01Z"));
    expect(getDbErrorCount(60_000)).toBe(0);
  });

  it("supports custom windowMs", () => {
    vi.setSystemTime(new Date("2026-05-01T00:00:00Z"));
    recordDbError(undefined, 5_000);
    vi.setSystemTime(new Date("2026-05-01T00:00:04Z"));
    expect(getDbErrorCount(5_000)).toBe(1);
    vi.setSystemTime(new Date("2026-05-01T00:00:06Z"));
    expect(getDbErrorCount(5_000)).toBe(0);
  });

  it("resetDbErrorWindow() clears the window", () => {
    recordDbError();
    recordDbError();
    expect(getDbErrorCount()).toBe(2);
    resetDbErrorWindow();
    expect(getDbErrorCount()).toBe(0);
  });

  it("exposes default window constants for downstream consumers", () => {
    expect(__aiQuotaHealthTestHooks.DEFAULT_WINDOW_MS).toBe(60_000);
    expect(__aiQuotaHealthTestHooks.DEFAULT_PROBE_TIMEOUT_MS).toBe(1_000);
  });
});

describe("dbHealthProbe", () => {
  beforeEach(() => {
    // probe використовує реальний setTimeout у Promise.race — повертаємо
    // справжній таймер, щоб timeout-промис не висів вічно.
    vi.useRealTimers();
  });

  it("returns ok=true when SELECT 1 succeeds", async () => {
    pool.query.mockResolvedValue({ rows: [{ "?column?": 1 }], rowCount: 1 });
    const r = await dbHealthProbe(500);
    expect(r.ok).toBe(true);
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("returns ok=false with code when SELECT 1 throws", async () => {
    pool.query.mockRejectedValue(
      Object.assign(new Error("ECONNREFUSED"), { code: "ECONNREFUSED" }),
    );
    const r = await dbHealthProbe(500);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ECONNREFUSED");
    expect(r.message).toContain("ECONNREFUSED");
  });

  it("returns ok=false with code=ETIMEDOUT when probe exceeds timeout", async () => {
    pool.query.mockImplementation(
      () => new Promise(() => {}), // вічно висить
    );
    const r = await dbHealthProbe(20);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ETIMEDOUT");
    expect(r.message).toBe("db_health_probe_timeout");
  });
});
