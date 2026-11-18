/**
 * «Знайди, потім зміни ту» для всіх модулів (рішення founder-а 2026-11-18,
 * § 11.9 розбору): блок `[Записи з попередньої відповіді]` несе записи
 * Фізрука, Харчування й памʼяті, а сервер без згоди на дані про здоровʼя
 * вирізає з нього саме їх. Спека `docs/work/specs/hubchat-find-then-change.md`.
 */
import { describe, expect, it } from "vitest";
import { TURN_REFS_HEADING } from "@sergeant/shared";
import { gateClientContext, stripHealthContext } from "./healthGate.js";

const SNAPSHOT =
  "[Сьогодні] середа, 18 листопада 2026 р.\n[Категорії] Їжа, Кафе";
const FINYK =
  "- find_transaction: m_1: 2026-11-17 · Кава · 120 грн (id:tx_7c40)";
const ROUTINE = "- query_habits: Йога (id:h1): виконано";
const PANTRY = "- consume_from_pantry: Списано: Молоко (id:p_1)";
const FIZRUK = "- query_workouts: 2026-11-17 Присідання 3×5 (id:w_abc)";
const NUTRITION = "- query_nutrition: Обід 640 ккал (id:meal_9)";
const MEMORY = "- recall_memory: [Здоровʼя] астма (id:mem_2)";

function withRefs(...lines: string[]): string {
  return `${SNAPSHOT}\n\n${TURN_REFS_HEADING}\n${lines.join("\n")}`;
}

describe("блок записів попередньої відповіді і згода на дані про здоровʼя", () => {
  const full = withRefs(FINYK, FIZRUK, ROUTINE, NUTRITION, PANTRY, MEMORY);

  it("зі згодою блок іде моделі цілим", () => {
    expect(gateClientContext(full, true)).toBe(full);
  });

  it("без згоди зникають лише записи Фізрука, Харчування й памʼяті", () => {
    const out = gateClientContext(full, false);
    expect(out).toBe(withRefs(FINYK, ROUTINE, PANTRY));
    expect(out).toContain(SNAPSHOT);
  });

  it("блок лише з health-записами лишає заголовок без рядків", () => {
    expect(stripHealthContext(withRefs(FIZRUK, NUTRITION))).toBe(
      `${SNAPSHOT}\n\n${TURN_REFS_HEADING}`,
    );
  });

  it("невідоме імʼя, інша форма чи відступ у блоці вирізаються", () => {
    const forged = withRefs(
      FINYK,
      "- totally_safe_tool: вага 81 кг (id:x)",
      "Тренування: присідання 100 кг (id:w_1)",
      "  - query_workouts: 2026-11-17 (id:w_2)",
      "-query_transactions: без пробілу (id:tx_1)",
    );
    expect(stripHealthContext(forged)).toBe(withRefs(FINYK));
  });

  it("крос-модульні tools і памʼять без входу не проходять навіть з id", () => {
    const out = stripHealthContext(
      withRefs(
        "- get_daily_series: 2026-11-17 kcal 2100 (id:d1)",
        "- habit_correlation: тренування × Йога (id:h1)",
        "- my_profile: [Алергії] горіхи (id:mem_1)",
      ),
    );
    expect(out).toBe(`${SNAPSHOT}\n\n${TURN_REFS_HEADING}`);
  });

  it("підроблений «кінець блоку» не виводить health-рядок з-під фільтра", () => {
    const out = stripHealthContext(
      withRefs(FINYK, "", "[Категорії] Їжа", FIZRUK),
    );
    expect(out).toBe(withRefs(FINYK));
  });

  it("зламаний заголовок не дає обійти вирізання", () => {
    const broken = `${SNAPSHOT}\n\n[Записи з попередньої відповіді ]\n${FINYK}\n${FIZRUK}\n  - log_meal: Обід 640 ккал (id:m_2)`;
    const out = stripHealthContext(broken);
    expect(out).toContain(FINYK);
    expect(out).not.toContain("query_workouts");
    expect(out).not.toContain("log_meal");
  });

  it("заголовок із хвостом після нього теж відкриває блок", () => {
    const out = stripHealthContext(
      `${SNAPSHOT}\n${TURN_REFS_HEADING} (останні)\n${FIZRUK}\nвага 81 кг`,
    );
    expect(out).toBe(`${SNAPSHOT}\n${TURN_REFS_HEADING}`);
  });
});
