/**
 * Детермінована відповідь, коли тур синтезу порожній і після перезапиту
 * (FULL-20261126-AI-2). Дію вже виконано на клієнті; людина не лишається без
 * слова лише тому, що модель не дала тексту.
 *
 * Текст береться з результату інструмента, який і так бачила модель (уже
 * пройшов маску й огорожу): знімаємо огорожу `<tool_output>`, технічні `id:…`
 * і короткі відповіді лишаємо як є. Довгі результати (таблиці, JSON) не
 * переказуємо: там детермінований переказ гірший за чесне «дію виконано».
 */

/** Стеля довжини одного рядка результату, який ще можна показати як є. */
const MAX_FALLBACK_CHARS = 280;

/** Коли від результату нічого придатного не лишилось. */
export const GENERIC_ACTION_DONE_FALLBACK =
  "Дію виконано, але пояснення сформувати не вдалося.";

const TOOL_OUTPUT_TAGS = /<\/?tool_output[^>]*>/g;
// `(Алергії, id:mem_ab12)`, `, id:tx_1)`, `id:abc` у кінці рядка.
const ID_IN_PARENS = /,\s*id:[^\s,)]+(?=\))/g;
const ID_TAIL = /\s*\(id:[^)]*\)/g;

export function deterministicSynthesisFallback(
  toolResults: ReadonlyArray<string>,
): string {
  const cleaned = toolResults
    .map((r) =>
      r
        .replace(TOOL_OUTPUT_TAGS, "")
        .replace(ID_IN_PARENS, "")
        .replace(ID_TAIL, "")
        .trim(),
    )
    .filter((r) => r !== "" && !r.startsWith("{") && !r.startsWith("["));
  const first = cleaned[0];
  if (!first || first.length > MAX_FALLBACK_CHARS || first.includes("\n")) {
    return GENERIC_ACTION_DONE_FALLBACK;
  }
  return first;
}
