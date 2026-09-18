import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryKVStore } from "../test-utils";
import {
  MODULE_CHECKLISTS,
  CHECKLIST_ACTIONS,
  getChecklistState,
  saveChecklistState,
  markChecklistStepDone,
  dismissChecklist,
  markChecklistSeen,
  isChecklistVisible,
  getChecklistProgress,
  getAccountAgeDays,
  isWithinChecklistWindow,
  resolveChecklistSteps,
  resetAllChecklists,
} from "./moduleChecklist";

describe("moduleChecklist — definitions", () => {
  it("defines checklists for all 4 modules", () => {
    const ids = Object.keys(MODULE_CHECKLISTS);
    expect(ids).toEqual(
      expect.arrayContaining(["finyk", "fizruk", "routine", "nutrition"]),
    );
    expect(ids).toHaveLength(4);
  });

  it("each definition has at least 3 steps", () => {
    for (const def of Object.values(MODULE_CHECKLISTS)) {
      expect(def.steps.length).toBeGreaterThanOrEqual(3);
      for (const step of def.steps) {
        expect(typeof step.id).toBe("string");
        expect(typeof step.label).toBe("string");
      }
    }
  });

  // F3 audit (2026-09-11): `CHECKLIST_ACTIONS` is the single source of
  // truth `hubNav.ts`'s runtime gate derives from — `ChecklistStep.action`
  // is typed against it, so this is defense-in-depth against an `as any`
  // bypass, not the primary guarantee (the primary guarantee is the type
  // itself, verified at compile time).
  it("every declared checklist action is a member of the canonical CHECKLIST_ACTIONS list", () => {
    const declaredActions = Object.values(MODULE_CHECKLISTS)
      .flatMap((def) => def.steps)
      .map((step) => step.action)
      .filter((action) => action !== undefined);
    expect(declaredActions.length).toBeGreaterThan(0);
    for (const action of declaredActions) {
      expect(CHECKLIST_ACTIONS).toContain(action);
    }
  });
});

