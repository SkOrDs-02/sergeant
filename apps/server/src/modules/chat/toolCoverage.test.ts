/**
 * Механічний гейт покриття реєстру інструментів.
 *
 * Що він робить і чого не робить. Він НЕ міряє, чи модель обирає інструмент
 * правильно - це робить `pnpm eval:tools`, платно й недетерміновано. Він
 * робить дешевшу і нуднішу річ: не дає додати інструмент у реєстр і забути
 * кейс для нього. До появи цього тесту 61 інструмент із 78 не згадувався в
 * стенді жодного разу, і найгірше тут не число, а те, що воно росло само:
 * кожен новий інструмент за замовчуванням лишався неперевіреним, і ніщо про
 * це не повідомляло.
 *
 * Нуль покриття мали, зокрема, всі write-інструменти fizruk і nutrition -
 * а ціна помилки в них асиметрична: зайвий read коштує токенів, хибний write
 * псує дані користувача.
 */

import { describe, it, expect } from "vitest";
import { TOOLS, filterToolsByActiveModules } from "./tools.js";
import { ALL_CASES, coveredToolNames } from "./toolSelectionCases/index.js";

const registryNames = TOOLS.map((t) => t.name);
const covered = coveredToolNames();

describe("покриття реєстру інструментів кейсами стенду", () => {
  it("кожен інструмент реєстру названий бодай в одному кейсі", () => {
    const uncovered = registryNames.filter((n) => !covered.has(n)).sort();
    expect(
      uncovered,
      `Інструменти без жодного кейса (${uncovered.length}): додай кейс у відповідний файл apps/server/src/modules/chat/toolSelectionCases/`,
    ).toEqual([]);
  });

  it("жоден кейс не посилається на неіснуючий інструмент", () => {
    const known = new Set(registryNames);
    const ghosts = [...covered].filter((n) => !known.has(n)).sort();
    expect(
      ghosts,
      "Кейс називає інструмент, якого немає в реєстрі - перейменований або видалений",
    ).toEqual([]);
  });

  it("кейси мають унікальні назви", () => {
    const names = ALL_CASES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("кожен кейс має текст користувача, а accept - там, де очікується виклик", () => {
    for (const c of ALL_CASES) {
      expect(c.user.length, `${c.name}: порожній user`).toBeGreaterThan(0);
      // У кейсів з `expectNoTool` порожній `accept` - це і є очікування:
      // правильна поведінка там саме утриматись від виклику.
      if (c.expectNoTool) continue;
      expect(c.accept.length, `${c.name}: порожній accept`).toBeGreaterThan(0);
    }
  });

  it("ланцюжки не довші за три ходи і кожен хід чогось очікує", () => {
    for (const c of ALL_CASES) {
      const turns = c.turns ?? [];
      // Два записи плюс перший хід = три. Довші ланцюжки недетерміновані
      // настільки, що їхній результат уже нічого не доводить.
      expect(
        turns.length,
        `${c.name}: ланцюжок довший за три ходи`,
      ).toBeLessThanOrEqual(2);
      for (const turn of turns) {
        expect(turn.accept.length, `${c.name}: хід без accept`).toBeGreaterThan(
          0,
        );
        expect(
          turn.result.length,
          `${c.name}: хід без tool_result`,
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("звужений реєстр (те, що бачить прод)", () => {
  /**
   * Стенд подає моделі ПОВНИЙ реєстр, а прод ріже його через
   * `filterToolsByActiveModules` - тобто без цієї перевірки міряється
   * конфігурація, якої в проді не буває. Тут стережемо мінімум: звуження не
   * має лишати домен зовсім без інструментів, інакше жоден кейс цього домену
   * не був би здійсненним у реальній сесії.
   */
  it("вимкнення одного модуля лишає інші інструменти на місці", () => {
    const full = TOOLS.length;
    const narrowed = filterToolsByActiveModules(TOOLS, ["finyk"]);
    expect(narrowed.length).toBeGreaterThan(0);
    expect(narrowed.length).toBeLessThan(full);
  });
});
