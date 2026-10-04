/**
 * Status: Active
 *
 * Чи рядок `ai_memories` несе дані про здоровʼя (GDPR Art. 9) — для гейта
 * на ЧИТАННІ й записі (`service.ts`), а не лише на вході в чергу.
 *
 * AI-CONTEXT: гейт на вході (`ingestQueue.ts`, `payload.healthData`) не
 * зачіпає рядки, які вже лежать у таблиці, і не бачить шляхів повз чергу.
 * Рішення власника 2026-09-29: без `healthDataConsent` такі рядки не йдуть
 * ні в RAG-блок чату, ні у `recall_memory`, і відкликання згоди діє
 * ретроактивно на читання (сам запис не видаляється — для цього є
 * Профіль → Памʼять).
 *
 * Ознаки збігаються з тим, що продюсери самі кладуть у `metadata`:
 *   - `profile` + health-категорія в `metadata.category` (health, allergy,
 *     diet, training) або `goal` із фактом про вагу — перелік у
 *     `@sergeant/shared` (`healthMemory.ts`), `profileMirror.ts`;
 *   - `digest` + `metadata.sections.fizruk|nutrition` (`weekly-digest.ts`);
 *   - legacy-джерела `fizruk` / `nutrition` — health за визначенням.
 */

import { isHealthMemoryEntry } from "@sergeant/shared";

export interface HealthRowShape {
  source: string;
  /** Текст рядка: потрібен, щоб відрізнити ціль про вагу від інших цілей. */
  content?: string | null | undefined;
  metadata?: Record<string, unknown> | null | undefined;
}

export function isHealthMemoryRow(row: HealthRowShape): boolean {
  if (row.source === "fizruk" || row.source === "nutrition") return true;
  const metadata = row.metadata ?? {};
  if (row.source === "profile") {
    return isHealthMemoryEntry(metadata["category"], row.content);
  }
  if (row.source === "digest") {
    const sections = metadata["sections"];
    if (sections && typeof sections === "object") {
      const s = sections as Record<string, unknown>;
      return s["fizruk"] === true || s["nutrition"] === true;
    }
  }
  return false;
}
