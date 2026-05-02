import { describe, expect, it } from "vitest";
import {
  normalizeUaNumbers,
  parseExpenseSpeech,
  parseMealSpeech,
  parseUaNumber,
  parseWorkoutSetSpeech,
} from "./speechParsers";

describe("parseUaNumber", () => {
  it("parses pure digits", () => {
    expect(parseUaNumber("80")).toBe(80);
    expect(parseUaNumber("80.5")).toBe(80.5);
    expect(parseUaNumber("80,5")).toBe(80.5);
  });

  it("parses single Ukrainian word", () => {
    expect(parseUaNumber("вісімдесят")).toBe(80);
    expect(parseUaNumber("п'ять")).toBe(5);
  });

  it("parses compound Ukrainian numbers", () => {
    expect(parseUaNumber("сто двадцять п'ять")).toBe(125);
    expect(parseUaNumber("двісті п'ятдесят")).toBe(250);
    expect(parseUaNumber("одна тисяча двісті")).toBe(1200);
    expect(parseUaNumber("дві тисячі триста сорок")).toBe(2340);
  });

  it("returns null on non-numeric input", () => {
    expect(parseUaNumber("кава")).toBeNull();
    expect(parseUaNumber("")).toBeNull();
    expect(parseUaNumber("   ")).toBeNull();
  });

  it("normalizes typographic apostrophes", () => {
    // typographic right-quote and ASCII single-quote both map to the same key
    expect(parseUaNumber("п’ять")).toBe(5);
    expect(parseUaNumber("дев’яносто")).toBe(90);
  });
});

describe("normalizeUaNumbers", () => {
  it("replaces a single word number with digits", () => {
    expect(normalizeUaNumbers("вісімдесят кілограмів")).toBe("80 кілограмів");
  });

  it("replaces compound words with a single digit token", () => {
    expect(normalizeUaNumbers("сто двадцять п'ять гривень")).toBe(
      "125 гривень",
    );
    expect(normalizeUaNumbers("одна тисяча двісті")).toBe("1200");
  });

  it("preserves digit tokens unchanged", () => {
    expect(normalizeUaNumbers("80 кг 8 разів")).toBe("80 кг 8 разів");
  });

  it("handles multiple separate runs", () => {
    expect(normalizeUaNumbers("жим вісімдесят кілограмів вісім разів")).toBe(
      "жим 80 кілограмів 8 разів",
    );
  });

  it("preserves trailing punctuation on the last run word", () => {
    expect(normalizeUaNumbers("Жим, вісімдесят, вісім разів.")).toContain(
      "80,",
    );
    expect(normalizeUaNumbers("Жим, вісімдесят, вісім разів.")).toContain(
      "8 разів.",
    );
  });

  it("leaves non-number words untouched", () => {
    expect(normalizeUaNumbers("кава смачна")).toBe("кава смачна");
  });
});

describe("parseExpenseSpeech", () => {
  it("returns null on empty input", () => {
    expect(parseExpenseSpeech("")).toBeNull();
    expect(parseExpenseSpeech("   ")).toBeNull();
  });

  it("parses digit + currency", () => {
    const r = parseExpenseSpeech("кава 60 гривень");
    expect(r).not.toBeNull();
    expect(r?.amount).toBe(60);
    expect(r?.name).toMatch(/кава/i);
  });

  it("parses inflected currency form (гривень)", () => {
    expect(parseExpenseSpeech("таксі 250 гривень")?.amount).toBe(250);
    // Some Russian-Ukrainian transliterations Whisper emits
    expect(parseExpenseSpeech("таксі 250 гривен")?.amount).toBe(250);
  });

  it("parses word-form numbers", () => {
    const r = parseExpenseSpeech("кава шістдесят гривень");
    expect(r?.amount).toBe(60);
    expect(r?.name).toMatch(/кава/i);
  });

  it("parses compound word-form numbers", () => {
    const r = parseExpenseSpeech("продукти триста двадцять п'ять гривень");
    expect(r?.amount).toBe(325);
    expect(r?.name).toMatch(/продукти/i);
  });

  it("falls back to bare number when no currency unit", () => {
    expect(parseExpenseSpeech("кава 60")?.amount).toBe(60);
  });
});

