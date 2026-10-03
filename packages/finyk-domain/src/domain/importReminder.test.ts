import { describe, expect, it } from "vitest";

import {
  evaluateImportReminder,
  importReminderSnoozeUntil,
} from "./importReminder.js";

const NOW = new Date("2026-08-29T10:00:00.000Z");
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** ISO-дата рівно N днів тому від {@link NOW}. */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * MS_PER_DAY).toISOString();
}

/** Історія з рівним ритмом: N імпортів через `every` днів. */
function rhythm(every: number, count: number, lastDaysAgo: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    daysAgo(lastDaysAgo + i * every),
  );
}

describe("evaluateImportReminder", () => {
  it("мовчить, коли імпортів не було жодного", () => {
    expect(evaluateImportReminder({ sources: [], now: NOW })).toBeNull();
  });

  it("один імпорт 20 днів тому — ще не привід", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(20)] }],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("один імпорт 38 днів тому — плашка (дефолт 30 + запас 7)", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(38)] }],
      now: NOW,
    });
    expect(result).toEqual({
      source: "bank_statement",
      daysSince: 38,
      expectedIntervalDays: 30,
    });
  });

  it("місячний ритм: на 35-й день мовчить, на 38-й показує", () => {
    const quiet = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: rhythm(30, 4, 35) }],
      now: NOW,
    });
    expect(quiet).toBeNull();

    const shown = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: rhythm(30, 4, 38) }],
      now: NOW,
    });
    expect(shown?.daysSince).toBe(38);
    expect(shown?.expectedIntervalDays).toBe(30);
  });

  it("тижневий ритм не дає плашки на 9-й день (мінімум 10)", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: rhythm(7, 4, 9) }],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("тижневий ритм показує плашку на 15-й день", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: rhythm(7, 4, 15) }],
      now: NOW,
    });
    expect(result?.expectedIntervalDays).toBe(7);
    expect(result?.daysSince).toBe(15);
  });

  it("дуже рідкий ритм клампиться зверху 45 днями", () => {
    // Ритм 120 днів без клампа дав би поріг 127 і плашку раз на чотири
    // місяці. Кламп робить поріг 52, тож 60 днів тиші вже привід.
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: rhythm(120, 3, 60) }],
      now: NOW,
    });
    expect(result?.expectedIntervalDays).toBe(45);
    expect(result?.daysSince).toBe(60);
  });

  it("два батчі одного дня не вважаються ритмом", () => {
    // Виписка і скрін залиті одночасно 40 днів тому: нульовий інтервал
    // не має занизити очікування до клампа знизу.
    const result = evaluateImportReminder({
      sources: [
        {
          source: "bank_statement",
          recentAt: [daysAgo(40), daysAgo(40), daysAgo(70)],
        },
      ],
      now: NOW,
    });
    expect(result?.expectedIntervalDays).toBe(30);
  });

  it("«не нагадувати» глушить назавжди", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(400)] }],
      prefs: { bank_statement: { muted: true } },
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("snooze діє до своєї дати і відпускає після неї", () => {
    const source = { source: "bank_statement", recentAt: [daysAgo(60)] };

    expect(
      evaluateImportReminder({
        sources: [source],
        prefs: { bank_statement: { snoozedUntil: daysAgo(-3) } },
        now: NOW,
      }),
    ).toBeNull();

    expect(
      evaluateImportReminder({
        sources: [source],
        prefs: { bank_statement: { snoozedUntil: daysAgo(1) } },
        now: NOW,
      }),
    ).not.toBeNull();
  });

  it("мовчить перші 14 днів після реєстрації", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(60)] }],
      accountCreatedAt: daysAgo(10),
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("мовчить, поки відкритий драфт імпорту", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(60)] }],
      hasOpenDraft: true,
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("з двох прострочених джерел виграє те, що прострочене сильніше", () => {
    const result = evaluateImportReminder({
      sources: [
        { source: "bank_statement", recentAt: [daysAgo(40)] },
        { source: "bank_screenshot", recentAt: [daysAgo(90)] },
      ],
      now: NOW,
    });
    expect(result?.source).toBe("bank_screenshot");
  });

  it("майбутня дата імпорту дає 0 днів, не відʼємне число", () => {
    const result = evaluateImportReminder({
      sources: [{ source: "bank_statement", recentAt: [daysAgo(-5)] }],
      now: NOW,
    });
    expect(result).toBeNull();
  });

  it("биті дати ігноруються, а не валять функцію", () => {
    const result = evaluateImportReminder({
      sources: [
        { source: "bank_statement", recentAt: ["не дата", daysAgo(60)] },
      ],
      now: NOW,
    });
    expect(result?.daysSince).toBe(60);
  });
});

describe("importReminderSnoozeUntil", () => {
  it("ховає на половину звичного інтервалу", () => {
    const until = importReminderSnoozeUntil(30, NOW);
    expect(until).toBe(new Date(NOW.getTime() + 15 * MS_PER_DAY).toISOString());
  });

  it("але не менше ніж на тиждень", () => {
    const until = importReminderSnoozeUntil(7, NOW);
    expect(until).toBe(new Date(NOW.getTime() + 7 * MS_PER_DAY).toISOString());
  });
});
