/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Ключі привʼязок платежів до боргу (`linkedTxIds` / `txLinks`) для РУЧНИХ
 * записів (аудит 2026-10-01, `data-24`; канон `docs/product/modules/finyk.md`
 * § 4a та Журнал рішень).
 *
 * AI-CONTEXT: ручний запис має два вигляди id. Сирий (`<id>`) живе в
 * `finyk_manual_expenses`; у списку транзакцій, пікері боргів та
 * авто-привʼязці він зʼявляється як `manual_<id>`
 * (`manualExpenseToTransaction`). Канонічний ключ привʼязки — `manual_<id>`.
 * Сирий ключ — спадок: аркуш ручної витрати до 2026-10 писав його, тож у
 * наявних даних одна операція могла мати ДВА ключі і гасити борг двічі.
 * Сховище не переписуємо: читання (`resolveLinks`) дедуплікує пару, а
 * записи (`setLinkedTxRole`, видалення витрати) знімають обидві форми.
 *
 * Банківські id цього префікса не мають, тож для них аліасів нема.
 */

export const MANUAL_TX_KEY_PREFIX = "manual_";

/** Канонічний ключ привʼязки ручного запису: `manual_<id>`. */
export function manualLinkKey(rawId: string): string {
  return rawId.startsWith(MANUAL_TX_KEY_PREFIX)
    ? rawId
    : `${MANUAL_TX_KEY_PREFIX}${rawId}`;
}

/** Сирий id ручного запису (без префікса); для інших id — без змін. */
export function rawManualId(key: string): string {
  return key.startsWith(MANUAL_TX_KEY_PREFIX)
    ? key.slice(MANUAL_TX_KEY_PREFIX.length)
    : key;
}

/**
 * Усі форми одного ключа, бажана перша: `X` -> `[X, manual_X]`,
 * `manual_X` -> `[manual_X, X]`. Порядок важливий для тих, хто шукає
 * наявну привʼязку: передана форма перемагає.
 */
export function linkKeyAliases(key: string): string[] {
  const alias = key.startsWith(MANUAL_TX_KEY_PREFIX)
    ? rawManualId(key)
    : manualLinkKey(key);
  return alias === key || alias === "" ? [key] : [key, alias];
}

/** Перша форма `key`, що присутня в `linkedTxIds`, або `undefined`. */
export function findLinkedKey(
  linkedTxIds: readonly string[] | undefined,
  key: string,
): string | undefined {
  if (!linkedTxIds || linkedTxIds.length === 0) return undefined;
  return linkKeyAliases(key).find((k) => linkedTxIds.includes(k));
}

/** Множина `linkedTxIds` разом з аліасами кожного id. */
export function expandLinkedKeys(
  linkedTxIds: readonly string[] | undefined,
): Set<string> {
  const out = new Set<string>();
  for (const id of linkedTxIds ?? []) {
    for (const k of linkKeyAliases(id)) out.add(k);
  }
  return out;
}
