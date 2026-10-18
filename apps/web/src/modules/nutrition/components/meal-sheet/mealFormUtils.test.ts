import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  deviceDayKey,
  deviceWallClockToInstant,
  getDayMacros,
} from "@sergeant/nutrition-domain";
import { macrosForGrams } from "../../lib/foodDb/foodDb";
import { currentTime, emptyForm, macroToFieldString } from "./mealFormUtils";

// mealTypeByNow comes from @sergeant/nutrition-domain via the mealTypes re-export.
// We stub it so tests are not hour-sensitive.
vi.mock("../../lib/mealTypes", () => ({
  mealTypeByNow: () => "lunch" as const,
}));

describe("emptyForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-02T12:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a form with empty name when no photoResult provided", () => {
    const form = emptyForm();
    expect(form.name).toBe("");
  });

  it("sets mealType from mealTypeByNow (stubbed as lunch)", () => {
    const form = emptyForm();
    expect(form.mealType).toBe("lunch");
  });

  it("formats the time as HH:MM using current clock", () => {
    const form = emptyForm();
    expect(form.time).toMatch(/^\d{2}:\d{2}$/);
  });

  /**
   * Регресія: `currentTime()` брав київський настінний час, а день-ключ
   * журналу — девайсовий (ADR-0078). О 23:53 UTC пара виходила
   * «2026-08-23 + 02:53» і складалась у момент, якого не було. Пінимо
   * пізній вечір UTC (= наступна доба за Києвом) і перевіряємо ОБИДВІ
   * половини: день лишається 23-тім, момент дорівнює фактичному.
   */
  it("пізній вечір UTC: час доби девайсовий, момент — справжній", () => {
    const realInstant = new Date("2026-08-23T23:53:00.000Z");
    vi.setSystemTime(realInstant);

    const time = currentTime();
    const dateKey = deviceDayKey(realInstant);
    expect(time).toBe("23:53");
    expect(dateKey).toBe("2026-08-23");

    const eatenAt = deviceWallClockToInstant(dateKey, time);
    expect(eatenAt.slice(0, 10)).toBe("2026-08-23");
    expect(new Date(eatenAt).getTime()).toBe(realInstant.getTime());
  });

  it("initializes macro fields as empty strings when no photoResult", () => {
    const form = emptyForm();
    expect(form.kcal).toBe("");
    expect(form.protein_g).toBe("");
    expect(form.fat_g).toBe("");
    expect(form.carbs_g).toBe("");
  });

  it("initializes err as empty string", () => {
    expect(emptyForm().err).toBe("");
  });

  it("uses dishName from photoResult when provided", () => {
    const form = emptyForm({ dishName: "Гречана каша" });
    expect(form.name).toBe("Гречана каша");
  });

  it("uses null dishName → empty string", () => {
    const form = emptyForm({ dishName: null });
    expect(form.name).toBe("");
  });

  it("populates kcal from photoResult.macros (до 0.1)", () => {
    const form = emptyForm({ macros: { kcal: 312.7 } });
    expect(form.kcal).toBe("312.7");
  });

  it("populates protein_g from photoResult.macros (до 0.1)", () => {
    const form = emptyForm({ macros: { protein_g: 24.3 } });
    expect(form.protein_g).toBe("24.3");
  });

  it("populates fat_g from photoResult.macros (до 0.1)", () => {
    const form = emptyForm({ macros: { fat_g: 8.9 } });
    expect(form.fat_g).toBe("8.9");
  });

  it("populates carbs_g from photoResult.macros (до 0.1)", () => {
    const form = emptyForm({ macros: { carbs_g: 45.1 } });
    expect(form.carbs_g).toBe("45.1");
  });

  it("leaves kcal empty when photoResult.macros.kcal is null", () => {
    const form = emptyForm({ macros: { kcal: null } });
    expect(form.kcal).toBe("");
  });

  it("handles partial macros — fills present fields only", () => {
    const form = emptyForm({ macros: { kcal: 500, protein_g: 30 } });
    expect(form.kcal).toBe("500");
    expect(form.protein_g).toBe("30");
    expect(form.fat_g).toBe(""); // not provided
    expect(form.carbs_g).toBe(""); // not provided
  });

  it("handles null photoResult gracefully (same as no arg)", () => {
    const form = emptyForm(null);
    expect(form.name).toBe("");
    expect(form.kcal).toBe("");
  });

  it("blanks the name when dishName is the server's unidentified-food fallback literal", () => {
    // AI photo analysis couldn't identify the food — the server falls back
    // to the literal "Результат" (see nutritionResponse.ts). Prefilling it
    // reads as a real name, so we blank it and let name-required validation
    // nudge the user to type one instead.
    const form = emptyForm({ dishName: "Результат" });
    expect(form.name).toBe("");
  });
});

describe("macroToFieldString: сума позицій = підсумок дня", () => {
  it("тримає 0.1 і не округлює до цілих", () => {
    expect(macroToFieldString(12.34)).toBe("12.3");
    expect(macroToFieldString(12)).toBe("12");
    expect(macroToFieldString(0.04)).toBe("0");
  });

  it("сума збережених позицій дорівнює підсумку дня з точністю показу", () => {
    const per100 = { kcal: 155, protein_g: 12.4, fat_g: 10.6, carbs_g: 1.1 };
    const grams = [83, 47, 121];
    const items = grams.map((g) => {
      const m = macrosForGrams(per100, g);
      // те, що форма пише в поля, а зберігання парсить назад
      return {
        kcal: Number(macroToFieldString(m.kcal)),
        protein_g: Number(macroToFieldString(m.protein_g)),
        fat_g: Number(macroToFieldString(m.fat_g)),
        carbs_g: Number(macroToFieldString(m.carbs_g)),
      };
    });
    const log = {
      "2026-09-29": { meals: items.map((macros) => ({ macros })) },
    };
    const day = getDayMacros(log as never, "2026-09-29");
    for (const k of ["kcal", "protein_g", "fat_g", "carbs_g"] as const) {
      const sum = items.reduce((a, m) => a + m[k], 0);
      expect(Math.round(day[k] * 10) / 10).toBe(Math.round(sum * 10) / 10);
    }
    // цілі округлення позицій розходилися б з підсумком (регресія NC1)
    const roundedSum = grams
      .map((g) => Math.round(macrosForGrams(per100, g).protein_g))
      .reduce((a, b) => a + b, 0);
    expect(roundedSum).not.toBe(Math.round(day.protein_g * 10) / 10);
  });
});
