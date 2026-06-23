import { beforeEach, describe, expect, it, vi } from "vitest";

const { applyMock, diffMock, removeItemMock, readJSONMock, warnMock } =
  vi.hoisted(() => ({
    applyMock: vi.fn(),
    diffMock: vi.fn(),
    removeItemMock: vi.fn(),
    readJSONMock: vi.fn(),
    warnMock: vi.fn(),
  }));

vi.mock("./dualWrite/adapter.js", () => ({
  applyRoutineDualWriteOps: applyMock,
}));
vi.mock("./dualWrite/diff.js", () => ({
  diffRoutineDualWriteOps: diffMock,
}));
vi.mock("./routineStorageInstance.js", () => ({
  routineStorage: {
    readJSON: readJSONMock,
    removeItem: removeItemMock,
  },
}));
vi.mock("@shared/lib", () => ({
  logger: { warn: warnMock },
}));

import { __testing, importRoutineResidualFromLs } from "./residualImport";

const fakeClient = {} as never;

describe("importRoutineResidualFromLs", () => {
  beforeEach(() => {
    applyMock.mockReset();
    diffMock.mockReset();
    removeItemMock.mockReset();
    readJSONMock.mockReset();
    warnMock.mockReset();
  });

  it("no-ops when the LS key is absent", async () => {
    readJSONMock.mockReturnValue(null);
    const res = await importRoutineResidualFromLs(fakeClient, "u1");
    expect(res).toEqual({ imported: false, cleaned: false });
    expect(diffMock).not.toHaveBeenCalled();
    expect(removeItemMock).not.toHaveBeenCalled();
  });

  it("cleans the key but imports nothing when the diff is empty", async () => {
    readJSONMock.mockReturnValue({ habits: [] });
    diffMock.mockReturnValue([]);
    const res = await importRoutineResidualFromLs(fakeClient, "u1");
    expect(res).toEqual({ imported: false, cleaned: true });
    expect(applyMock).not.toHaveBeenCalled();
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });

  it("applies ops with the stale timestamp and cleans the key", async () => {
    readJSONMock.mockReturnValue({ habits: [{ id: "h1", name: "x" }] });
    diffMock.mockReturnValue([{ kind: "upsertHabit" }]);
    applyMock.mockResolvedValue(undefined);
    const res = await importRoutineResidualFromLs(fakeClient, "u1");
    expect(res).toEqual({ imported: true, cleaned: true });
    expect(applyMock).toHaveBeenCalledWith(
      fakeClient,
      [{ kind: "upsertHabit" }],
      {
        userId: "u1",
        clientTs: __testing.STALE_TIMESTAMP,
      },
    );
    expect(removeItemMock).toHaveBeenCalledTimes(1);
  });

  it("retains the key and logs when apply throws", async () => {
    readJSONMock.mockReturnValue({ habits: [{ id: "h1" }] });
    diffMock.mockReturnValue([{ kind: "upsertHabit" }]);
    applyMock.mockRejectedValue(new Error("boom"));
    const res = await importRoutineResidualFromLs(fakeClient, "u1");
    expect(res).toEqual({ imported: false, cleaned: false });
    expect(removeItemMock).not.toHaveBeenCalled();
    expect(warnMock).toHaveBeenCalled();
  });

  it("uses the epoch-zero stale timestamp constant", () => {
    expect(__testing.STALE_TIMESTAMP).toBe("1970-01-01T00:00:00.000Z");
  });

  it("readRoutineStateFromLs returns null for an unreadable key", () => {
    readJSONMock.mockImplementation(() => {
      throw new Error("corrupt");
    });
    expect(__testing.readRoutineStateFromLs()).toBeNull();
  });

  it("readRoutineStateFromLs returns null when raw is null", () => {
    readJSONMock.mockReturnValue(null);
    expect(__testing.readRoutineStateFromLs()).toBeNull();
  });
});
