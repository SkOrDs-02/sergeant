import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PR-12 — unit-coverage для DB-ledger helper-а. Мокаємо `pool` і `logger`,
 * щоб перевірити:
 *   1) UPSERT-SQL форму + параметри (subject_key, bucket, tokens, cost USD).
 *   2) Fail-open behaviour коли pool.query кидає.
 *   3) Early-return: невідомий model, пусті usage-токени, null usage.
 */

const { queryMock, warnMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  warnMock: vi.fn(),
}));

vi.mock("../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
  query: queryMock,
}));

vi.mock("../obs/logger.js", () => ({
  logger: { warn: warnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  recordAnthropicUsageToDb,
  ANTHROPIC_PROVIDER_SUBJECT,
  __testing,
} from "./anthropicUsageStore.js";

beforeEach(() => {
  queryMock.mockReset();
  warnMock.mockReset();
  queryMock.mockResolvedValue({ rowCount: 1 });
});

describe("recordAnthropicUsageToDb — UPSERT shape", () => {
  it("пише input/output/total + cost USD у `ai_usage_daily` для Sonnet 3.5", async () => {
    await recordAnthropicUsageToDb("claude-3-5-sonnet-20241022", {
      input_tokens: 1_000,
      output_tokens: 500,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0]!;
    expect(sql).toMatch(/INSERT INTO ai_usage_daily/);
    expect(sql).toMatch(/ON CONFLICT \(subject_key, usage_day, bucket\)/);
    expect(sql).toMatch(/est_cost_usd\s*=\s*ai_usage_daily\.est_cost_usd/);
    expect(params).toEqual([
      ANTHROPIC_PROVIDER_SUBJECT,
      __testing.todayKyiv(),
      "anthropic:claude-3-5-sonnet-20241022",
      1_000, // input + cache_read + cache_write = 1000+0+0
      500, // output
      1_500, // total
      // 1000 × $3/MTok + 500 × $15/MTok = $0.003 + $0.0075 = $0.0105
      expect.closeTo(0.0105, 6),
    ]);
  });

  it("враховує cache_creation/cache_read у tokens та USD-калькуляції", async () => {
    await recordAnthropicUsageToDb("claude-3-5-sonnet-20241022", {
      input_tokens: 1_000,
      output_tokens: 1_000,
      cache_creation_input_tokens: 1_000,
      cache_read_input_tokens: 1_000,
    });
    const [, params] = queryMock.mock.calls[0]!;
    // input + cache_read + cache_write = 3_000
    expect(params![3]).toBe(3_000);
    // output
    expect(params![4]).toBe(1_000);
    // total
    expect(params![5]).toBe(4_000);
    // 1k × (3 + 15 + 3.75 + 0.30) / 1M = $0.02205
    expect(params![6] as number).toBeCloseTo(0.02205, 6);
  });

  it("пише tokens з est_cost_usd=0 для невідомої моделі (НЕ skip)", async () => {
    await recordAnthropicUsageToDb("claude-future-99", {
      input_tokens: 500,
      output_tokens: 100,
    });
    expect(queryMock).toHaveBeenCalledTimes(1);
    const [, params] = queryMock.mock.calls[0]!;
    expect(params![2]).toBe("anthropic:claude-future-99");
    expect(params![3]).toBe(500);
    expect(params![4]).toBe(100);
    expect(params![5]).toBe(600);
    // pricing невідомий → est_cost_usd=0, але tokens усе одно записуємо.
    expect(params![6]).toBe(0);
  });
});

describe("recordAnthropicUsageToDb — early returns", () => {
  it("skip коли usage=null/undefined", async () => {
    await recordAnthropicUsageToDb("claude-3-5-sonnet", null);
    await recordAnthropicUsageToDb("claude-3-5-sonnet", undefined);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("skip коли model пустий або sentinel `unknown`", async () => {
    await recordAnthropicUsageToDb("", {
      input_tokens: 100,
      output_tokens: 50,
    });
    await recordAnthropicUsageToDb("unknown", {
      input_tokens: 100,
      output_tokens: 50,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("skip коли всі токени = 0 (no-op виклик)", async () => {
    await recordAnthropicUsageToDb("claude-3-5-sonnet", {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("skip коли усі токени negative/NaN/missing", async () => {
    await recordAnthropicUsageToDb("claude-3-5-sonnet", {
      input_tokens: -5,
      output_tokens: NaN,
    });
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("recordAnthropicUsageToDb — fail-open behaviour", () => {
  it("ковтає DB-помилки і логує warn (НЕ throw-ить)", async () => {
    queryMock.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(
      recordAnthropicUsageToDb("claude-3-5-sonnet", {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledTimes(1);
    const arg = warnMock.mock.calls[0]![0] as {
      msg: string;
      err: string;
      model: string;
      bucket: string;
    };
    expect(arg.msg).toBe("anthropic_usage_ledger_failed");
    expect(arg.err).toMatch(/ECONNREFUSED/);
    expect(arg.model).toBe("claude-3-5-sonnet");
    expect(arg.bucket).toBe("anthropic:claude-3-5-sonnet");
  });

  it("ковтає non-Error throw (TypeError-style string) і логує warn", async () => {
    queryMock.mockRejectedValueOnce("connection lost");
    await expect(
      recordAnthropicUsageToDb("claude-3-5-sonnet", {
        input_tokens: 100,
        output_tokens: 50,
      }),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledTimes(1);
    const arg = warnMock.mock.calls[0]![0] as { err: string };
    expect(arg.err).toBe("connection lost");
  });
});

describe("__testing internals", () => {
  it("`todayKyiv()` повертає yyyy-mm-dd за Europe/Kyiv", () => {
    const today = __testing.todayKyiv();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("`bucketFor()` префіксує модель `anthropic:`", () => {
    expect(__testing.bucketFor("claude-3-5-sonnet")).toBe(
      "anthropic:claude-3-5-sonnet",
    );
  });
});
