/**
 * Core domain types for the Routine module.
 *
 * Extracted from `apps/web/src/modules/routine/lib/types.ts` verbatim
 * (Phase 5 / PR 2 — pure-domain split). Consumed by both `apps/web` and
 * `apps/mobile` via `@sergeant/routine-domain`.
 */

export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "once";

/**
 * Датований інтервал планованої паузи («заморозка»).
 *
 * AI-CONTEXT: канон [`routine.md §4`] дослівно вимагає «плановану паузу
 * наперед» — дні паузи **випадають зі стріку, не ламаючи його**. Недатований
 * булеан `Habit.paused` цього дати не може: він не знає, КОЛИ його поставили,
 * тож або переписує всю історію, або (з `pausedFrom`) вгадує «сьогодні».
 * Інтервал знає обидві межі й тому чесний і для минулого, і для майбутнього.
 *
 * `to: null` — пауза без заявленої дати кінця (діє від `from` і далі).
 * Обидві межі **включні** (`from <= key <= to`).
 */
export interface PauseInterval {
  /** Перший день паузи, `YYYY-MM-DD`. */
  from: string;
  /** Останній день паузи включно, або `null` — «поки не знято». */
  to: string | null;
}

/**
 * Причина пропуску у тристановій моделі «зробив / не зміг / не зробив».
 *
 * Канон [`routine.md §5`]: «не зміг» **не є провалом**. Список навмисно
 * короткий і закритий — вільний текст живе в `HabitSkip.note`, щоб
 * агрегації мали на чому групувати.
 */
export type SkipReason = "sick" | "travel" | "busy" | "rest" | "other";

/** Усі допустимі причини пропуску — для UI-селекторів і валідації. */
export const SKIP_REASONS: readonly SkipReason[] = [
  "sick",
  "travel",
  "busy",
  "rest",
  "other",
];

/**
 * Позначка «не зміг з причиною» за конкретний день конкретної звички.
 *
 * Взаємно виключна з відміткою виконання: reducer, що ставить пропуск,
 * знімає відмітку, і навпаки. Три стани дня, які з цього виводяться:
 *
 * - **зробив** — `dateKey` є у `completions[habitId]`;
 * - **не зміг** — `dateKey` є у `skips[habitId]` (нейтральний, не провал);
 * - **не зробив** — запланований день, якого немає ні там, ні там.
 */
export interface HabitSkip {
  readonly reason: SkipReason;
  /** Необовʼязкова вільна нотатка, ≤200 символів. */
  readonly note?: string | undefined;
  /** ISO-8601 момент, коли позначку поставили. */
  readonly at: string;
}

export interface Habit {
  id: string;
  name: string;
  emoji?: string | undefined;
  tagIds?: string[] | undefined;
  categoryId?: string | null | undefined;
  createdAt?: string | undefined;
  archived?: boolean | undefined;
  /**
   * Легасі-прапор негайної паузи. Лишається для сумісності зі старими
   * записами й чат-тулом `pause_habit`; нові паузи пишуться як
   * `pauseIntervals`. Читачі мають поважати обидва.
   */
  paused?: boolean | undefined;
  /** Датовані інтервали планованої паузи (канон §4). */
  pauseIntervals?: PauseInterval[] | undefined;
  recurrence?: Recurrence | string | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  timeOfDay?: string | undefined;
  reminderTimes?: string[] | undefined;
  weekdays?: number[] | undefined;
}

export interface Tag {
  id: string;
  name: string;
  scope?: string | undefined;
}

export interface Category {
  id: string;
  name: string;
  emoji?: string | undefined;
}

export interface RoutinePrefs {
  showFizrukInCalendar?: boolean | undefined;
  showFinykSubscriptionsInCalendar?: boolean | undefined;
  routineRemindersEnabled?: boolean | undefined;
  [k: string]: unknown;
}

export interface RoutineState {
  schemaVersion: number;
  prefs: RoutinePrefs;
  tags: Tag[];
  categories: Category[];
  habits: Habit[];
  completions: Record<string, string[]>;
  /**
   * Пропуски з причиною: `habitId → dateKey → HabitSkip`.
   *
   * Окрема мапа, а не поле всередині `completions`, бо `completions` —
   * масив ключів і його форму читають дуал-райт, згортка подій і
   * heatmap. Розширення масиву обʼєктами зламало б усіх трьох.
   *
   * Необовʼязкове навмисно: `RoutineState` конструюють десятки місць у
   * вебі, мобілці й тестах, і обовʼязкове поле зробило б додавання
   * третього стану ламким релізом на всіх одразу. `normalizeRoutineState`
   * усе одно завжди віддає обʼєкт, тож читачі бачать `{}`, а не `undefined`.
   */
  skips?: Record<string, Record<string, HabitSkip>> | undefined;
  habitOrder: string[];
  completionNotes: Record<string, string>;
}

