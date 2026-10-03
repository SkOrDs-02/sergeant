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
 * для `routine_entries`. Візуальна різниця не дає переплутати PK журналу з
 * PK старої таблиці у логах і в БД.
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
 * Ідемпотентність: (habitId, dateKey, state, deviceId) — природний ключ
 * ОДНОГО ФАКТУ «звичка X у день Y перейшла в стан Z на пристрої W».
 * `occurredAt` НЕ входить у ключ — він лишається колонкою payload, яку
 * `foldCompletionEvents` використовує для впорядкування (виграє пізніший
 * `occurredAt`), але не для ідентичності.
 *
 * Чому: холодний старт (`saveRoutineState` на завантаженому знімку) дифить
 * порожній `prev` проти щойно завантаженого `next` і читає КОЖНУ наявну
 * відмітку як свіжий `add`, підставляючи `occurredAt = clientTs` МОМЕНТУ
 * ЦЬОГО завантаження, а не моменту реальної дії користувача (`RoutineState`
 * взагалі не зберігає таймстемп на відмітку). Якби `occurredAt` був у
 * ключі, кожен холодний старт видавав би НОВИЙ `id` для тієї самої
 * відмітки — журнал розпух би дублями, яких `INSERT OR IGNORE` не ловить,
 * бо id дійсно різні (аудит W1-ROUTINE-APPEND, беклог-пастка #1).
 *
 * Два РІЗНІ пристрої, що клацнули ту саму звичку в ту саму мілісекунду,
 * дадуть різні `id` (різний `deviceId`) і обидві події збережуться —
 * журнал має бути чесним. Повторний запис того самого стану з того
 * самого пристрою (ретрай АБО повторний холодний старт) дає однаковий
 * `id` і стає легітимним no-op: два факти «зроблено» за той самий день
 * з того самого пристрою — це один факт.
 */
export function buildCompletionEventId(input: {
  readonly habitId: string;
  readonly dateKey: string;
  readonly state: CompletionEventState;
  readonly deviceId: string | null;
}): string {
  return [
    input.habitId,
    input.dateKey,
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
