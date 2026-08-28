import { describe, expect, it } from "vitest";

import { buildPastWorkoutTimes } from "./Workouts.helpers";

/** Локальні години з ISO — щоб не залежати від зони раннера. */
function localHours(iso: string): number {
  return new Date(iso).getHours();
}

function durationMin(a: string, b: string): number {
  return (Date.parse(b) - Date.parse(a)) / 60000;
}

describe("buildPastWorkoutTimes", () => {
  it("збирає пару міток зі звичайної денної сесії", () => {
    const t = buildPastWorkoutTimes("2026-08-09", "18:00", "19:15");
    expect(t).not.toBeNull();
    expect(localHours(t!.startedAt)).toBe(18);
    expect(durationMin(t!.startedAt, t!.endedAt)).toBe(75);
    expect(t!.crossesMidnight).toBe(false);
  });

  it("читає час як настінний годинник пристрою, а не UTC", () => {
    // Пін на узгодженість із `WorkoutTimeEditor`: якби тут був UTC, та сама
    // сесія показувала б різні години залежно від того, звідки її відкрили.
    const t = buildPastWorkoutTimes("2026-08-09", "07:30", "08:00");
    expect(localHours(t!.startedAt)).toBe(7);
  });

  it("переносить кінець на наступну добу для сесії через північ", () => {
    const t = buildPastWorkoutTimes("2026-08-09", "23:40", "00:20");
    expect(t!.crossesMidnight).toBe(true);
    expect(durationMin(t!.startedAt, t!.endedAt)).toBe(40);
    expect(new Date(t!.endedAt).getDate()).toBe(10);
  });

  it("однаковий час теж читає як добу, а не як нуль", () => {
    const t = buildPastWorkoutTimes("2026-08-09", "22:00", "22:00");
    expect(t!.crossesMidnight).toBe(true);
    expect(durationMin(t!.startedAt, t!.endedAt)).toBe(24 * 60);
  });

  it("кінець ніколи не буває раніше за початок", () => {
    // Головний інваріант: перевернута пара зламала б і тривалість, і сортування
    // журналу, і підрахунок стріку.
    for (const [s, e] of [
      ["18:00", "19:00"],
      ["23:59", "00:01"],
      ["06:00", "05:00"],
    ] as const) {
      const t = buildPastWorkoutTimes("2026-08-09", s, e);
      expect(Date.parse(t!.endedAt), `${s}→${e}`).toBeGreaterThan(
        Date.parse(t!.startedAt),
      );
    }
  });

  it("переживає перехід через межу місяця", () => {
    const t = buildPastWorkoutTimes("2026-08-31", "23:30", "00:30");
    expect(new Date(t!.endedAt).getMonth()).toBe(8); // вересень
    expect(new Date(t!.endedAt).getDate()).toBe(1);
  });

  describe("inFuture", () => {
    // `now` передаємо явно — інакше тест був би привʼязаний до дня прогону
    // і почав би падати (або тихо ставати вакуумним) через рік.
    const NOW = new Date("2026-08-09T12:00:00");

    it("не позначає майбутнім сесію, що вже завершилась", () => {
      const t = buildPastWorkoutTimes("2026-08-09", "07:00", "08:30", NOW);
      expect(t!.inFuture).toBe(false);
    });

    it("ловить майбутній ЧАС у межах сьогоднішньої дати", () => {
      // `max` на полі дати цього не бачить: доба та сама, майбутній лише час.
      const t = buildPastWorkoutTimes("2026-08-09", "18:00", "19:00", NOW);
      expect(t!.inFuture).toBe(true);
    });

    it("ловить майбутню дату", () => {
      const t = buildPastWorkoutTimes("2026-08-20", "18:00", "19:00", NOW);
      expect(t!.inFuture).toBe(true);
    });

    it("сесія через північ на сьогоднішній даті — завжди майбутня", () => {
      // Перенос на завтра робить кінець майбутнім навіть тоді, коли обидва
      // введені часи вже минули. Це не баг форми, а причина показувати підпис.
      const t = buildPastWorkoutTimes("2026-08-09", "02:00", "01:00", NOW);
      expect(t!.crossesMidnight).toBe(true);
      expect(t!.inFuture).toBe(true);
    });
  });

  it.each([
    ["без дати", "", "18:00", "19:00"],
    ["без початку", "2026-08-09", "", "19:00"],
    ["без кінця", "2026-08-09", "18:00", ""],
    ["сміття в даті", "не-дата", "18:00", "19:00"],
    ["сміття в часі", "2026-08-09", "25:99", "19:00"],
  ])("віддає null на неповний ввід: %s", (_label, d, s, e) => {
    expect(buildPastWorkoutTimes(d, s, e)).toBeNull();
  });
});
