/**
 * Відповідь без цифр і блок точних значень (ADR-0097). Приклади - реальні
 * відповіді зі стенду 2026-08-25 (див. `fixtures/`), коли їх можна взяти.
 */

import { describe, expect, it } from "vitest";
import {
  EXACT_VALUES_TITLE,
  MAX_EXACT_VALUES,
  MIN_VISIBLE_LETTERS,
  NUMBER_FREE_INTRO,
  NUMBER_FREE_INTRO_NO_VALUES,
  collectLabeledValues,
  extractNumberTokens,
  renderExactValuesBlock,
  renderNumberFreeAnswer,
  stripDigitSentences,
  verifyAnswerNumbers,
} from "./index.js";
import { EVAL_DOC_SCENARIOS } from "./fixtures/evalDocScenarios.js";
import { REAL_CASES, realCase } from "./fixtures/index.js";

const NBSP = "\u00A0";
const NNBSP = "\u202F";

describe("stripDigitSentences", () => {
  it("прибирає речення з цифрою, лишає решту абзацу", () => {
    const text =
      "Я перевірив твої регулярні платежі і нічого підозрілого не бачу. Оренда 12000 грн на місяць. Далі все спокійно, мені нема що додати.";
    expect(stripDigitSentences(text)).toBe(
      "Я перевірив твої регулярні платежі і нічого підозрілого не бачу. Далі все спокійно, мені нема що додати.",
    );
  });

  it("прибирає пункти списку з цифрою, лишає чисті", () => {
    const text = [
      "Ось що я бачу у твоїх витратах за місяць:",
      "- **Оренда**: 12000 грн",
      "- **Підписки**: переглянь, чи всі потрібні",
      "- **Спортзал**: 800 грн",
    ].join("\n");
    expect(stripDigitSentences(text)).toBe(
      [
        "Ось що я бачу у твоїх витратах за місяць:",
        "- **Підписки**: переглянь, чи всі потрібні",
      ].join("\n"),
    );
  });

  it("цифра в маркері нумерованого списку не рахується, нумерація йде з одиниці", () => {
    const text = [
      "Почни з таких кроків для наведення ладу у фінансах:",
      "1. Склади бюджет на місяць вперед",
      "2. Сплати 5000 грн боргу",
      "3. Відкрий окремий рахунок для заощаджень",
    ].join("\n");
    expect(stripDigitSentences(text)).toBe(
      [
        "Почни з таких кроків для наведення ладу у фінансах:",
        "1. Склади бюджет на місяць вперед",
        "2. Відкрий окремий рахунок для заощаджень",
      ].join("\n"),
    );
  });

  it("підводка, за якою усі пункти стерто, і заголовок над порожнечею зникають", () => {
    const text = [
      "Я перевірив твої регулярні платежі і ось що знайшов. Ось твої щомісячні витрати:",
      "- Оренда: 12000 грн",
      "- Інтернет: 250 грн",
      "",
      "**Підсумок**",
      "",
      "**Фінанси**",
      "Усе записано в твоєму журналі, нічого зайвого тут немає.",
    ].join("\n");
    expect(stripDigitSentences(text)).toBe(
      [
        "Я перевірив твої регулярні платежі і ось що знайшов.",
        "",
        "**Фінанси**",
        "Усе записано в твоєму журналі, нічого зайвого тут немає.",
      ].join("\n"),
    );
  });

  it("таблиця з цифрами зникає цілком, без цифр - лишається", () => {
    const withDigits = [
      "Подивись на таблицю, там усе по категоріях і місяцях.",
      "",
      "| Категорія | Сума |",
      "| --- | --- |",
      "| Продукти | 8420 |",
    ].join("\n");
    expect(stripDigitSentences(withDigits)).toBe(
      "Подивись на таблицю, там усе по категоріях і місяцях.",
    );
    const clean = [
      "Подивись на таблицю, там усе по категоріях і місяцях.",
      "",
      "| Категорія | Статус |",
      "| --- | --- |",
      "| Продукти | у нормі |",
    ].join("\n");
    expect(stripDigitSentences(clean)).toBe(clean);
  });

  it("скорочення «тис.» не рве речення навпіл", () => {
    const text =
      "Підписки обійшлись у 34 тис. грн за рік. Це суттєва частка бюджету, варто переглянути.";
    expect(stripDigitSentences(text)).toBe(
      "Це суттєва частка бюджету, варто переглянути.",
    );
  });

  it("лишається менше за поріг літер: порожній рядок", () => {
    expect(
      stripDigitSentences("Витрати 960 грн. Остання покупка 120 грн."),
    ).toBe("");
    expect(stripDigitSentences("Так. Разом 5200 грн.")).toBe("");
    expect("Тримайся!".replace(/[^\p{L}]/gu, "").length).toBeLessThan(
      MIN_VISIBLE_LETTERS,
    );
    expect(stripDigitSentences("Тримайся! Разом 5200 грн.")).toBe("");
  });

  it("на реальній відповіді: жодної цифри не лишається", () => {
    for (const c of REAL_CASES) {
      expect(stripDigitSentences(c.answer)).not.toMatch(/\d/);
    }
  });

  it("текст без цифр лишається як є (з точністю до крайніх пробілів)", () => {
    const text =
      "Цього тижня транзакцій поки що немає, а бюджет ще не налаштований. Якщо хочеш, можу допомогти задати ліміт витрат на місяць.";
    expect(stripDigitSentences(`  ${text}\n`)).toBe(text);
  });
});

