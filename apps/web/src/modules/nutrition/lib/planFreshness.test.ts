import { describe, expect, it } from "vitest";

import { describePlanFreshness } from "./planFreshness";

/** Локальний полудень — щоб тест не залежав від часової зони раннера. */
function at(y: number, m: number, d: number, h = 12): Date {
  return new Date(y, m - 1, d, h);
}

describe("describePlanFreshness", () => {
  it("мовчить про сьогоднішній план", () => {
    const now = at(2026, 8, 10);
    expect(describePlanFreshness(at(2026, 8, 10, 8).getTime(), now)).toEqual({
      stale: false,
      label: null,
    });
  });

  it("сьогоднішнім вважає весь день пристрою, а не останні 24 години", () => {
    // План о 00:05, зараз 23:55 — це та сама доба, тож підпису бути не має.
    const now = at(2026, 8, 10, 23);
    expect(describePlanFreshness(at(2026, 8, 10, 0).getTime(), now).stale).toBe(
      false,
    );
  });

  it("називає вчорашній план вчорашнім", () => {
    const now = at(2026, 8, 10);
    expect(describePlanFreshness(at(2026, 8, 9).getTime(), now)).toEqual({
      stale: true,
      label: "згенеровано вчора",
    });
  });

  it("план кількаденної давнини підписує датою", () => {
    const now = at(2026, 8, 10);
    expect(describePlanFreshness(at(2026, 8, 7).getTime(), now)).toEqual({
      stale: true,
      label: "згенеровано 7 серпня",
    });
  });

  it("вважає вчорашнім план, зроблений за кілька хвилин до півночі", () => {
    // Найдошкульніший випадок: 23:58 і 00:02 — різниця чотири хвилини, але
    // доби різні, і заголовок «на сьогодні» був би неправдою.
    const now = at(2026, 8, 10, 0);
    now.setMinutes(2);
    const savedAt = at(2026, 8, 9, 23);
    savedAt.setMinutes(58);
    expect(describePlanFreshness(savedAt.getTime(), now).label).toBe(
      "згенеровано вчора",
    );
  });

  it("коректно перестрибує через межу місяця", () => {
    const now = at(2026, 9, 1);
    expect(describePlanFreshness(at(2026, 8, 31).getTime(), now).label).toBe(
      "згенеровано вчора",
    );
  });

  it.each([
    ["нуль", 0],
    ["null", null],
    ["undefined", undefined],
    ["NaN", Number.NaN],
  ])("мовчить, коли мітки часу немає: %s", (_label, savedAt) => {
    // Записи зі старих версій мітки не мають. «Згенеровано 1 січня 1970»
    // було б гірше за відсутність підпису.
    expect(describePlanFreshness(savedAt, at(2026, 8, 10))).toEqual({
      stale: false,
      label: null,
    });
  });
});
