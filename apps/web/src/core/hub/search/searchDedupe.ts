/**
 * Last validated: 2026-11-25
 * Status: Active
 *
 * Одна точка дедуплікації видачі глобального пошуку (⌘K). Джерела в
 * `performSearch` незалежні, і кілька з них можуть повернути ту саму
 * сутність: дія швидкого запуску «Почати тренування» (`action_start_workout`)
 * і однойменна можливість Сержанта (`assistant_start_workout`) стояли у
 * видачі двома рядками з однаковою назвою.
 *
 * Ключ — тип сутності + її id. Команда (дія або можливість Сержанта) має
 * спільний тип `command`, тож її двійник з іншого джерела зливається з нею.
 * Виграє перший хіт: `performSearch` ставить дії перед можливостями, а дія
 * виконується на місці й без мережі.
 */
import type { Hit } from "./searchTypes";

export function canonicalHitKey(hit: Hit): string {
  switch (hit.target.kind) {
    case "action":
      return `command:${hit.target.action}`;
    case "assistant":
      return hit.target.capability
        ? `command:${hit.target.capability.id}`
        : `hit:${hit.id}`;
    default:
      return `hit:${hit.id}`;
  }
}

export function dedupeHits(hits: readonly Hit[]): Hit[] {
  const seen = new Set<string>();
  const out: Hit[] = [];
  for (const hit of hits) {
    const key = canonicalHitKey(hit);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(hit);
  }
  return out;
}
