import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../../lib/hubChatUtils";
import {
  TURN_REFS_HEADING,
  TURN_REFS_MAX_CHARS,
  collectTurnRefs,
  lastTurnRefs,
  turnRefsField,
  withTurnRefs,
} from "./turnRefs";

const FOUND =
  "Знайдено 1 операц.: m_7c40: 2026-11-17 · 412 грн · Сільпо · Продукти";

describe("collectTurnRefs (С-2 а)", () => {
  it("запамʼятовує результат пошуку операції разом з id", () => {
    expect(
      collectTurnRefs(
        [{ name: "find_transaction" }],
        [{ result: FOUND, ok: true }],
      ),
    ).toBe(`- find_transaction: ${FOUND}`);
  });

  it("пропускає агрегати без id, відмови й провали", () => {
    expect(
      collectTurnRefs(
        [
          { name: "aggregate_spending" },
          { name: "mark_habit_done" },
          { name: "find_transaction" },
        ],
        [
          { result: "Розбивка за категоріями: Кафе: 2340 грн (47)", ok: true },
          { result: "Звичку не знайдено (id:h1).", ok: true },
          { result: FOUND, ok: false },
        ],
      ),
    ).toBeUndefined();
  });

  // Рішення founder-а 2026-11-18 (§ 11.9): ланцюжок для всіх модулів; без
  // згоди на дані про здоровʼя ці рядки вирізає сервер (`healthGate.ts`).
  it("бере записи Фізрука, Харчування й памʼяті з id", () => {
    expect(
      collectTurnRefs(
        [{ name: "start_workout" }, { name: "log_meal" }, { name: "remember" }],
        [
          { result: "Тренування розпочато о 10:00 (id:w1)", ok: true },
          { result: "Записано: Обід 640 ккал (id:m_2)", ok: true },
          {
            result: "Запамʼятав: алергія на горіхи (Здоровʼя, id:f1)",
            ok: true,
          },
        ],
      ),
    ).toBe(
      [
        "- start_workout: Тренування розпочато о 10:00 (id:w1)",
        "- log_meal: Записано: Обід 640 ккал (id:m_2)",
        "- remember: Запамʼятав: алергія на горіхи (Здоровʼя, id:f1)",
      ].join("\n"),
    );
  });

  it("крос-модульні й службові інструменти в блок не йдуть", () => {
    expect(
      collectTurnRefs(
        [{ name: "get_daily_series" }],
        [{ result: "2026-11-17 витрати 300 (id:d1)", ok: true }],
      ),
    ).toBeUndefined();
  });

  it("тримає стелю блоку, відкидаючи цілі рядки", () => {
    const long = `Знайдено 1 операц.: m_1: 2026-11-17 · 1 грн · ${"x".repeat(TURN_REFS_MAX_CHARS)}`;
    expect(
      collectTurnRefs(
        [{ name: "find_transaction" }, { name: "find_transaction" }],
        [
          { result: long, ok: true },
          { result: FOUND, ok: true },
        ],
      ),
    ).toBe(`- find_transaction: ${FOUND}`);
  });
});

function msgs(
  list: Array<Pick<ChatMessage, "role" | "text" | "toolRefs">>,
): ChatMessage[] {
  return list.map((m, i) => ({ ...m, id: `m${i}` }));
}

describe("lastTurnRefs", () => {
  it("бере записи лише з останньої репліки асистента", () => {
    expect(
      lastTurnRefs(
        msgs([
          { role: "assistant", text: "a", toolRefs: "old" },
          { role: "user", text: "q" },
          { role: "assistant", text: "b", toolRefs: "new" },
          { role: "user", text: "перенеси ту в Кафе" },
        ]),
      ),
    ).toBe("new");
  });

  it("репліка без записів між пошуком і проханням обриває ланцюжок", () => {
    expect(
      lastTurnRefs(
        msgs([
          { role: "assistant", text: "a", toolRefs: "old" },
          { role: "user", text: "q" },
          { role: "assistant", text: "просто текст" },
        ]),
      ),
    ).toBeUndefined();
  });
});

describe("withTurnRefs", () => {
  it("дописує блок останньої відповіді в кінець контексту під заголовком", () => {
    expect(
      withTurnRefs(
        "ДАНІ",
        msgs([{ role: "assistant", text: "a", toolRefs: "- x" }]),
      ),
    ).toBe(`ДАНІ\n\n${TURN_REFS_HEADING}\n- x`);
    expect(withTurnRefs("ДАНІ", [])).toBe("ДАНІ");
  });
});

describe("turnRefsField", () => {
  it("дає поле лише тоді, коли записи є", () => {
    expect(
      turnRefsField(
        [{ name: "find_transaction" }],
        [{ result: FOUND, ok: true }],
      ),
    ).toEqual({ toolRefs: `- find_transaction: ${FOUND}` });
    expect(
      turnRefsField(
        [{ name: "aggregate_spending" }],
        [{ result: "Кафе: 1 грн", ok: true }],
      ),
    ).toEqual({});
  });
});
