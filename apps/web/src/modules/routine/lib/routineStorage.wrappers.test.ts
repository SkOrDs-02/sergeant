/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { triggerMock, emitHubBusMock, setStateMock, setComplMock } = vi.hoisted(
  () => ({
    triggerMock: vi.fn(),
    emitHubBusMock: vi.fn(),
    setStateMock: vi.fn(),
    setComplMock: vi.fn(),
  }),
);

// In-memory cache that the SQLite reader normally owns. We keep it cold
// (refreshedAt null) so the reducers operate on `defaultRoutineState()`.
let cachedState = {
  habits: [] as unknown[],
  tags: [] as unknown[],
  categories: [] as unknown[],
  prefs: {},
  pushupsByDate: {},
  habitOrder: [] as string[],
  completionNotes: {},
  refreshedAt: null as string | null,
};
let cachedCompletions = {
  completions: {} as Record<string, string[]>,
  refreshedAt: null as string | null,
};

vi.mock("./sqliteWriter/index.js", () => ({
  triggerRoutineDualWrite: triggerMock,
}));
vi.mock("@shared/lib/modules/hubBus", () => ({ emitHubBus: emitHubBusMock }));
vi.mock("./sqliteReader.js", () => ({
  getCachedSqliteRoutineState: () => cachedState,
  getCachedSqliteCompletions: () => cachedCompletions,
  setCachedSqliteRoutineState: setStateMock,
  setCachedSqliteCompletions: setComplMock,
}));

import * as RS from "./routineStorage";

describe("routineStorage wrappers (domain-backed)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cachedState = {
      habits: [],
      tags: [],
      categories: [],
      prefs: {},
      pushupsByDate: {},
      habitOrder: [],
      completionNotes: {},
      refreshedAt: null,
    };
    cachedCompletions = { completions: {}, refreshedAt: null };
  });

  it("loadRoutineState returns the default state when caches are cold", () => {
    const s = RS.loadRoutineState();
    expect(s.habits).toEqual([]);
    expect(s.prefs.routineRemindersEnabled).toBe(false);
  });

  it("saveRoutineState writes through caches and triggers dual-write", () => {
    const ok = RS.saveRoutineState(RS.loadRoutineState());
    expect(ok).toBe(true);
    expect(setStateMock).toHaveBeenCalled();
    expect(setComplMock).toHaveBeenCalled();
    expect(triggerMock).toHaveBeenCalled();
    expect(emitHubBusMock).toHaveBeenCalledWith("storageUpdated", undefined);
  });

  it("createHabit appends and persists", () => {
    const base = RS.loadRoutineState();
    const next = RS.createHabit(base, { name: "Drink water" });
    expect(next.habits).toHaveLength(1);
    expect(next.habits[0]!.name).toBe("Drink water");
    expect(triggerMock).toHaveBeenCalled();
  });

  it("createHabit with an empty name is a no-op", () => {
    const base = RS.loadRoutineState();
    const next = RS.createHabit(base, { name: "   " });
    expect(next).toBe(base);
  });

  it("createTag and createCategory persist new entities", () => {
    const base = RS.loadRoutineState();
    const withTag = RS.createTag(base, "Health");
    expect(withTag.tags.length).toBe(1);
    const withCat = RS.createCategory(base, "Body", "💪");
    expect(withCat.categories.length).toBe(1);
  });

  it("addPushupReps records reps for today", () => {
    const base = RS.loadRoutineState();
    const next = RS.addPushupReps(base, 20);
    expect(Object.values(next.pushupsByDate)).toContain(20);
  });

  it("addPushupReps with invalid input is a no-op", () => {
    const base = RS.loadRoutineState();
    const next = RS.addPushupReps(base, 0);
    expect(next).toBe(base);
  });

  it("setPref updates a preference", () => {
    const base = RS.loadRoutineState();
    const next = RS.setPref(base, "routineRemindersEnabled", true);
    expect(next.prefs.routineRemindersEnabled).toBe(true);
  });

  it("deleteHabit + snapshotHabit + restoreHabit round-trips", () => {
    const base = RS.createHabit(RS.loadRoutineState(), { name: "Walk" });
    const id = base.habits[0]!.id;
    const snap = RS.snapshotHabit(base, id);
    expect(snap).not.toBeNull();
    const deleted = RS.deleteHabit(base, id);
    expect(deleted.habits.find((h) => h.id === id)).toBeUndefined();
    const restored = RS.restoreHabit(deleted, snap);
    expect(restored.habits.find((h) => h.id === id)).toBeDefined();
  });

  it("setHabitArchived archives a habit", () => {
    const base = RS.createHabit(RS.loadRoutineState(), { name: "Stretch" });
    const id = base.habits[0]!.id;
    const archived = RS.setHabitArchived(base, id, true);
    expect(archived.habits.find((h) => h.id === id)!.archived).toBe(true);
  });

  it("updateHabit applies a patch", () => {
    const base = RS.createHabit(RS.loadRoutineState(), { name: "X" });
    const id = base.habits[0]!.id;
    const next = RS.updateHabit(base, id, { name: "Y" });
    expect(next.habits.find((h) => h.id === id)!.name).toBe("Y");
  });

  it("updateTag / updateCategory / deleteTag / deleteCategory persist", () => {
    let base = RS.createTag(RS.loadRoutineState(), "T1");
    const tagId = base.tags[0]!.id;
    base = RS.createCategory(base, "C1", "📦");
    const catId = base.categories[0]!.id;

    const renamedTag = RS.updateTag(base, tagId, "T2");
    expect(renamedTag.tags.find((t) => t.id === tagId)!.name).toBe("T2");

    const renamedCat = RS.updateCategory(base, catId, { name: "C2" });
    expect(renamedCat.categories.find((c) => c.id === catId)!.name).toBe("C2");

    const noTag = RS.deleteTag(base, tagId);
    expect(noTag.tags.find((t) => t.id === tagId)).toBeUndefined();

    const noCat = RS.deleteCategory(base, catId);
    expect(noCat.categories.find((c) => c.id === catId)).toBeUndefined();
  });

  it("buildRoutineBackupPayload produces a tagged payload", () => {
    const payload = RS.buildRoutineBackupPayload();
    expect(payload.kind).toBe("hub-routine-backup");
    expect(payload.data).toHaveProperty("habits");
    expect(typeof payload.exportedAt).toBe("string");
  });

  it("applyRoutineBackupPayload rejects a malformed payload", () => {
    expect(() => RS.applyRoutineBackupPayload({ kind: "nope" })).toThrow();
    expect(() => RS.applyRoutineBackupPayload(null)).toThrow();
  });

  it("applyRoutineBackupPayload accepts a valid payload", () => {
    const payload = RS.buildRoutineBackupPayload();
    expect(() => RS.applyRoutineBackupPayload(payload)).not.toThrow();
  });

  it("emitRoutineStorage notifies the hub bus", () => {
    RS.emitRoutineStorage();
    expect(emitHubBusMock).toHaveBeenCalledWith("storageUpdated", undefined);
  });
});