describe("moduleChecklist — storage", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("returns empty state for fresh store", () => {
    const state = getChecklistState(store, "finyk");
    expect(state.completedSteps).toEqual([]);
    expect(state.dismissed).toBe(false);
    expect(state.firstSeenAt).toBeNull();
  });

  it("round-trips valid state", () => {
    const original = {
      completedSteps: ["add_expense", "set_budget"],
      dismissed: false,
      firstSeenAt: "2026-01-01T00:00:00.000Z",
    };
    saveChecklistState(store, "finyk", original);
    const loaded = getChecklistState(store, "finyk");
    // Писар доклав `latchVersion` — без нього читання не взяло б засувку
    // на віру (див. нижче про епоху тапу).
    expect(loaded).toEqual({ ...original, latchVersion: 2 });
  });

  // Знахідка рев'ю до PR #1106. До F3 тап по рядку чекліста писав `stepId`
  // у `completedSteps` без жодного доказу даними — це і був дефект. Ключ
  // сховища не змінювався, тож після фіксу ті самі неперевірені id почали
  // читатись як постійний доказ, і дефект пережив власний фікс для всіх,
  // хто встиг тапнути. Запис без `latchVersion` — саме така епоха.
  it("distrusts completedSteps written before the latch had a version", () => {
    store.setString(
      "finyk_checklist_v1",
      JSON.stringify({
        completedSteps: ["add_expense", "set_budget"],
        dismissed: true,
        firstSeenAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const loaded = getChecklistState(store, "finyk");
    expect(loaded.completedSteps).toEqual([]);
    // А решту запису чіпати підстав немає: людина, яка сховала чекліст,
    // не має побачити його знову через чужий баг.
    expect(loaded.dismissed).toBe(true);
    expect(loaded.firstSeenAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("keeps completedSteps written with the current latch version", () => {
    store.setString(
      "finyk_checklist_v1",
      JSON.stringify({
        completedSteps: ["add_expense"],
        dismissed: false,
        firstSeenAt: null,
        latchVersion: 2,
      }),
    );
    expect(getChecklistState(store, "finyk").completedSteps).toEqual([
      "add_expense",
    ]);
  });

  it("handles malformed JSON gracefully", () => {
    store.setString("finyk_checklist_v1", "not-json");
    const state = getChecklistState(store, "finyk");
    expect(state.completedSteps).toEqual([]);
    expect(state.dismissed).toBe(false);
  });
});

describe("moduleChecklist — mutations", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("markChecklistStepDone adds step to completedSteps", () => {
    const state = markChecklistStepDone(store, "finyk", "add_expense");
    expect(state.completedSteps).toContain("add_expense");
  });

  it("markChecklistStepDone is idempotent", () => {
    markChecklistStepDone(store, "finyk", "add_expense");
    const state = markChecklistStepDone(store, "finyk", "add_expense");
    expect(
      state.completedSteps.filter((s) => s === "add_expense"),
    ).toHaveLength(1);
  });

  it("dismissChecklist sets dismissed flag", () => {
    const state = dismissChecklist(store, "routine");
    expect(state.dismissed).toBe(true);
  });

  it("markChecklistSeen sets firstSeenAt", () => {
    const state = markChecklistSeen(store, "fizruk");
    expect(state.firstSeenAt).toBeTruthy();
  });

  it("markChecklistSeen does not overwrite existing timestamp", () => {
    const first = markChecklistSeen(store, "fizruk");
    const second = markChecklistSeen(store, "fizruk");
    expect(second.firstSeenAt).toBe(first.firstSeenAt);
  });
});

describe("moduleChecklist — visibility", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("visible by default", () => {
    expect(isChecklistVisible(store, "finyk")).toBe(true);
  });

  it("hidden when dismissed", () => {
    dismissChecklist(store, "finyk");
    expect(isChecklistVisible(store, "finyk")).toBe(false);
  });

  it("hidden when all steps completed", () => {
    const def = MODULE_CHECKLISTS.finyk;
    for (const step of def.steps) {
      markChecklistStepDone(store, "finyk", step.id);
    }
    expect(isChecklistVisible(store, "finyk")).toBe(false);
  });

  it("hidden after 7 days", () => {
    const eightDaysAgo = new Date(
      Date.now() - 8 * 24 * 60 * 60 * 1000,
    ).toISOString();
    saveChecklistState(store, "finyk", {
      completedSteps: [],
      dismissed: false,
      firstSeenAt: eightDaysAgo,
    });
    expect(isChecklistVisible(store, "finyk")).toBe(false);
  });

  it("still visible within 7 days", () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    saveChecklistState(store, "finyk", {
      completedSteps: [],
      dismissed: false,
      firstSeenAt: threeDaysAgo,
    });
    expect(isChecklistVisible(store, "finyk")).toBe(true);
  });
});

describe("moduleChecklist — progress", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("returns 0/N for fresh store", () => {
    const progress = getChecklistProgress(store, "routine");
    expect(progress.completed).toBe(0);
    expect(progress.total).toBe(MODULE_CHECKLISTS.routine.steps.length);
  });

  it("counts only valid step ids", () => {
    markChecklistStepDone(store, "routine", "create_habit");
    markChecklistStepDone(store, "routine", "bogus_step");
    const progress = getChecklistProgress(store, "routine");
    expect(progress.completed).toBe(1);
  });
});

describe("moduleChecklist — reset", () => {
  it("resetAllChecklists clears all modules", () => {
    const store = createMemoryKVStore();
    markChecklistStepDone(store, "finyk", "add_expense");
    markChecklistStepDone(store, "routine", "create_habit");
    resetAllChecklists(store);
    expect(getChecklistState(store, "finyk").completedSteps).toEqual([]);
    expect(getChecklistState(store, "routine").completedSteps).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Regression: the checklist used to be tap-only and device-gated, so a
// long-standing user who reinstalled the PWA saw "Фінік: Перші кроки —
// 0/4" over data proving every step was long done.
// ───────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

describe("moduleChecklist — data signals", () => {
  let store: ReturnType<typeof createMemoryKVStore>;

  beforeEach(() => {
    store = createMemoryKVStore();
  });

  it("completes a step from real data with no tap recorded", () => {
    const steps = resolveChecklistSteps(store, "finyk", { add_expense: true });
    const addExpense = steps.find((s) => s.id === "add_expense");
    expect(addExpense?.done).toBe(true);
    expect(addExpense?.provenByData).toBe(true);
    expect(getChecklistState(store, "finyk").completedSteps).toEqual([]);
  });

  it("hides the card once data proves every step, without any tap", () => {
    expect(isChecklistVisible(store, "finyk")).toBe(true);
    const signals = Object.fromEntries(
      MODULE_CHECKLISTS.finyk.steps.map((s) => [s.id, true]),
    );
    expect(isChecklistVisible(store, "finyk", { signals })).toBe(false);
  });

  it("treats a falsy signal as 'no proof', never as an un-tick", () => {
    // routine.todayDone is 0 on a skipped day — that must not undo a step
    // the user already latched.
    markChecklistStepDone(store, "routine", "complete_habit");
    const steps = resolveChecklistSteps(store, "routine", {
      complete_habit: false,
    });
    const step = steps.find((s) => s.id === "complete_habit");
    expect(step?.done).toBe(true);
    // F3 (2026-09-11): `provenByData` no longer means "proven by a LIVE
    // signal this render" — it's folded with the permanent latch, so a
    // previously-latched step reads `provenByData: true` even though
    // today's signal is `false`. `done` and `provenByData` are the same
    // value now; see `resolveChecklistStepsFromState`.
    expect(step?.provenByData).toBe(true);
  });

  it("keeps a step done after its live signal disappears (F3: achievement is sticky, not a live data state)", () => {
    // Simulate the web auto-latch effect having already recorded the
    // step the first time real data proved it.
    markChecklistStepDone(store, "finyk", "add_expense");

    // The proving record is gone now (e.g. the user deleted a seeded
    // test expense) — the live signal reverts to "no proof".
    const steps = resolveChecklistSteps(store, "finyk", {
      add_expense: false,
    });
    const step = steps.find((s) => s.id === "add_expense");
    expect(step?.done).toBe(true);
    expect(step?.provenByData).toBe(true);
  });

  it("resolves impliedBy transitively (streak ⇒ complete ⇒ create)", () => {
    const steps = resolveChecklistSteps(store, "routine", {
      three_day_streak: true,
    });
    expect(steps.every((s) => s.done)).toBe(true);
    expect(
      getChecklistProgress(store, "routine", { three_day_streak: true }),
    ).toEqual({ completed: 3, total: 3 });
  });

  it("counts data-proven and tapped steps together", () => {
    markChecklistStepDone(store, "finyk", "view_analytics");
    const progress = getChecklistProgress(store, "finyk", {
      add_expense: true,
      set_budget: true,
    });
    expect(progress.completed).toBe(3);
    expect(progress.total).toBe(4);
  });
});

describe("moduleChecklist — FTUX window is account-scoped", () => {
  const now = Date.UTC(2026, 7, 7);
  const iso = (daysAgo: number) =>
    new Date(now - daysAgo * DAY_MS).toISOString();

  it("reads account age in whole days from the server timestamp", () => {
    expect(getAccountAgeDays(iso(30), now)).toBe(30);
    expect(getAccountAgeDays(null, now)).toBeNull();
    expect(getAccountAgeDays("not-a-date", now)).toBeNull();
  });

  it("treats a future createdAt as day 0 rather than as an old account", () => {
    expect(getAccountAgeDays(new Date(now + DAY_MS).toISOString(), now)).toBe(
      0,
    );
  });

  it("closes the window for an old account even when the device looks new", () => {
    // The exact reinstall case: localStorage wiped, so sessionDays is 1.
    expect(
      isWithinChecklistWindow({
        accountCreatedAt: iso(120),
        sessionDays: 1,
        now,
      }),
    ).toBe(false);
  });

  it("keeps the window open for a genuinely fresh account", () => {
    expect(
      isWithinChecklistWindow({
        accountCreatedAt: iso(2),
        sessionDays: 2,
        now,
      }),
    ).toBe(true);
  });

  it("falls back to device session days for an anonymous user", () => {
    expect(
      isWithinChecklistWindow({ accountCreatedAt: null, sessionDays: 3, now }),
    ).toBe(true);
    expect(
      isWithinChecklistWindow({ accountCreatedAt: null, sessionDays: 9, now }),
    ).toBe(false);
  });

  it("hides the card for an old account regardless of local state", () => {
    const store = createMemoryKVStore();
    expect(
      isChecklistVisible(store, "finyk", {
        accountCreatedAt: iso(200),
        sessionDays: 1,
        now,
      }),
    ).toBe(false);
  });
});
