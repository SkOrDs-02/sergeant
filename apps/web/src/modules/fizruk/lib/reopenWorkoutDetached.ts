/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * «Повернутись у сесію» (Фз-2, OD-28) БЕЗ екземпляра `useWorkouts`.
 *
 * AI-CONTEXT: завершення комітиться одразу (`endWorkout`), а повернення —
 * це відкат до знімка ДО завершення: `endedAt = null` і самопочуття, яке
 * було до кроку «Завершити». Коміт-одразу обрано свідомо: закрита вкладка
 * чи вивантажений iOS PWA у 10-секундному вікні лишають тренування
 * завершеним, бо відкладеному коміту не було б кому виконатись.
 *
 * Тост живе в глобальному провайдері й переживає навігацію, а хук
 * сторінки — ні (той самий випадок, що `restoreWorkoutDetached`). Тому тут
 * diff будується від кешу без хука. `prev` примусово несе `endedAt`: кеш
 * причинно позаду черги dual-write, і якщо finish ще в черзі, diff «кеш →
 * знімок» був би порожнім, а finish потім застосувався б і лишив сесію
 * завершеною.
 */
import type { Workout } from "@sergeant/fizruk-domain";

import {
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
} from "./fizrukDualWriteState";
import { triggerFizrukDualWrite } from "./sqliteWriter/index";

export function reopenWorkoutDetached(
  beforeFinish: Workout,
  endedAtIso: string,
): void {
  if (!beforeFinish?.id) return;
  const cached = peekFizrukDualWriteState();
  if (!cached) return;
  const current = cached.workouts.find((w) => w.id === beforeFinish.id);
  // Видалене тренування не воскрешаємо.
  if (!current) return;

  const [reopened] = extractWorkoutSnapshots([
    { ...beforeFinish, endedAt: null },
  ]);
  if (!reopened) return;
  const others = cached.workouts.filter((w) => w.id !== beforeFinish.id);
  const prevEntry = current.endedAt
    ? current
    : { ...current, endedAt: endedAtIso };
  triggerFizrukDualWrite(
    { ...cached, workouts: [...others, prevEntry] },
    { ...cached, workouts: [...others, reopened] },
  );
}
