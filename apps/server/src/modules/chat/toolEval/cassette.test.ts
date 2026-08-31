/**
 * Відтворення касети стенду вибору інструментів - безмережевий шар.
 *
 * Що він робить і чого не робить. Він НЕ судить модель: модель у касеті
 * зафіксована, і її дрейф ловить живий прогін, а не цей тест. Він робить іншу
 * річ - тримає в осудному стані все, що навколо: системний промпт, реєстр
 * інструментів, блок ДАНІ, оцінювання і сценарії ланцюжків.
 *
 * Порогів тут навмисно немає. Спершу число вимірюється й реʼвюїться людиною,
 * і лише наступним кроком стає гейтом - від виміряного, а не від успадкованого.
 * Той самий порядок, яким ішов RAG-евал.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_CASES,
  IMPLICIT_FACT_CASES,
  type ToolCase,
} from "../toolSelectionCases/index.js";
import {
  cassettePath,
  loadCassette,
  manifestMismatches,
  type Cassette,
} from "./cassette.js";
import { replayAll, summarize } from "./replay.js";

const CASES: ToolCase[] = [...ALL_CASES, ...IMPLICIT_FACT_CASES];

/**
 * Модель касети не задається окремою константою: її несе сам файл. Інакше
 * зʼявилось би друге джерело істини, яке мовчки розійшлося б із фікстурою.
 */
const RECORDED_MODEL = "google/gemini-3.7-flash";
const cassette: Cassette | null = loadCassette(RECORDED_MODEL);

describe("касета стенду вибору інструментів", () => {
  it("фікстура на місці", () => {
    expect(
      cassette,
      `Немає касети для ${RECORDED_MODEL} (${cassettePath(RECORDED_MODEL)}). ` +
        "Запиши: OPENROUTER_API_KEY=… pnpm --filter @sergeant/server eval:tools --record",
    ).not.toBeNull();
  });

  it("маніфест збігається з поточним деревом", () => {
    if (!cassette) return;
    // Fail-loud ДО оцінювання: інакше зміна промпта читалась би як «модель
    // провалила всі кейси», а не як «касета записана на іншому дереві».
    expect(
      manifestMismatches(cassette.manifest),
      "Касета протухла. Перезапис коштує грошей - спершу подивись, що саме розійшлось",
    ).toEqual([]);
  });

  it("записані всі кейси, і жоден ланцюжок не порожній", () => {
    if (!cassette) return;
    const recorded = new Map(cassette.cases.map((c) => [c.name, c]));
    const missing = CASES.filter((c) => !recorded.has(c.name)).map(
      (c) => c.name,
    );
    expect(
      missing,
      "Кейси без запису - касета старіша за набір кейсів",
    ).toEqual([]);

    const empty = cassette.cases
      .filter((c) => !c.error && c.turns.length === 0)
      .map((c) => c.name);
    expect(empty, "Кейс записано без жодного ходу").toEqual([]);
  });

  it("багатоходові кейси записані більш ніж одним ходом або замкнулись коротко", () => {
    if (!cassette) return;
    const replayed = new Map(
      replayAll(CASES, cassette).map((r) => [r.name, r]),
    );
    const flat = CASES.filter((c) => (c.turns?.length ?? 0) > 0)
      .map((c) => replayed.get(c.name))
      .filter(
        (r) =>
          r && !r.error && r.pickedByTurn.length === 1 && !r.shortCircuited,
      )
      .map((r) => r?.name);
    // Один хід у багатоходовому кейсі без короткого замикання означає, що
    // модель просто перестала кликати інструменти. Це валідний результат
    // (`replayCase` зарахує ненаписані ходи як провал), але якщо ТАКИМИ стали
    // всі ланцюжки одразу, зламався не набір кейсів, а сам прогін ланцюжка.
    expect(
      flat.length,
      `Усі багатоходові кейси обірвались на першому ході: ${flat.join(", ")}`,
    ).toBeLessThan(CASES.filter((c) => (c.turns?.length ?? 0) > 0).length);
  });

  it("друкує виміряне число як базову лінію", () => {
    if (!cassette) return;
    const summary = summarize(CASES, replayAll(CASES, cassette));
    console.log(
      `[tool-eval] ${cassette.manifest.model} @ ${cassette.manifest.recordedAt}: ` +
        `correct ${summary.correct}/${summary.total}, вигадані id ${summary.invented}, ` +
        `помилки ${summary.errors}, багатоходові ${summary.multiTurnCorrect}/${summary.multiTurnCases}`,
    );
    // Осудність, не якість: нуль правильних означає зламане оцінювання, а не
    // погану модель - жодна модель не промахується у 100% кейсів реєстру.
    expect(summary.correct).toBeGreaterThan(0);
    expect(summary.total).toBe(CASES.length);
  });
});
