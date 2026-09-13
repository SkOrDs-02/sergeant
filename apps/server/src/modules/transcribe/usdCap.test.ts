import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Request, Response } from "express";

/**
 * H9 — pre-charge cap + post-success accounting unit-coverage.
 *
 * Мокаємо `pool` (single-export `default`), щоб контролювати:
 *   1) ВЖЕ-витрачено-USD-стан (`SELECT … FROM ai_usage_daily`),
 *   2) UPSERT-аккаунтінг (`recordTranscribeUsdSpend`),
 *   3) DB-failure path (fail-open).
 *
 * Лог-helpers підмінені на noop, щоб не засмічувати stdout у тестах
 * (handler логує `transcribe.usd_cap_hit` структурованим event-ом —
 * валідовано окремою expect-перевіркою).
 */

const { queryMock, infoMock, warnMock, capCounterIncMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  infoMock: vi.fn(),
  warnMock: vi.fn(),
  capCounterIncMock: vi.fn(),
}));

vi.mock("../../db.js", () => ({
  default: { query: queryMock },
  pool: { query: queryMock },
  query: queryMock,
}));

vi.mock("../../obs/logger.js", () => ({
  logger: { info: infoMock, warn: warnMock, error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../obs/metrics.js", () => ({
  transcribeUsdCapEventsTotal: { inc: capCounterIncMock },
}));

import {
  assertTranscribeUsdCap,
  recordTranscribeUsdSpend,
  __testing,
} from "./usdCap.js";

interface FakeRes {
  statusCode: number;
  body: unknown;
  status(code: number): FakeRes;
  json(p: unknown): FakeRes;
}

function makeRes(): FakeRes & Response {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(p) {
      this.body = p;
      return this;
    },
  };
  return res as FakeRes & Response;
}

function makeReq(userId: string | null): Request {
  const r = { user: userId ? { id: userId } : undefined } as Partial<Request>;
  return r as Request;
}

const MODEL = "whisper-large-v3-turbo";
const TEN_MB = 10 * 1024 * 1024;

beforeEach(() => {
  queryMock.mockReset();
  infoMock.mockReset();
  warnMock.mockReset();
  capCounterIncMock.mockReset();
  delete process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"];
});

afterEach(() => {
  delete process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"];
});

describe("H9 estimateMicros (linear tariff)", () => {
  it("10 MB кліп = $0.04 = 40_000 micros (Groq Whisper turbo, 2026-05)", () => {
    expect(__testing.estimateMicros(TEN_MB)).toBe(
      __testing.GROQ_WHISPER_USD_MICROS_PER_10MB,
    );
  });

  it("0 байт → 0 micros (early return, без поділу)", () => {
    expect(__testing.estimateMicros(0)).toBe(0);
  });

  it("1 MB ≈ 4_000 micros (linear scaling)", () => {
    const oneMb = 1024 * 1024;
    expect(__testing.estimateMicros(oneMb)).toBe(4_000);
  });

  it("малий fragment — Math.ceil гарантує мінімальну тарифікацію", () => {
    // 4 байти ≈ 0.015 micros → ceil = 1, не 0. Захищає від
    // "1-byte ddos" що технічно безкоштовний при `Math.floor`.
    expect(__testing.estimateMicros(4)).toBe(1);
  });
});

describe("H9 dailyCapMicros (env override)", () => {
  // Знижено з $1.00 2026-09-13 (V1). Число тут навмисно дубльоване
  // літералом, а не виведене з `MICROS_PER_USD / 10`: сенс тесту — щоб
  // зміна дефолту вимагала свідомо переписати очікування, а не тихо
  // проїхала разом із формулою.
  it("default = $0.10 / day", () => {
    expect(__testing.dailyCapMicros()).toBe(100_000);
    expect(__testing.DEFAULT_DAILY_CAP_MICROS).toBe(100_000);
  });

  // $0.10 ≈ 25 МБ аудіо ≈ понад 40 хвилин мовлення на добу. Тест тримає
  // не саме число, а те, що воно лишається придатним для людини: стеля,
  // за якої не влазить і десять хвилин, була б не обмеженням зловживань,
  // а поломкою фічі.
  it("дефолтна стеля лишає простір щонайменше на 20 хвилин мовлення", () => {
    const tenMbMicros = __testing.estimateMicros(10 * 1024 * 1024);
    const tenMbMinutes = 10; // ~10 МБ webm/opus ≈ ~10 хв мовлення
    const minutes = (__testing.dailyCapMicros() / tenMbMicros) * tenMbMinutes;
    expect(minutes).toBeGreaterThanOrEqual(20);
  });

  it("env-override приймається коли ціле невідʼємне", () => {
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = "5000000";
    expect(__testing.dailyCapMicros()).toBe(5_000_000);
  });

  it("0 = effectively disabled (синтетика / e2e)", () => {
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = "0";
    expect(__testing.dailyCapMicros()).toBe(0);
  });

  it("invalid → fallback на default + warn", () => {
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = "not-a-number";
    expect(__testing.dailyCapMicros()).toBe(__testing.DEFAULT_DAILY_CAP_MICROS);
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ msg: "transcribe_usd_cap_invalid_env" }),
    );
  });
});

