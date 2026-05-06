/**
 * `<WhatsNewModal />` persistence — last-seen release id у localStorage.
 *
 * Контракт:
 *   - `readLastSeenId()` повертає `string | null` (null = ніколи не бачив).
 *   - `writeLastSeenId(id)` зберігає id як рядок (без JSON-обгортки) — це
 *     спрощує дебаг у DevTools і з нашими `safeReadStringLS` /
 *     `safeWriteLS` semantics (string не серіалізується далі).
 *
 * Storage key — `sergeant.whatsNew.lastSeenId.v1`. `v1` префікс лишає шлях
 * для майбутніх змін формату (наприклад, перейти на `Set<string>` з
 * історією переглядів) без silent-resurrect старого blob-а.
 */

import { safeReadStringLS, safeWriteLS } from "@shared/lib/storage/storage";

export const WHATS_NEW_LAST_SEEN_KEY = "sergeant.whatsNew.lastSeenId.v1";

export function readLastSeenId(): string | null {
  return safeReadStringLS(WHATS_NEW_LAST_SEEN_KEY, null);
}

export function writeLastSeenId(id: string): boolean {
  if (!id) return false;
  return safeWriteLS(WHATS_NEW_LAST_SEEN_KEY, id);
}
