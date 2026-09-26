/**
 * Чиста логіка «які нагадування мають спрацювати саме зараз».
 *
 * Тут немає ні БД, ні пушу — рівно предикати над уже прочитаним станом, щоб
 * усе це покривалося тестами без Postgres. Побічні ефекти живуть у
 * `./sweep.ts`.
 *
 * ── Чому саме `@sergeant/routine-domain` ────────────────────────────────
 *
 * Предикат розкладу звички (`habitScheduledOnDate`) і нормалізацію часів
 * (`normalizeReminderTimes`) НЕ переписуємо — імпортуємо канонічні з
 * `@sergeant/routine-domain`. Там уже враховані датовані паузи, легасі-прапор
 * `paused`, межі життя звички і всі пʼять режимів повторення. Друга копія
 * цієї логіки на сервері розійшлася б із клієнтською за пару місяців, і
 * розбіжність проявилася б як «нагадування приходить у день, коли звичка не
 * запланована» — рівно той клас багів, від якого пакет і рятує.
 *
 * `reminderNotifyKey` звідти ж — це ОДИН І ТОЙ САМИЙ рядок, що клієнт
 * використовує як `Notification.tag`. Саме на цьому тримається дедуп між
 * серверним пушем і локальним таймером відкритої вкладки: другий банер
 * заміщує перший, а не лягає під ним.
 */

import {
  habitScheduledOnDate,
  isFlexibleHabit,
  normalizeReminderTimes,
  reminderNotifyKey,
  weekDoneCountExcludingDate,
  type Habit,
} from "@sergeant/routine-domain";

/**
 * Модулі, які вміє нагадувати sweep. Значення їде у `data.module` пушу.
 * `sergeant` це проактивний нудж (`./nudge.ts`): він ділить з модулями
 * спільну стелю, тож живе в тому самому плані дня (`./budget.ts`).
 */
export type ReminderModule = "routine" | "fizruk" | "nutrition" | "sergeant";

/** Одне готове до відправки нагадування. */
export interface DueReminder {
  userId: string;
  module: ReminderModule;
  /** Ідемпотентний ключ = `Notification.tag` на клієнті. */
  dedupKey: string;
  title: string;
  body: string;
  /** Deep-link, який SW відкриє по тапу. */
  url: string;
  /** Київський `HH:MM`, на який людина поставила цей привід. */
  at: string;
  /**
   * Назва приводу в згорнутому сповіщенні (`collapseReminders`), коли
   * кілька приводів ідуть одним пушем. У мінімальному режимі приватності
   * назви звички тут немає, як і в заголовку.
   */
  label: string;
}

/** Рядок `routine_habits` після мапінгу в доменний тип. */
export interface RoutineHabitRow {
  userId: string;
  habit: Habit;
  /** `routine_prefs.data.routineReminderPrivacy === "minimal"`. */
  privacyMinimal: boolean;
}

export interface RoutineDueInput {
  rows: RoutineHabitRow[];
  dayKey: string;
  hm: string;
  /** `${habitId}` тих звичок, що вже відмічені виконаними сьогодні. */
  completedHabitIds: ReadonlySet<string>;
  /** `${habitId}` тих, кому користувач сьогодні поставив «не зміг». */
  skippedHabitIds: ReadonlySet<string>;
  /**
   * `habitId → dateKey[]` відміток гнучкої звички (`recurrence: "flexible"`)
   * усередині поточного тижня `dayKey` — потрібно, щоб порахувати
   * `weekDoneCount` для `habitScheduledOnDate`. Без нього гнучка звичка
   * читається як щодня заплановану (`schedule.ts`: `weekDoneCount ===
   * undefined` → безпечний дефолт `true`), тож нагадування не замовкало б
   * після добраної тижневої норми (канон routine.md §4, рішення №7 спеки
   * `routine-flexible-weekly-frequency.md`). Для звичайних звичок не
   * читається взагалі.
   */
  weekCompletionsByHabitId?: ReadonlyMap<string, readonly string[]>;
}

/**
 * Нагадування про звички, що припадають рівно на хвилину `hm`.
 *
 * Приватність. `routineReminderPrivacy: "minimal"` — це явна відмова
 * користувача показувати назву звички на локскріні (page-audit-09 F9).
 * Перенесення нагадувань на сервер не має права цю відмову обійти, тож
 * копія тексту тут повторює клієнтську: у мінімальному режимі ні назви,
 * ні емодзі в пуш не потрапляє.
 */
