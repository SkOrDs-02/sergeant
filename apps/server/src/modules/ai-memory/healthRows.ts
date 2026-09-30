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
 *   - `profile` + `metadata.category === "health"` (`profileMirror.ts`);
 *   - `digest` + `metadata.sections.fizruk|nutrition` (`weekly-digest.ts`);
 *   - legacy-джерела `fizruk` / `nutrition` — health за визначенням.
 */

export interface HealthRowShape {
  source: string;
  metadata?: Record<string, unknown> | null | undefined;
}

export function isHealthMemoryRow(row: HealthRowShape): boolean {
  if (row.source === "fizruk" || row.source === "nutrition") return true;
  const metadata = row.metadata ?? {};
  if (row.source === "profile") {
    return metadata["category"] === "health";
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
