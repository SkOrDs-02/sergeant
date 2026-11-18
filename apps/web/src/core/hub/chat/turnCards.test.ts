import { describe, expect, it } from "vitest";
import { buildTurnCards } from "./turnCards";

describe("buildTurnCards", () => {
  // Перевірка першої хвилі 2026-11-18: рядок «✓ …» для інструмента без
  // картки клеїв результат виконавця дослівно, разом із технічним id.
  it("текстовий фолбек без картки не показує технічний id", () => {
    const { cards, uncardedText } = buildTurnCards(
      [{ name: "some_uncarded_tool", input: {} }],
      [{ result: "Запис додано (id:x_84920a0a)", ok: true }],
    );
    expect(cards).toHaveLength(0);
    expect(uncardedText).toBe("✓ Запис додано");
  });

  it("картка операції не несе сирого id", () => {
    const { cards } = buildTurnCards(
      [{ name: "hide_transaction", input: { tx_id: "m_84920a0a" } }],
      [
        {
          result:
            "Операцію «Кава» на 120 грн приховано зі статистики (id:m_84920a0a)",
          ok: true,
        },
      ],
    );
    expect(cards[0]?.summary).toBe(
      "Операцію «Кава» на 120 грн приховано зі статистики",
    );
  });
});