// ---------------------------------------------------------------------
// Append-only журнал відміток (W1-ROUTINE-APPEND, стадія 1)
// ---------------------------------------------------------------------

/** Стан відмітки, який зафіксувала подія. */
export type CompletionEventState = "done" | "undone";

/**
 * Як саме клієнт порахував `dateKey` події.
 *
 * `unknown` — для синтетичних подій backfill-у (стадія 2): вони НЕ мають
 * права вдавати, ніби знають доктрину. Рішення Kyiv vs device-local
 * (задача W1-TIME-DOCTRINE) ухвалюється окремо і може бути переграним
 * із сирих полів події.
 */
export type CompletionDayAnchor = "device-local" | "kyiv" | "unknown";

/** Звідки прилетіла подія. */
export type CompletionEventSource =
  "ui" | "chat" | "bulk" | "backfill" | "seed";

/**
 * Одна незмінна подія журналу відміток.
 *
 * AI-CONTEXT: подія несе І `dateKey` (як його порахував клієнт), І сирі
 * `occurredAt` + `tzOffsetMin` + `dayAnchor`. Це навмисне дублювання:
 * ключ — те, що бачив користувач, сирий момент — те, з чого майбутній
 * derive зможе перерахувати ключ за іншою доктриною.
 *
 * Подія НЕ редагується і НЕ видаляється (append-only). Виправлення
 * історії — це нова подія з новішим `occurredAt`.
 */
export interface CompletionEvent {
  readonly id: string;
  readonly habitId: string;
  readonly dateKey: string;
  readonly state: CompletionEventState;
  /** ISO-8601 з offset — реальний момент дії користувача. */
  readonly occurredAt: string;
  /** Зсув таймзони пристрою у хвилинах; `null` якщо невідомий. */
  readonly tzOffsetMin: number | null;
  readonly dayAnchor: CompletionDayAnchor;
  readonly source: CompletionEventSource;
  readonly deviceId: string | null;
}

/**
 * Результат згортки журналу — та сама форма, що й `RoutineState.completions`
 * (`habitId → відсортовані dateKey`). Окремий alias, щоб у сигнатурах було
 * видно, що значення ПОХІДНЕ від подій, а не збережений стан.
 */
export type FoldedCompletions = Record<string, string[]>;

export interface HabitDraftPatch {
  name?: string | undefined;
  emoji?: string | undefined;
  tagIds?: string[] | undefined;
  categoryId?: string | null | undefined;
  recurrence?: Recurrence | string | undefined;
  startDate?: string | null | undefined;
  endDate?: string | null | undefined;
  timeOfDay?: string | undefined;
  reminderTimes?: string[] | undefined;
  weekdays?: number[] | undefined;
  paused?: boolean | undefined;
}

/**
 * Full habit draft used by HabitForm. All fields are defined (possibly
 * empty strings / empty arrays) so inputs are always controlled.
 */
export interface HabitDraft {
  name: string;
  emoji: string;
  tagIds: string[];
  categoryId: string | null;
  recurrence: Recurrence | string;
  startDate: string;
  endDate: string;
  timeOfDay: string;
  reminderTimes: string[];
  weekdays: number[];
  paused: boolean;
}

export interface ReminderPreset {
  id: string;
  label: string;
  times: string[];
}

export interface CategoryDraft {
  name: string;
  emoji: string;
}

export interface PendingHabitDeletion {
  id: string;
  name: string;
  archived: boolean;
}

export interface PendingCategoryDeletion {
  id: string;
  name: string;
  habitCount: number;
}

export interface CreateHabitOptions extends HabitDraftPatch {
  name: string;
  /**
   * Client-generated id. When supplied, `applyCreateHabit` is idempotent:
   * a repeat call with the same id (double-tapped save, replayed offline
   * write) returns the state unchanged instead of creating a duplicate.
   */
  id?: string;
}

export interface CalendarRange {
  startKey: string;
  endKey: string;
}

export interface HubCalendarEvent {
  id: string;
  source: string;
  date: string;
  title: string;
  subtitle: string;
  tagLabels: string[];
  sortKey: string;
  fizruk?: boolean;
  finykSub?: boolean;
  sourceKind: string;
  habitId?: string;
  completed?: boolean;
  note?: string;
  timeOfDay?: string;
}
