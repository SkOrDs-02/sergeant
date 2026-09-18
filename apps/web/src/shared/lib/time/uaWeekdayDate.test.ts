/**
 * Last validated: 2026-09-02
 * Status: Active
 */
import { describe, expect, it } from "vitest";
import { formatUaWeekdayDate } from "./uaWeekdayDate";

const SEPT_2 = new Date(2026, 8, 2); // середа

describe("formatUaWeekdayDate", () => {
  it("дає називний відмінок дня тижня", () => {
    expect(formatUaWeekdayDate(SEPT_2)).toBe("середа, 2 вересня");
  });

  it("день тижня форматується ОКРЕМО від дати", () => {
    // Регресія на причину: якщо хтось згорне це в один виклик із повним
    // набором опцій, Chromium поверне «середу». У Node обидва варіанти
    // дають «середа», тож тест мусить перевіряти саме форму виклику —
    // звідси порівняння з еталонним склеюванням, а не з константою.
    const weekday = new Intl.DateTimeFormat("uk-UA", {
      weekday: "long",
    }).format(SEPT_2);
    expect(formatUaWeekdayDate(SEPT_2).startsWith(`${weekday},`)).toBe(true);
  });

  it("дописує рік на вимогу", () => {
    expect(formatUaWeekdayDate(SEPT_2, { withYear: true })).toContain("2026");
  });

  it("робить першу літеру великою на вимогу", () => {
    expect(formatUaWeekdayDate(SEPT_2, { capitalize: true })).toBe(
      "Середа, 2 вересня",
    );
  });

  it("шанує часову зону", () => {
    // 2026-09-02T22:30Z — у Києві це вже 3 вересня (UTC+3).
    const late = new Date(Date.UTC(2026, 8, 2, 22, 30));
    expect(formatUaWeekdayDate(late, { timeZone: "Europe/Kyiv" })).toBe(
      "четвер, 3 вересня",
    );
    expect(formatUaWeekdayDate(late, { timeZone: "UTC" })).toBe(
      "середа, 2 вересня",
    );
  });

  it("повертає порожній рядок на невалідній даті", () => {
    expect(formatUaWeekdayDate(new Date("нісенітниця"))).toBe("");
  });
});