export function routineDueNow({
  rows,
  dayKey,
  hm,
  completedHabitIds,
  skippedHabitIds,
  weekCompletionsByHabitId,
}: RoutineDueInput): DueReminder[] {
  const out: DueReminder[] = [];
  for (const { userId, habit, privacyMinimal } of rows) {
    if (habit.archived) continue;
    if (completedHabitIds.has(habit.id)) continue;
    // «Не зміг з причиною» — свідоме рішення користувача на сьогодні
    // (канон routine.md §5). Нагадувати після нього означає сперечатися
    // з людиною, яка вже відповіла.
    if (skippedHabitIds.has(habit.id)) continue;
    // Гнучка звичка («N разів на тиждень») перестає бути запланованою,
    // щойно тижневу ціль добрано — без `weekDoneCount` предикат завжди
    // істинний (`schedule.ts`), тож звичка «3 рази на тиждень», виконана
    // 3/3, слала б нагадування і в четвертий раз (аудит 2026-09-13, PR-R4;
    // клас А спеки `routine-flexible-weekly-frequency.md`).
    const weekDoneCount = isFlexibleHabit(habit)
      ? weekDoneCountExcludingDate(
          weekCompletionsByHabitId?.get(habit.id),
          dayKey,
        )
      : undefined;
    // `pausedFrom: dayKey` — пауза діє від сьогодні вперед (ADR-0079 §3).
    if (
      !habitScheduledOnDate(habit, dayKey, {
        pausedFrom: dayKey,
        weekDoneCount,
      })
    )
      continue;
    const times = normalizeReminderTimes(habit);
    if (!times.includes(hm)) continue;

    out.push({
      userId,
      module: "routine",
      dedupKey: reminderNotifyKey(habit.id, hm, dayKey),
      // Гліф звички з 2026-08-03 — icon-slug (`@sergeant/routine-domain`
      // → `glyphs.ts`), не emoji: префікс дав би «droplet Пити воду».
      title: privacyMinimal ? "Нагадування" : habit.name,
      body: privacyMinimal
        ? "Час для запланованої звички"
        : "Нагадування про звичку",
      url: "/?module=routine",
      at: hm,
      label: privacyMinimal ? "звичка" : habit.name,
    });
  }
  return out;
}

/** Розібраний `fizruk_monthly_plan.data`. */
export interface FizrukPlanRow {
  userId: string;
  reminderEnabled: boolean;
  reminderHour: number;
  reminderMinute: number;
  /** Чи призначено на `dayKey` тренування (є `templateId`). */
  hasWorkoutToday: boolean;
}

/** Київський `HH:MM` нагадування про тренування для рядка плану. */
export function fizrukReminderHm(row: FizrukPlanRow): string {
  return `${String(row.reminderHour).padStart(2, "0")}:${String(
    row.reminderMinute,
  ).padStart(2, "0")}`;
}

/**
 * Нагадування про тренування — лише коли на сьогодні реально є шаблон.
 *
 * Дзеркалить `checkFizrukReminders` зі старого сервіс-воркера, включно з
 * дефолтами 18:00.
 */
export function fizrukDueNow(
  rows: FizrukPlanRow[],
  dayKey: string,
  hm: string,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const row of rows) {
    if (!row.reminderEnabled) continue;
    if (!row.hasWorkoutToday) continue;
    if (fizrukReminderHm(row) !== hm) continue;
    out.push({
      userId: row.userId,
      module: "fizruk",
      dedupKey: `fizruk_notify_${dayKey}`,
      title: "Фізрук: тренування",
      body: "Заплановане тренування на сьогодні.",
      url: "/?module=fizruk",
      at: hm,
      label: "тренування",
    });
  }
  return out;
}

/** Розібраний `nutrition_prefs.prefs_json`. */
export interface NutritionPrefsRow {
  userId: string;
  reminderEnabled: boolean;
  reminderHour: number;
}

/** Київський `HH:MM` нагадування про їжу: хвилина завжди `:00`. */
export function nutritionReminderHm(row: NutritionPrefsRow): string {
  return `${String(row.reminderHour).padStart(2, "0")}:00`;
}

/**
 * Нагадування записати їжу. Хвилина фіксована на `:00` — у налаштуваннях
 * користувач обирає лише годину.
 */
export function nutritionDueNow(
  rows: NutritionPrefsRow[],
  dayKey: string,
  hm: string,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const row of rows) {
    if (!row.reminderEnabled) continue;
    if (nutritionReminderHm(row) !== hm) continue;
    out.push({
      userId: row.userId,
      module: "nutrition",
      dedupKey: `nutrition_notify_${dayKey}`,
      title: "Їжа",
      body: "Час відмітити прийом їжі.",
      url: "/?module=nutrition",
      at: hm,
      label: "запис їжі",
    });
  }
  return out;
}
