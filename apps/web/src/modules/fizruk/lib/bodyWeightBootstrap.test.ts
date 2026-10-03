import { beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEYS } from "@sergeant/shared";

const mockApply = vi.fn();
const mockRefresh = vi.fn();
const mockGetCache = vi.fn();

vi.mock("./sqliteWriter/adapter.js", () => ({
  applyFizrukDualWriteOps: (...a: unknown[]) => mockApply(...a),
}));

vi.mock("./sqliteReader.js", () => ({
  getCachedFizrukSqliteState: () => mockGetCache(),
  refreshFizrukSqliteState: (...a: unknown[]) => mockRefresh(...a),
}));

import { bootstrapBodyWeightFromBiometrics } from "./bodyWeightBootstrap";

const client = { __label: "client" } as never;

const EMPTY_JOURNAL = { dailyLog: [], measurements: [] };

function seedBiometrics(
  weightKg: number | null,
  weightUpdatedAt: string | null,
) {
  localStorage.setItem(
    STORAGE_KEYS.HUB_BIOMETRICS,
    JSON.stringify({
      heightCm: null,
      birthDate: null,
      sex: null,
      activityLevel: null,
      weightKg,
      weightUpdatedAt,
      updatedAt: weightUpdatedAt ?? new Date(0).toISOString(),
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  mockApply.mockReset();
  mockRefresh.mockReset();
  mockGetCache.mockReset();
  mockGetCache.mockReturnValue(EMPTY_JOURNAL);
  mockApply.mockResolvedValue(undefined);
  mockRefresh.mockResolvedValue(undefined);
});

describe("bootstrapBodyWeightFromBiometrics", () => {
  it("no-ops when biometrics has no weight", async () => {
    const wrote = await bootstrapBodyWeightFromBiometrics(client, "u1");
    expect(wrote).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("no-ops when the fizruk journal already has a weight sample", async () => {
    seedBiometrics(80, "2026-01-01T00:00:00.000Z");
    mockGetCache.mockReturnValue({
      dailyLog: [{ id: "d1", at: "2026-02-01T00:00:00.000Z", weightKg: 82 }],
      measurements: [],
    });

    const wrote = await bootstrapBodyWeightFromBiometrics(client, "u1");

    expect(wrote).toBe(false);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it("seeds one measurement row from biometrics when the journal is empty", async () => {
    seedBiometrics(80, "2026-01-01T00:00:00.000Z");

    const wrote = await bootstrapBodyWeightFromBiometrics(client, "u1");

    expect(wrote).toBe(true);
    expect(mockApply).toHaveBeenCalledTimes(1);
    const [, ops, opts] = mockApply.mock.calls[0] as [
      unknown,
      Array<{
        kind: string;
        measurement: { id: string; at: string; weightKg: number };
      }>,
      { userId: string; clientTs: string },
    ];
    expect(ops).toEqual([
      {
        kind: "measurement-upsert",
        measurement: {
          id: "m_bootstrap_u1",
          at: "2026-01-01T00:00:00.000Z",
          weightKg: 80,
        },
      },
    ]);
    expect(opts).toEqual({
      userId: "u1",
      clientTs: "2026-01-01T00:00:00.000Z",
    });
    expect(mockRefresh).toHaveBeenCalledWith(client, "u1");
  });

  it("is idempotent — a second run no-ops once the seed row landed", async () => {
    seedBiometrics(80, "2026-01-01T00:00:00.000Z");

    await bootstrapBodyWeightFromBiometrics(client, "u1");
    expect(mockApply).toHaveBeenCalledTimes(1);

    // Second boot: the cache now reflects the seeded row.
    mockGetCache.mockReturnValue({
      dailyLog: [],
      measurements: [
        { id: "m_bootstrap_u1", at: "2026-01-01T00:00:00.000Z", weightKg: 80 },
      ],
    });

    const wrote = await bootstrapBodyWeightFromBiometrics(client, "u1");

    expect(wrote).toBe(false);
    expect(mockApply).toHaveBeenCalledTimes(1);
  });

  it("swallows adapter failures and returns false", async () => {
    seedBiometrics(80, "2026-01-01T00:00:00.000Z");
    mockApply.mockRejectedValue(new Error("boom"));

    const wrote = await bootstrapBodyWeightFromBiometrics(client, "u1");

    expect(wrote).toBe(false);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
