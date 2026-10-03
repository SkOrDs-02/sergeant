// @vitest-environment jsdom
/**
 * data-05 (аудит 2026-10-01): `saveRoutineStateDurable` не має рапортувати
 * «довговічно», коли адаптер повернув `applied`, але частина опів впала
 * (`createApplyOps.applyBestEffort` ковтає виняток і лише рахує `errored`).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultRoutineState } from "@sergeant/routine-domain";

const dualWriteRoutineState = vi.fn();

vi.mock("./sqliteWriter/index.js", () => ({
  dualWriteRoutineState: (...args: unknown[]) =>
    dualWriteRoutineState(...args) as unknown,
  triggerRoutineDualWrite: vi.fn(),
}));

import {
  ROUTINE_STORAGE_ERROR,
  saveRoutineStateDurable,
} from "./routineStorage";
import {
  clearSqliteCompletionsCache,
  clearSqliteRoutineStateCache,
} from "./sqliteReader";

describe("saveRoutineStateDurable (data-05)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSqliteCompletionsCache();
    clearSqliteRoutineStateCache();
  });

  it("true, коли жоден оп не впав", async () => {
    dualWriteRoutineState.mockResolvedValue({
      status: "applied",
      result: { applied: 1, errored: 0, skipped: 0 },
    });
    await expect(saveRoutineStateDurable(defaultRoutineState())).resolves.toBe(
      true,
    );
  });

  it("false і сигнал банера, коли applied, але errored > 0", async () => {
    dualWriteRoutineState.mockResolvedValue({
      status: "applied",
      result: { applied: 0, errored: 1, skipped: 0 },
    });
    const onError = vi.fn();
    window.addEventListener(ROUTINE_STORAGE_ERROR, onError);
    try {
      await expect(
        saveRoutineStateDurable(defaultRoutineState()),
      ).resolves.toBe(false);
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener(ROUTINE_STORAGE_ERROR, onError);
    }
  });

  it("false без банера, коли skipped", async () => {
    dualWriteRoutineState.mockResolvedValue({
      status: "skipped",
      reason: "sqlite-unavailable",
    });
    const onError = vi.fn();
    window.addEventListener(ROUTINE_STORAGE_ERROR, onError);
    try {
      await expect(
        saveRoutineStateDurable(defaultRoutineState()),
      ).resolves.toBe(false);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener(ROUTINE_STORAGE_ERROR, onError);
    }
  });
});
