import { describe, expect, it } from "vitest";
import { defaultRoutineState } from "@sergeant/routine-domain";
import { mergeRoutineStateAddMissing } from "./routineBackupMerge";

const habit = (id: string, name: string) => ({ id, name });

describe("mergeRoutineStateAddMissing", () => {
  const current = {
    ...defaultRoutineState(),
    habits: [habit("h1", "Вода"), habit("h2", "Біг")],
    habitOrder: ["h1", "h2"],
    completions: { h1: ["2026-09-01", "2026-09-03"] },
    completionNotes: { "h1__2026-09-01": "поточна" },
    tags: [{ id: "t1", name: "здоровʼя" }],
  };
  const incoming = {
    ...defaultRoutineState(),
    habits: [habit("h1", "Вода (стара назва)"), habit("h3", "Читання")],
    habitOrder: ["h3", "h1"],
    completions: { h1: ["2026-09-02", "2026-09-03"], h3: ["2026-08-01"] },
    completionNotes: {
      "h1__2026-09-01": "з файлу",
      "h3__2026-08-01": "нова",
    },
    tags: [{ id: "t2", name: "ранок" }],
  };

  it("не видаляє нічого поточного: усі звички й відмітки лишаються", () => {
    const out = mergeRoutineStateAddMissing(current, incoming);
    expect(out.habits.map((h) => h.id)).toEqual(["h1", "h2", "h3"]);
    expect(out.tags.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(out.completions["h1"]).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
    ]);
    expect(out.completions["h3"]).toEqual(["2026-08-01"]);
  });

  it("наявна звичка не перезаписується файлом", () => {
    const out = mergeRoutineStateAddMissing(current, incoming);
    expect(out.habits.find((h) => h.id === "h1")?.name).toBe("Вода");
    expect(out.completionNotes["h1__2026-09-01"]).toBe("поточна");
    expect(out.completionNotes["h3__2026-08-01"]).toBe("нова");
  });

  it("порядок: поточний спершу, нові звички в кінці, без дублів", () => {
    const out = mergeRoutineStateAddMissing(current, incoming);
    expect(out.habitOrder).toEqual(["h1", "h2", "h3"]);
  });

  it("налаштування лишаються поточними", () => {
    const withPrefs = { ...current, prefs: { showFinykSubscriptions: false } };
    const out = mergeRoutineStateAddMissing(withPrefs, {
      ...incoming,
      prefs: { showFinykSubscriptions: true },
    });
    expect(out.prefs).toEqual({ showFinykSubscriptions: false });
  });
});
