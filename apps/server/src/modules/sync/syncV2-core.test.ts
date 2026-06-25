import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request } from "express";

const {
  durationObserve,
  loggerError,
  loggerInfo,
  loggerWarn,
  operationsInc,
  payloadObserve,
  poolQuery,
} = vi.hoisted(() => ({
  durationObserve: vi.fn(),
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  loggerWarn: vi.fn(),
  operationsInc: vi.fn(),
  payloadObserve: vi.fn(),
  poolQuery: vi.fn(),
}));

vi.mock("../../db.js", () => ({
  default: { query: poolQuery },
}));

vi.mock("../../obs/logger.js", () => ({
  logger: {
    error: loggerError,
    info: loggerInfo,
    warn: loggerWarn,
  },
}));

vi.mock("../../obs/metrics.js", () => ({
  syncDurationMs: { observe: durationObserve },
  syncOperationsTotal: { inc: operationsInc },
  syncPayloadBytes: { observe: payloadObserve },
}));

import {
  parseOptionalDate,
  parseOptionalInt,
  parseOptionalNumber,
  parseRequiredDate,
  readOriginDeviceId,
  recordSyncV2,
  toJsonbParam,
  toNonNegativeInt,
} from "./syncV2-core.js";

function reqWithHeader(value: unknown): Request {
  return { headers: { "x-origin-device-id": value } } as unknown as Request;
}

describe("syncV2-core helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQuery.mockReturnValue({ catch: vi.fn() });
  });

  it("reads and truncates the origin device id header", () => {
    expect(readOriginDeviceId(reqWithHeader(undefined))).toBeNull();
    expect(readOriginDeviceId(reqWithHeader(["device"]))).toBeNull();
    expect(readOriginDeviceId(reqWithHeader("   "))).toBeNull();
    expect(readOriginDeviceId(reqWithHeader(`  ${"d".repeat(80)}  `))).toBe(
      "d".repeat(64),
    );
  });

  it("parses date, number and integer helper inputs", () => {
    const date = new Date("2026-06-25T00:00:00.000Z");

    expect(parseOptionalDate(null)).toBeNull();
    expect(parseOptionalDate(date)).toBe(date);
    expect(parseOptionalDate(new Date("bad"))).toBe("invalid");
    expect(parseOptionalDate("2026-06-25T00:00:00.000Z")).toEqual(date);
    expect(parseOptionalDate("bad")).toBe("invalid");
    expect(parseRequiredDate(undefined)).toBe("invalid");
    expect(parseRequiredDate(date)).toBe(date);

    expect(toNonNegativeInt(3.8)).toBe(3);
    expect(toNonNegativeInt(-1)).toBeNull();
    expect(toNonNegativeInt(Number.POSITIVE_INFINITY)).toBeNull();
    expect(toNonNegativeInt("3")).toBeNull();

    expect(parseOptionalNumber(null)).toBeNull();
    expect(parseOptionalNumber(1.5)).toBe(1.5);
    expect(parseOptionalNumber(" 2.5 ")).toBe(2.5);
    expect(parseOptionalNumber("")).toBe("invalid");
    expect(parseOptionalNumber(Number.NaN)).toBe("invalid");
    expect(parseOptionalInt("2.9")).toBe(2);
    expect(parseOptionalInt(null)).toBeNull();
    expect(parseOptionalInt("nope")).toBe("invalid");
  });

  it("serializes JSONB params defensively", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    expect(toJsonbParam(null)).toBeNull();
    expect(toJsonbParam({ ok: true })).toBe(JSON.stringify({ ok: true }));
    expect(toJsonbParam(circular)).toBeNull();
  });

  it("records metrics, logs and audit rows for successful syncs", () => {
    recordSyncV2("v2_push", "ok", {
      ms: 12.8,
      bytes: 123,
      userId: "u1",
      extra: { table: "routine_entries" },
    });

    expect(operationsInc).toHaveBeenCalledWith({
      op: "v2_push",
      module: "v2",
      outcome: "ok",
    });
    expect(durationObserve).toHaveBeenCalledWith(
      { op: "v2_push", module: "v2" },
      12.8,
    );
    expect(payloadObserve).toHaveBeenCalledWith(
      { op: "v2_push", module: "v2" },
      123,
    );
    expect(loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "sync_event",
        outcome: "ok",
        ms: 13,
        table: "routine_entries",
      }),
    );
    expect(poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sync_audit_log"),
      ["u1", "v2_push", "v2", "ok", false, 123, 13],
    );
  });

  it("uses warn/error log levels and skips validation-only audit rows", () => {
    recordSyncV2("v2_pull", "conflict", { userId: "u1" });
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "conflict" }),
    );
    expect(poolQuery).toHaveBeenCalledWith(expect.any(String), [
      "u1",
      "v2_pull",
      "v2",
      "conflict",
      true,
      null,
      null,
    ]);

    poolQuery.mockClear();
    recordSyncV2("v2_push", "invalid", { userId: "u1" });
    recordSyncV2("v2_push", "unauthorized", { userId: "u1" });
    recordSyncV2("v2_push", "too_large", { userId: "u1" });
    expect(poolQuery).not.toHaveBeenCalled();

    recordSyncV2("v2_push", "error");
    expect(loggerError).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: "error" }),
    );
  });

  it("keeps metrics, logging and audit failures fail-open", async () => {
    operationsInc.mockImplementationOnce(() => {
      throw new Error("metrics down");
    });
    loggerInfo.mockImplementationOnce(() => {
      throw new Error("logger down");
    });
    const catchMock = vi.fn((handler: (err: unknown) => void) => {
      handler(new Error("db down"));
    });
    poolQuery.mockReturnValueOnce({ catch: catchMock });

    expect(() => recordSyncV2("v2_push", "ok", { userId: "u1" })).not.toThrow();
    expect(catchMock).toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        msg: "sync_audit_insert_failed",
        err: "db down",
      }),
    );

    poolQuery.mockImplementationOnce(() => {
      throw new Error("sync audit unavailable");
    });
    expect(() => recordSyncV2("v2_push", "ok", { userId: "u1" })).not.toThrow();
  });
});