describe("H9 assertTranscribeUsdCap — happy path", () => {
  it("пропускає виклик, що в межах cap-у; коерсить bigint→number", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ usd_micros: "20000" }], // 0.02 USD з раніших викликів
    });
    const req = makeReq("user-123");
    const res = makeRes();
    const r = await assertTranscribeUsdCap(req, res, TEN_MB, MODEL);
    expect(r.ok).toBe(true);
    expect(r.spent_micros).toBe(20_000);
    expect(res.statusCode).toBe(200);
    expect(res.body).toBeUndefined();
    // SELECT параметризований subject_key, day, bucket
    expect(queryMock).toHaveBeenCalledOnce();
    const sqlArgs = queryMock!.mock.calls[0]![1];
    expect(sqlArgs[0]).toBe("u:user-123");
    expect(sqlArgs[2]).toBe(`transcribe:${MODEL}`);
  });

  it("без записів сьогодні → spent=0, ok=true", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const req = makeReq("user-fresh");
    const res = makeRes();
    const r = await assertTranscribeUsdCap(req, res, 1024, MODEL);
    expect(r.ok).toBe(true);
    expect(res.body).toBeUndefined();
  });
});

describe("H9 assertTranscribeUsdCap — cap-hit (402)", () => {
  it("spent + estimate > cap → 402 TRANSCRIBE_USD_CAP, без SELECT-у Groq-a", async () => {
    // 0.09 USD витрачено → ще один 10 MB ($0.04) перебʼє $0.10 cap.
    queryMock.mockResolvedValueOnce({
      rows: [{ usd_micros: "90000" }],
    });
    const req = makeReq("user-spammer");
    const res = makeRes();
    const r = await assertTranscribeUsdCap(req, res, TEN_MB, MODEL);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("cap_hit");
    expect(res.statusCode).toBe(402);
    expect((res.body as { code?: string }).code).toBe("TRANSCRIBE_USD_CAP");
    expect((res.body as { cap_usd?: number }).cap_usd).toBeCloseTo(0.1);
    expect((res.body as { spent_usd?: number }).spent_usd).toBeCloseTo(0.09);
    expect(capCounterIncMock).toHaveBeenCalledWith({ outcome: "cap_hit" });
    // Структурований лог для алертингу (Sentry hook).
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "transcribe.usd_cap_hit",
        subject: "u:user-spammer",
        cap_micros: 100_000,
      }),
    );
  });

  it("граничний кейс: spent + estimate = cap → пропускає (off-by-one)", async () => {
    // Стеля пінується явно, а не береться з дефолту: предмет цього тесту —
    // строгість порівняння `>`, і він не має падати щоразу, коли рухають
    // дефолтне число. $0.06 spent + $0.04 estimate = $0.10 cap.
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = "100000";
    queryMock.mockResolvedValueOnce({
      rows: [{ usd_micros: "60000" }],
    });
    const r = await assertTranscribeUsdCap(
      makeReq("u-edge"),
      makeRes(),
      TEN_MB,
      MODEL,
    );
    expect(r.ok).toBe(true);
  });
});

describe("H9 assertTranscribeUsdCap — fail-open / disabled", () => {
  it("DB-помилка → fail-open + telemetry", async () => {
    queryMock.mockRejectedValueOnce(new Error("connection refused"));
    const r = await assertTranscribeUsdCap(
      makeReq("u-1"),
      makeRes(),
      TEN_MB,
      MODEL,
    );
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("store_unavailable");
    expect(capCounterIncMock).toHaveBeenCalledWith({
      outcome: "store_unavailable",
    });
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "transcribe_usd_cap_store_unavailable",
      }),
    );
  });

  it("cap=0 (disabled) → не виконує SELECT", async () => {
    process.env["TRANSCRIBE_USD_CAP_DAILY_MICROS"] = "0";
    const r = await assertTranscribeUsdCap(
      makeReq("u-1"),
      makeRes(),
      TEN_MB,
      MODEL,
    );
    expect(r.ok).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("subject відсутній (regression: handler без requireSession upstream) → fail-open + warn", async () => {
    const r = await assertTranscribeUsdCap(
      makeReq(null),
      makeRes(),
      TEN_MB,
      MODEL,
    );
    expect(r.ok).toBe(true);
    expect(queryMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "transcribe_usd_cap_no_subject",
      }),
    );
  });
});

describe("H9 recordTranscribeUsdSpend — UPSERT", () => {
  it("INSERT … ON CONFLICT збільшує і request_count, і usd_micros", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    await recordTranscribeUsdSpend(makeReq("u-paid"), TEN_MB, MODEL);
    expect(queryMock).toHaveBeenCalledOnce();
    const [sql, args] = queryMock.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO ai_usage_daily");
    expect(sql).toContain("ON CONFLICT");
    expect(sql).toContain("usd_micros = ai_usage_daily.usd_micros + EXCLUDED");
    expect(args[0]).toBe("u:u-paid");
    expect(args[2]).toBe(`transcribe:${MODEL}`);
    // Міграції 104/106: `endpoint` тепер NOT NULL / частина PK — фіксоване
    // значення 'transcribe' для цього модуля.
    expect(args[3]).toBe(__testing.TRANSCRIBE_ENDPOINT);
    expect(args[4]).toBe(__testing.GROQ_WHISPER_USD_MICROS_PER_10MB);
  });

  it("0 байт → НЕ викликає DB (нема чого записувати)", async () => {
    await recordTranscribeUsdSpend(makeReq("u-1"), 0, MODEL);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("subject відсутній → no-op без падіння", async () => {
    await recordTranscribeUsdSpend(makeReq(null), TEN_MB, MODEL);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("DB-помилка ковтається — успіх Groq-у не блокується через ledger", async () => {
    queryMock.mockRejectedValueOnce(new Error("write failed"));
    await expect(
      recordTranscribeUsdSpend(makeReq("u-1"), TEN_MB, MODEL),
    ).resolves.toBeUndefined();
    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "transcribe_usd_cap_record_failed",
      }),
    );
  });
});
