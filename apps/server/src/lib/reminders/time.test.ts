import { describe, expect, it } from "vitest";

import { kyivDayKey, kyivDayKeyMinusDays, kyivHm } from "./time.js";

describe("київський час у sweep-і", () => {
  it("рахує день за Києвом, а не за UTC контейнера", () => {
    // 2026-08-03 21:30 UTC — це вже 00:30 наступної доби за Києвом (UTC+3).
    // Без явної зони нагадування о 00:30 поїхало б у попередній день.
    const at = new Date("2026-08-03T21:30:00Z");
    expect(kyivDayKey(at)).toBe("2026-08-04");
    expect(kyivHm(at)).toBe("00:30");
  });

  it("не зʼїжджає на добу через зимовий зсув", () => {
    // Взимку Київ — UTC+2.
    const at = new Date("2026-01-15T22:30:00Z");
    expect(kyivDayKey(at)).toBe("2026-01-16");
    expect(kyivHm(at)).toBe("00:30");
  });

  it("віддає опівніч як 00:00, а не 24:00", () => {
    expect(kyivHm(new Date("2026-08-03T21:00:00Z"))).toBe("00:00");
  });

  it("віднімає календарні доби, а не 24-годинні інтервали", () => {
    // Вікно з переходом на літній час: Україна переводить годинники
    // в останню неділю березня. Відніманням мілісекунд межа зʼїхала б.
    expect(kyivDayKeyMinusDays(new Date("2026-04-01T12:00:00Z"), 7)).toBe(
      "2026-03-25",
    );
  });
});
