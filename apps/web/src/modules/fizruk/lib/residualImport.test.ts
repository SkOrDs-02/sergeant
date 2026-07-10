import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReadRaw = vi.fn();
const mockReadJSON = vi.fn();
const mockRemoveItem = vi.fn();
const mockApply = vi.fn();
const mockDiff = vi.fn();

vi.mock("./fizrukStorageInstance.js", () => ({
  fizrukStorage: {
    readRaw: (...a: unknown[]) => mockReadRaw(...a),
    readJSON: (...a: unknown[]) => mockReadJSON(...a),
    removeItem: (...a: unknown[]) => mockRemoveItem(...a),
  },
}));

vi.mock("./sqliteWriter/adapter.js", () => ({
  applyFizrukDualWriteOps: (...a: unknown[]) => mockApply(...a),
}));

vi.mock("./sqliteWriter/diff/index.js", () => ({
  diffFizrukDualWriteOps: (...a: unknown[]) => mockDiff(...a),
}));

import { importFizrukResidualFromLs, __testing } from "./residualImport";

const client = { __label: "client" } as never;

beforeEach(() => {
  mockReadRaw.mockReset();
  mockReadJSON.mockReset();
  mockRemoveItem.mockReset();
  mockApply.mockReset();
  mockDiff.mockReset();
  // Default: no LS data.
  mockReadRaw.mockReturnValue(null);
  mockReadJSON.mockReturnValue(null);
});

describe("importFizrukResidualFromLs", () => {
  it("no-ops when no LS keys hold data", async () => {
    const res = await importFizrukResidualFromLs(client, "u1");
    expect(res).toEqual({ imported: false, cleaned: false });
    expect(mockApply).not.toHaveBeenCalled();
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("imports ops then deletes LS keys with a stale timestamp", async () => {
    // workouts LS present (legacy array shape).
    mockReadRaw.mockImplementation((key: string) =>
      key.includes("workouts")
        ? '[{"id":"w1","startedAt":"2024-01-01"}]'
        : null,
    );
    mockDiff.mockReturnValue([{ kind: "upsert" }]);
    mockApply.mockResolvedValue(undefined);

    const res = await importFizrukResidualFromLs(client, "u1");

    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(mockApply.mock.calls[0]![2]).toEqual({
      userId: "u1",
      clientTs: __testing.STALE_TIMESTAMP,
    });
    expect(mockRemoveItem).toHaveBeenCalledTimes(6);
    expect(res).toEqual({ imported: true, cleaned: true });
  });

  it("cleans LS even when diff yields zero ops", async () => {
    mockReadRaw.mockImplementation((key: string) =>
      key.includes("workouts") ? "[]" : null,
    );
    mockDiff.mockReturnValue([]);

    const res = await importFizrukResidualFromLs(client, "u1");

    expect(mockApply).not.toHaveBeenCalled();
    expect(mockRemoveItem).toHaveBeenCalledTimes(6);
    expect(res).toEqual({ imported: false, cleaned: true });
  });

  it("retains LS keys when apply throws", async () => {
    mockReadRaw.mockImplementation((key: string) =>
      key.includes("workouts") ? '[{"id":"w1"}]' : null,
    );
    mockDiff.mockReturnValue([{ kind: "upsert" }]);
    mockApply.mockRejectedValue(new Error("db down"));

    const res = await importFizrukResidualFromLs(client, "u1");

    expect(res).toEqual({ imported: false, cleaned: false });
    expect(mockRemoveItem).not.toHaveBeenCalled();
  });

  it("reads measurements via readJSON and tolerates non-array", async () => {
    mockReadJSON.mockReturnValue({ not: "an array" });
    mockReadRaw.mockReturnValue(null);
    mockDiff.mockReturnValue([]);

    const res = await importFizrukResidualFromLs(client, "u1");
    // measurements present (non-null) → triggers cleanup path.
    expect(res.cleaned).toBe(true);
  });
});
