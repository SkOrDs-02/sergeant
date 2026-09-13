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

  it("normalizes every apostrophe form to the canonical key", () => {
    // Ключі словника канонічні (`ʼ`, U+02BC — канон §1.10), а Whisper і
    // клавіатури віддають три різні символи. Перевіряємо КОЖЕН окремо:
    // саме цей тест 2026-08-26 знеміс себе сам, коли після заміни символу
    // почав двічі перевіряти той самий, і десять числівників мовчки
    // перестали б розпізнаватись.
    const forms = ["'", "’", "ʼ"];
    // Санітарна перевірка, що це справді три РІЗНІ символи: без неї тест
    // знову зможе тихо виродитись у потрійну перевірку одного й того ж.
    expect(new Set(forms).size).toBe(3);
    for (const a of forms) {
      expect(parseUaNumber(`п${a}ять`)).toBe(5);
      expect(parseUaNumber(`дев${a}яносто`)).toBe(90);
      expect(normalizeUaNumbers(`сто двадцять п${a}ять гривень`)).toBe(
        "125 гривень",
      );
    }
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

/**
 * ТОЧНА назва, а не підрядок.
 *
 * Цей блок існує через конкретний провал: усі перевірки назви вище
 * написані як `toMatch(/кава/i)`, тобто «містить сказане слово». Коли
 * зачистка одиниць мовчки перестала працювати і опис ставав «Кава
 * гривень», ЖОДЕН із них не почервонів — підрядок «кава» там присутній.
 * Тест, що питає «чи є те, що я сказав», не може помітити «а ще є три
 * слова, яких я не казав».
 *
 * Причина самого багу — `\b` поруч із кирилицею. У JavaScript межа слова
 * визначена через ASCII-`\w`, тож `/\bкава/u.test("кава")` — false; регекс
 * не «іноді промахується», а не збігається ніколи. Розбір — у докстрінгу
 * `NOT_WORD_CHAR` у `speechParsers.ts`.
 *
 * Тому тут саме `toBe`. Порівняння на рівність — єдине, що ловить
 * ЗАЙВЕ у виводі; будь-яке `toMatch`/`toContain` пропустить його знову.
 */
describe("назва не несе одиниць виміру (точне порівняння)", () => {
  it("витрата: одиниця валюти не лишається в описі", () => {
    expect(parseExpenseSpeech("кава сорок п'ять гривень")?.name).toBe("Кава");
    expect(parseExpenseSpeech("кава 45 гривень")?.name).toBe("Кава");
    expect(parseExpenseSpeech("продукти 320 грн")?.name).toBe("Продукти");
    expect(parseExpenseSpeech("обід 150 ₴")?.name).toBe("Обід");
    expect(parseExpenseSpeech("таксі 200")?.name).toBe("Таксі");
  });

  it("витрата: назва з двох слів лишається цілою", () => {
    expect(parseExpenseSpeech("бізнес ланч 250 гривень")?.name).toBe(
      "Бізнес ланч",
    );
  });

  it("тренування: кілограми й повтори не лишаються в назві вправи", () => {
    expect(
      parseWorkoutSetSpeech("жим вісімдесят кілограмів вісім разів")
        ?.exerciseName,
    ).toBe("Жим");
    expect(
      parseWorkoutSetSpeech("жим штанги 80 кг 8 разів")?.exerciseName,
    ).toBe("Жим штанги");
    expect(
      parseWorkoutSetSpeech("присідання 100 кг 5 повторень")?.exerciseName,
    ).toBe("Присідання");
  });

  it("їжа: грами, калорії й білок не лишаються в назві страви", () => {
    expect(parseMealSpeech("гречка 200 грам 180 ккал")?.name).toBe("Гречка");
    expect(
      parseMealSpeech("гречка двісті грам сто вісімдесят калорій")?.name,
    ).toBe("Гречка");
    expect(parseMealSpeech("омлет 250 грам 30 г білка")?.name).toBe("Омлет");
    expect(parseMealSpeech("овочевий салат 150г 45 калорій")?.name).toBe(
      "Овочевий салат",
    );
  });

  // Окремий випадок, бо `г`/`гр` — префікси справжніх слів. Якби зачистка
  // знімала їх без кириличного lookahead, «гречка» стала б «речка».
  it("їжа: назва, що починається на «г», не обрізається", () => {
    expect(parseMealSpeech("гречка 200 г")?.name).toBe("Гречка");
    expect(parseMealSpeech("горіхи 50 г")?.name).toBe("Горіхи");
  });
});

/**
 * Чергування і↔о в корені. «підхід» → «підход-и»: форма множини міняє
 * голосну, тож альтернатива `підхід\p{L}*` не збігається з нею взагалі —
 * і найприродніше «3 підходи» не розпізнавалось.
 */
describe("відмінкові форми одиниць", () => {
  it("«підходи» (множина з чергуванням) дає sets", () => {
    expect(parseWorkoutSetSpeech("станова 120 кг 3 підходи")?.sets).toBe(3);
    expect(parseWorkoutSetSpeech("станова 120 кг 3 підходів")?.sets).toBe(3);
    expect(parseWorkoutSetSpeech("станова 120 кг 3 підхід")?.sets).toBe(3);
  });

  it("і назва при цьому лишається чистою", () => {
    expect(
      parseWorkoutSetSpeech("станова 120 кг 3 підходи")?.exerciseName,
    ).toBe("Станова");
  });
});