describe("parseWorkoutSetSpeech", () => {
  it("returns null on empty input", () => {
    expect(parseWorkoutSetSpeech("")).toBeNull();
  });

  it("parses digit form (canonical)", () => {
    const r = parseWorkoutSetSpeech("жим 80 кг 8 разів");
    expect(r?.weight).toBe(80);
    expect(r?.reps).toBe(8);
    expect(r?.exerciseName).toMatch(/жим/i);
  });

  it("parses Ukrainian word-form numbers (Whisper short-utterance habit)", () => {
    const r = parseWorkoutSetSpeech("жим вісімдесят кілограмів вісім разів");
    expect(r?.weight).toBe(80);
    expect(r?.reps).toBe(8);
  });

  it("parses inflected unit forms", () => {
    expect(parseWorkoutSetSpeech("жим 80 кілограмів")?.weight).toBe(80);
    expect(parseWorkoutSetSpeech("жим 80 кілограм")?.weight).toBe(80);
    expect(parseWorkoutSetSpeech("жим 80 кг")?.weight).toBe(80);
    expect(parseWorkoutSetSpeech("8 повторень")?.reps).toBe(8);
    expect(parseWorkoutSetSpeech("8 повторів")?.reps).toBe(8);
    expect(parseWorkoutSetSpeech("8 повторення")?.reps).toBe(8);
    expect(parseWorkoutSetSpeech("8 разів")?.reps).toBe(8);
    expect(parseWorkoutSetSpeech("8 раз")?.reps).toBe(8);
  });

  it("parses English form", () => {
    const r = parseWorkoutSetSpeech("bench press 80 kg 8 reps");
    expect(r?.weight).toBe(80);
    expect(r?.reps).toBe(8);
  });

  it("parses lbs and converts to kg", () => {
    const r = parseWorkoutSetSpeech("bench press 180 lbs 8 reps");
    expect(r?.weight).toBe(82); // 180 * 0.453592 ≈ 81.65 → rounded
    expect(r?.reps).toBe(8);
  });

  it("returns parsed object with all-null metrics when nothing matches (caller must guard)", () => {
    const r = parseWorkoutSetSpeech("ой не виходить нічого");
    expect(r).not.toBeNull();
    expect(r?.weight).toBeNull();
    expect(r?.reps).toBeNull();
    expect(r?.sets).toBeNull();
  });
});

describe("parseMealSpeech", () => {
  it("returns null on empty input", () => {
    expect(parseMealSpeech("")).toBeNull();
  });

  it("parses digit form", () => {
    const r = parseMealSpeech("гречка 200 грам 180 ккал");
    expect(r?.grams).toBe(200);
    expect(r?.kcal).toBe(180);
    expect(r?.name).toMatch(/гречка/i);
  });

  it("parses word-form numbers (Whisper short-utterance habit)", () => {
    const r = parseMealSpeech("гречка двісті грамів");
    expect(r?.grams).toBe(200);
    expect(r?.name).toMatch(/гречка/i);
  });

  it("parses inflected unit forms", () => {
    expect(parseMealSpeech("гречка 200 грамів")?.grams).toBe(200);
    expect(parseMealSpeech("гречка 200 грама")?.grams).toBe(200);
    expect(parseMealSpeech("гречка 200 г")?.grams).toBe(200);
    expect(parseMealSpeech("курка 180 калорій")?.kcal).toBe(180);
    expect(parseMealSpeech("курка 180 кілокалорій")?.kcal).toBe(180);
  });

  it("parses combined kcal + grams", () => {
    const r = parseMealSpeech("омлет двісті грамів триста ккал");
    expect(r?.grams).toBe(200);
    expect(r?.kcal).toBe(300);
  });
});
