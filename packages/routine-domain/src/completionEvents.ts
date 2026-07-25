/**
 * Конструктори подій append-only журналу відміток.
 *
 * W1-ROUTINE-APPEND, СТАДІЯ 1. Модуль чисто pure: жодного `Date.now()`,
 * жодного `crypto.randomUUID()` — момент часу, зсув таймзони, doctrine-якір
 * і `deviceId` приходять АРГУМЕНТОМ. Це дозволяє тестувати згортку
 * детерміновано і дає ідемпотентність запису: той самий toggle, повторно
 * застосований після ретраю, дає ТОЙ САМИЙ `id`, тому `INSERT OR IGNORE`
 * (клієнт) і `ON CONFLICT (id) DO NOTHING` (сервер) не створюють дубль.
 *
 * Споживачів у стадії 1 — рівно двоє: `reducers.ts` (для чистих
 * `*WithEvents` варіантів) і write-path у
 * `apps/{web,mobile}/src/modules/routine/lib/sqliteWriter/`. Жоден ЧИТАЧ
 * (streak / rate / heatmap / digest) сюди не заглядає — і не повинен до
 * стадії 3.
 */

import type {
  CompletionDayAnchor,
  CompletionEvent,
  CompletionEventSource,
  CompletionEventState,
} from "./types.js";

/**
 * Роздільник частин `id` події.
 *
 * Свідомо НЕ `:` — на відміну від `buildCompletionRowId` (`habitId:dateKey`)
 * для `routine_entries`. По-перше, `occurredAt` в ISO-8601 сам містить `:`,
 * тож розбір був би неоднозначним. По-друге, візуальна різниця не дає
 * переплутати PK журналу з PK старої таблиці у логах і в БД.
 */
const EVENT_ID_SEPARATOR = "|";

/** Плейсхолдер для невідомого `deviceId` у складі `id`. */
const UNKNOWN_DEVICE = "-";

/**
 * Контекст, який write-path підставляє у подію. Reducer лишається чистим —
 * усі «брудні» значення приходять сюди ззовні.
 */
export interface CompletionEventContext {
  /** ISO-8601 з offset. */
  readonly occurredAt: string;
  readonly tzOffsetMin: number | null;
  readonly dayAnchor: CompletionDayAnchor;
  readonly source: CompletionEventSource;
  readonly deviceId: string | null;
}

/**
 * Детермінований `id` події.
 *
 * Ідемпотентність: (habitId, dateKey, occurredAt, state, deviceId) —
 * природний ключ однієї дії користувача. Два РІЗНІ пристрої, що клацнули
 * ту саму звичку в ту саму мілісекунду, дадуть різні `id` і обидві події
 * збережуться (журнал має бути чесним); повторна доставка тієї самої
 * події з того самого пристрою дасть однаковий `id` і буде проігнорована.
 */
export function buildCompletionEventId(input: {
  readonly habitId: string;
  readonly dateKey: string;
  readonly state: CompletionEventState;
  readonly occurredAt: string;
  readonly deviceId: string | null;
}): string {
  return [
    input.habitId,
    input.dateKey,
    input.occurredAt,
    input.state,
    input.deviceId ?? UNKNOWN_DEVICE,
  ].join(EVENT_ID_SEPARATOR);
}

/** Зібрати подію журналу з природного ключа + контексту. */
export function createCompletionEvent(
  habitId: string,
  dateKey: string,
  state: CompletionEventState,
  ctx: CompletionEventContext,
): CompletionEvent {
  return {
    id: buildCompletionEventId({
      habitId,
      dateKey,
      state,
      occurredAt: ctx.occurredAt,
      deviceId: ctx.deviceId,
    }),
    habitId,
    dateKey,
    state,
    occurredAt: ctx.occurredAt,
    tzOffsetMin: ctx.tzOffsetMin,
    dayAnchor: ctx.dayAnchor,
    source: ctx.source,
    deviceId: ctx.deviceId,
  };
}
