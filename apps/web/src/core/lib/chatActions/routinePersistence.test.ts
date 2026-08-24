/**
 * Status: Active
 *
 * F-12 (браузерний QA 2026-08-24): чат-тул рапортував «Зробив це — відмітив
 * Медитацію», а лічильник дня лишався 0/3 і в sync-лозі було порожньо.
 * Причина — `saveRoutineState()` віддає `true` за фактом «передав у
 * dual-write», а dual-write мовчки no-op-иться, поки boot-кластер модуля не
 * змонтувався. Тут пінимо КОНТРАКТ: підтвердження довговічності доходить до
 * `executeActions`, і незбережений запис не має шансу поїхати моделі як успіх.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const saveRoutineStateDurable = vi.fn<(next: unknown) => Promise<boolean>>();
const dualWriteRoutineState = vi.fn();
const isRoutineDualWriteRegistered = vi.fn(() => true);

vi.mock("../../../modules/routine/lib/routineStorage", () => ({
  loadRoutineState: () => ({ habits: [], completions: {} }),
  saveRoutineStateDurable: (next: unknown) => saveRoutineStateDurable(next),
  saveRoutineState: vi.fn(() => true),
}));

vi.mock("../../../modules/routine/lib/sqliteWriter", () => ({
  dualWriteRoutineState: (...args: unknown[]) =>
    dualWriteRoutineState(...args) as unknown,
  isRoutineDualWriteRegistered: () => isRoutineDualWriteRegistered(),
}));

import {
  captureRoutineWrites,
  persistRoutineState,
} from "./routinePersistence";

type State = Parameters<typeof persistRoutineState>[0];
const STATE = { habits: [], completions: {} } as unknown as State;

describe("persistRoutineState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isRoutineDualWriteRegistered.mockReturnValue(true);
  });

  it("віддає true, коли dual-write реально застосував ops", async () => {
    saveRoutineStateDurable.mockResolvedValue(true);
    await expect(persistRoutineState(STATE)).resolves.toBe(true);
    expect(saveRoutineStateDurable).toHaveBeenCalledTimes(1);
  });

  it("віддає false, коли запис пропущено і контексту так і нема", async () => {
    saveRoutineStateDurable.mockResolvedValue(false);
    isRoutineDualWriteRegistered.mockReturnValue(false);
    const { writes } = captureRoutineWrites(() => persistRoutineState(STATE));
    await expect(writes[0]).resolves.toBe(false);
    expect(dualWriteRoutineState).not.toHaveBeenCalled();
  });

  it("у межах батчу повторює dual-write, коли контекст уже зареєстровано", async () => {
    saveRoutineStateDurable.mockResolvedValue(false);
    isRoutineDualWriteRegistered.mockReturnValue(true);
    dualWriteRoutineState.mockResolvedValue({ status: "applied" });

    const { writes } = captureRoutineWrites(() => persistRoutineState(STATE));
    expect(writes).toHaveLength(1);
    await expect(writes[0]).resolves.toBe(true);
    // Повтор іде через `dualWriteRoutineState` із збереженим `prev`, а не
    // через `saveRoutineStateDurable` — інакше diff був би порожній.
    expect(dualWriteRoutineState).toHaveBeenCalledTimes(1);
  });

  it("збирач ізольований: поза capture промиси нікуди не течуть", async () => {
    saveRoutineStateDurable.mockResolvedValue(true);
    const { writes } = captureRoutineWrites(() => undefined);
    expect(writes).toHaveLength(0);
    await persistRoutineState(STATE);
    expect(writes).toHaveLength(0);
  });
});
