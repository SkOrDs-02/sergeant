/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";

// `?raw` вимагає реальне імʼя файлу: без розширення vite його не знайде.
// eslint-disable-next-line import/extensions
import momentsSource from "./moments.ts?raw";
// eslint-disable-next-line import/extensions
import mealSource from "./mealMoments.ts?raw";
// eslint-disable-next-line import/extensions
import workoutSource from "./workoutMoments.ts?raw";
import { applyMoment, readMoments } from "./momentsStore";

describe("рядок живе до кінця доби", () => {
  beforeEach(() => localStorage.clear());

  it("переживає перезавантаження і зникає на новому день-ключі", () => {
    applyMoment("2026-08-20", "routine", {
      kind: "dayClosed",
      target: "day",
    });
    // «Перезавантаження»: читаємо зі сховища заново, без памʼяті модуля.
    expect(readMoments("2026-08-20")).toEqual({
      day: { kind: "dayClosed", target: "day" },
    });
    expect(readMoments("2026-08-21")).toEqual({});
  });

  it("знята відмітка прибирає рядки, яких запис більше не підтверджує", () => {
    applyMoment("2026-08-20", "routine", {
      kind: "streak",
      target: "a",
      value: 7,
    });
    applyMoment("2026-08-20", "routine", {
      kind: "dayClosed",
      target: "day",
    });
    applyMoment("2026-08-20", "routine", null, ["a", "day"]);
    expect(readMoments("2026-08-20")).toEqual({});
  });

  it("зіпсований запис у сховищі читається як порожній, а не падає", () => {
    localStorage.setItem("hub_moments_today_v1", "{not json");
    expect(readMoments("2026-08-20")).toEqual({});
  });
});

/**
 * ADR-0096 § Compliance: пороги в коді відгуку імпортуються з рушіїв, не
 * дублюються literal-ами. Числа порогів тут не мають зʼявитись ніде, крім
 * частки наближення.
 */
describe("пороги імпортовані, а не переписані", () => {
  it.each([
    ["moments.ts", momentsSource],
    ["mealMoments.ts", mealSource],
    ["workoutMoments.ts", workoutSource],
  ])("у %s немає чисел порогів", (_name, raw) => {
    const source = raw
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/\b(7|10|16|20|28|30|50|100)\b/);
  });
});
