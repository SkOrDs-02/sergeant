import { getToolOutcomeClass } from "@sergeant/shared";
import {
  buildActionCard,
  isFailureResult,
  type ChatActionCard,
} from "../../lib/hubChatActionCards";

/**
 * Чисті помічники ходу з tool-call-ами для `useChatSend` (винесено, щоб
 * `useChatSend.ts` лишався під `max-lines: 600`, Hard Rule #18).
 */

interface TurnToolCall {
  name: unknown;
  input: unknown;
}

interface TurnToolResult {
  content: string;
}

/**
 * Картки для відомих tool-ів і текстовий фолбек для решти.
 *
 * Текстовий рядок «✓ …» — фолбек для інструментів БЕЗ картки.
 *
 * AI-CONTEXT (2026-08-07): раніше він друкувався для кожного виклику
 * незалежно від картки, тобто дублював її слово в слово — і разом із тим
 * виносив у чат сирий результат виконавця. Для `remember` це означало UUID
 * запису памʼяті (`✓ Запамʼятав: Звати Діма (Інше, id:5c47fa7f-…)`) просто
 * над карткою, яка каже те саме людськими словами. Виглядало як переказ
 * моделі, але клеїв рядок саме цей код.
 *
 * Картка й рядок зʼявляються ОДНОЧАСНО (обидва летять в одне оновлення
 * повідомлень), тож там, де картка є, рядок не додає нічого. Там, де її
 * немає (невідомий tool), він лишається єдиним підтвердженням — тому не
 * викидаємо його зовсім.
 *
 * U+2713 CHECK MARK — типографічний символ, не emoji: наслідує
 * колір/шрифт повідомлення (emoji ✅ завжди зелена й чужа токенам).
 * Re-audit §7.2 — системний статус-маркер.
 */
export function buildTurnCards(
  toolCalls: ReadonlyArray<TurnToolCall>,
  toolResults: ReadonlyArray<TurnToolResult>,
): { cards: ChatActionCard[]; uncardedText: string } {
  // Невідомий tool → null, лише текстовий фолбек.
  const builtCards = toolCalls.map((tc, idx) =>
    buildActionCard({
      name: tc.name as string,
      input: tc.input as Record<string, unknown>,
      result: toolResults[idx]?.content || "",
    }),
  );
  const cards = builtCards.filter((c): c is ChatActionCard => c !== null);
  const uncardedText = toolResults
    .filter((_, idx) => builtCards[idx] == null)
    // Помилковий результат не маркуємо «✓» — це б рапортувало успіх.
    .map((r) => (isFailureResult(r.content) ? r.content : `✓ ${r.content}`))
    .join("\n");
  return { cards, uncardedText };
}

/**
 * AI-6 (`docs/work/specs/audits/2026-09-01-product-audit/findings.md`) —
 * синтез (другий тур) упав, але картки вже побудовані з результату
 * ВИКОНАННЯ tool-а на клієнті, до того, як стало відомо, чи синтез узагалі
 * відбудеться. `getToolOutcomeClass` (`@sergeant/shared`) вирішує, як саме
 * картка має про це сказати:
 *   - `state-mutating` (mark_habit_done, create_transaction, …) — дія вже
 *     сталась незалежно від синтезу; картка лишається «Виконано», лише
 *     дописуємо, що пояснення не дійшло;
 *   - `advice` (suggest_meal, query_*, …) — цінність саме в синтезованому
 *     тексті, якого нема, тож «completed»-картка з проміжними даними
 *     виглядала б як завершена рекомендація, якою вона не є — переводимо у
 *     `failed`.
 * Чіпаємо лише картки, що самі стартували як «completed»: якщо локальний
 * виконавець уже позначив картку `failed` (сам tool впав), це не про
 * синтез — не переписуємо.
 */
export function markCardsAfterFailedSynthesis(
  cards: ReadonlyArray<ChatActionCard>,
): ChatActionCard[] {
  return cards.map((c) => {
    if (c.status !== "completed") return c;
    if (getToolOutcomeClass(c.toolName) === "state-mutating") {
      return { ...c, summary: `${c.summary} · Пояснення не дійшло.` };
    }
    return {
      ...c,
      status: "failed" as const,
      summary: "Не вдалося отримати відповідь. Спробуй ще раз.",
    };
  });
}