describe("collectLabeledValues", () => {
  const scenario = EVAL_DOC_SCENARIOS["chatCategories"]!;
  const tool = `<tool_output tool="${scenario.tool}">${scenario.output}</tool_output>`;

  it("бере підписи перед числами з реального результату інструмента", () => {
    const pairs = collectLabeledValues([tool]);
    expect(pairs.map((p) => [p.label, p.value, p.unit])).toEqual([
      ["Продукти", 8420, "money"],
      ["Транспорт", 1310, "money"],
      ["Їжа поза домом", 4870, "money"],
      ["Комуналка", 2600, "money"],
      ["Підписки", 890, "money"],
      ["Дохід", 32000, "money"],
    ]);
  });

  it("дві суми з однаковим підписом й значенням не дублюються", () => {
    const pairs = collectLabeledValues(["Дохід 32000 грн", "Дохід 32000 грн"]);
    expect(pairs).toHaveLength(1);
  });

  it("поріг ≥100 діє й тут, а пара без підпису відкидається", () => {
    expect(collectLabeledValues(["Метро 95 грн"])).toEqual([]);
    expect(collectLabeledValues(["120 грн"])).toEqual([]);
    expect(collectLabeledValues(["tx_9f21 — 2026-07-29, 120 грн"])).toEqual([]);
  });

  it("період після одиниці зберігається", () => {
    const pairs = collectLabeledValues([
      "оренда 12000 грн/міс; інтернет 250 грн/міс",
    ]);
    expect(pairs.map((p) => [p.label, p.per])).toEqual([
      ["Оренда", "/міс"],
      ["Інтернет", "/міс"],
    ]);
  });

  it("обмежується limit", () => {
    const text = Array.from(
      { length: 30 },
      (_, i) => `стаття${String.fromCharCode(97 + (i % 26))} ${100 + i} грн`,
    ).join("; ");
    expect(collectLabeledValues([text]).length).toBe(MAX_EXACT_VALUES);
    expect(collectLabeledValues([text], 3)).toHaveLength(3);
  });
});

describe("renderExactValuesBlock", () => {
  it("рендерить markdown зі значеннями у форматі продукту", () => {
    const block = renderExactValuesBlock([
      { label: "Продукти", value: 8420, unit: "money", per: null },
      { label: "Підписки", value: 34000, unit: "money", per: "/міс" },
      { label: "Вечеря", value: 2500, unit: "kcal", per: null },
      { label: "Жим", value: 120, unit: "kg", per: null },
      { label: "Гречка", value: 1234.5, unit: "g", per: null },
    ]);
    expect(block).toBe(
      [
        `**${EXACT_VALUES_TITLE}**`,
        `- Продукти: 8${NBSP}420${NNBSP}₴`,
        `- Підписки: 34${NBSP}000${NNBSP}₴/міс`,
        `- Вечеря: 2${NBSP}500${NNBSP}ккал`,
        `- Жим: 120${NNBSP}кг`,
        `- Гречка: 1${NBSP}234,5${NNBSP}г`,
      ].join("\n"),
    );
  });

  it("порожній список: порожній рядок, без заголовка над порожнечею", () => {
    expect(renderExactValuesBlock([])).toBe("");
  });

  it("значення з блока верифікатор читає як ті самі числа", () => {
    const block = renderExactValuesBlock([
      { label: "Продукти", value: 8420, unit: "money", per: null },
    ]);
    const [token] = extractNumberTokens(block);
    expect(token).toMatchObject({ value: 8420, unit: "money", scoped: true });
  });
});

describe("renderNumberFreeAnswer", () => {
  it("реальна відповідь: речення без цифр лишаються, блок іде від коду", () => {
    const c = realCase("eval-L2635");
    const pairs = collectLabeledValues(c.given.toolResults ?? []);
    const out = renderNumberFreeAnswer(c.answer, pairs);
    expect(out).toContain(`**${EXACT_VALUES_TITLE}**`);
    expect(out).toContain(`- Продукти: 8${NBSP}420${NNBSP}₴`);
    expect(out).toContain(`- Дохід: 32${NBSP}000${NNBSP}₴`);
    // Над блоком немає жодної цифри: усе, що було в тексті, вирізано.
    const body = out.slice(0, out.indexOf(`**${EXACT_VALUES_TITLE}**`));
    expect(body).not.toMatch(/\d/);
  });

  it("від тексту нічого не лишилось: нейтральний вступ плюс блок", () => {
    const pairs = [
      { label: "Продукти", value: 8420, unit: "money" as const, per: null },
    ];
    const out = renderNumberFreeAnswer("Витрати 960 грн.", pairs);
    expect(out.startsWith(`${NUMBER_FREE_INTRO}\n\n`)).toBe(true);
    expect(out).toContain("Продукти");
  });

  it("нема ні тексту, ні значень: вступ з дією для людини", () => {
    expect(renderNumberFreeAnswer("Витрати 960 грн.", [])).toBe(
      NUMBER_FREE_INTRO_NO_VALUES,
    );
    expect(NUMBER_FREE_INTRO_NO_VALUES).toMatch(/Спитай ще раз/);
  });

  it("копія вступів не має довгого тире й звертання на «ви»", () => {
    for (const copy of [NUMBER_FREE_INTRO, NUMBER_FREE_INTRO_NO_VALUES]) {
      expect(copy).not.toContain("—");
      expect(copy).not.toMatch(/\bВи\b|будь ласка|на жаль/i);
    }
  });

  it("зібраний текст проходить власну звірку: числа блока дослівно з поданого", () => {
    for (const c of REAL_CASES) {
      const texts = [
        ...(c.given.contexts ?? []),
        ...(c.given.toolResults ?? []),
        ...(c.given.userMessages ?? []),
      ];
      const out = renderNumberFreeAnswer(c.answer, collectLabeledValues(texts));
      const verdict = verifyAnswerNumbers(out, c.given).outcome;
      expect(["ok", "no_scoped"]).toContain(verdict);
    }
  });
});
