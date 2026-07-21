/**
 * Mobile Routine — backup payload helper tests.
 */

const mockLoadRoutineState = jest.fn();
const mockSaveRoutineState = jest.fn();

jest.mock("../routineStore", () => ({
  loadRoutineState: () => mockLoadRoutineState(),
  saveRoutineState: (state: unknown) => mockSaveRoutineState(state),
}));

import {
  ROUTINE_SCHEMA_VERSION,
  defaultRoutineState,
} from "@sergeant/routine-domain";

import {
  ROUTINE_BACKUP_KIND,
  applyRoutineBackupPayload,
  buildRoutineBackupPayload,
} from "../routineBackup";

beforeEach(() => {
  mockLoadRoutineState.mockReset();
  mockSaveRoutineState.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("routineBackup", () => {
  it("builds a serializable backup wrapper around the loaded routine state", () => {
    const state = defaultRoutineState();
    mockLoadRoutineState.mockReturnValue(state);
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-05-04T12:13:14.000Z"));

    expect(buildRoutineBackupPayload()).toEqual({
      kind: ROUTINE_BACKUP_KIND,
      schemaVersion: ROUTINE_SCHEMA_VERSION,
      exportedAt: "2026-05-04T12:13:14.000Z",
      data: state,
    });
  });

  it("normalizes and saves a valid backup payload", () => {
    mockSaveRoutineState.mockReturnValue(true);
    const state = {
      ...defaultRoutineState(),
      habits: [
        {
          id: "h-water",
          name: "Вода",
          emoji: "💧",
          recurrence: "daily",
          archived: false,
          tagIds: [],
          categoryId: null,
          reminderTimes: [],
        },
      ],
      // Deliberately empty; `ensureHabitOrder` should restore the habit id.
      habitOrder: [],
    };

    applyRoutineBackupPayload({
      kind: ROUTINE_BACKUP_KIND,
      schemaVersion: ROUTINE_SCHEMA_VERSION,
      exportedAt: "2026-05-04T12:13:14.000Z",
      data: state,
    });

    expect(mockSaveRoutineState).toHaveBeenCalledTimes(1);
    expect(mockSaveRoutineState.mock.calls[0]![0]).toMatchObject({
      habits: [{ id: "h-water" }],
      habitOrder: ["h-water"],
    });
  });

  it("rejects malformed backup wrappers before saving", () => {
    expect(() =>
      applyRoutineBackupPayload({ kind: "wrong", data: {} }),
    ).toThrow("Некоректний файл резервної копії Рутини.");
    expect(mockSaveRoutineState).not.toHaveBeenCalled();
  });

  it("surfaces save failures from the routine store", () => {
    mockSaveRoutineState.mockReturnValue(false);

    expect(() =>
      applyRoutineBackupPayload({
        kind: ROUTINE_BACKUP_KIND,
        data: defaultRoutineState(),
      }),
    ).toThrow("Не вдалося записати дані після імпорту");
  });
});
