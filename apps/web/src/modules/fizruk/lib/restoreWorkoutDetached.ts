/**
 * Last validated: 2026-10-09
 * Status: Active
 *
 * Повернення видаленого тренування БЕЗ екземпляра `useWorkouts`.
 *
 * AI-CONTEXT: undo-тост живе в глобальному `ToastProvider` і переживає
 * навігацію, а `restoreWorkout` з хука — ні: `persist` запускає
 * `triggerFizrukDualWrite` усередині апдейтера `setState`, який React не
 * викликає для розмонтованого компонента. Видалення з підсумку завершеного
 * тренування (і скасування активної сесії) одразу веде на список, тож
 * `ActiveWorkout` із його хуком знімається з дерева ще до «Повернути» —
 * тост показував успіх, а запис не повертався (аудит ux-11, зауваження
 * верифікації). Тому undo тут не залежить від життя жодного компонента:
 * він сам будує diff і шле його у dual-write; решта змонтованих хуків
 * побачить запис на наступному тіку кешу.
 *
 * Чому `prev` — це «кеш без цього id», а не просто кеш: кеш причинно
 * позаду черги dual-write (див. `fizrukDualWriteIntent.ts`). Якщо
 * «Повернути» натиснули до того, як delete застосувався, у кеші запис ще
 * є, і diff «кеш → кеш + запис» був би порожнім — restore не писався б, а
 * delete у черзі стер би запис. Ми ЗНАЄМО, що щойно видаляли саме його,
 * тож prev без нього дає upsert і в цьому вікні, і коли кеш уже оновився.
 */
import type { Workout } from "@sergeant/fizruk-domain";

import {
  extractWorkoutSnapshots,
  peekFizrukDualWriteState,
} from "./fizrukDualWriteState";
import { triggerFizrukDualWrite } from "./sqliteWriter/index";

export function restoreWorkoutDetached(workout: Workout): void {
  if (!workout?.id) return;
  // `null` — контексту dual-write немає (до входу): писати нікуди, так само
  // тихо, як `persist` у хуку.
  const cached = peekFizrukDualWriteState();
  if (!cached) return;

  const without = cached.workouts.filter((w) => w.id !== workout.id);
  const restored = extractWorkoutSnapshots([workout]);
  triggerFizrukDualWrite(
    { ...cached, workouts: without },
    { ...cached, workouts: [...without, ...restored] },
  );
}
