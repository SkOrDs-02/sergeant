/**
 * Канонічні межі числових полів заміру тіла (Фізрук) — єдине джерело
 * правди для клієнтських форм, доменного реєстру полів і серверного
 * sync-апплаєра.
 *
 * WHY THIS EXISTS (аудит покриття 2026-08-04, побічна знахідка).
 * Серверний apply-шлях `apps/server/src/modules/sync/fizruk/applyMisc.ts`
 * приймав ці вісім полів через НЕобмежені `parseOptionalNumber` /
 * `parseOptionalInt`: перевірялось лише «це скінченне число?», тож у
 * базу проходили фізично неможливі значення — `weight_kg: -500`,
 * `sleep_hours: 999`, `mood: 7` при шкалі 1–5. Сусідній
 * nutrition-апплаєр для аналогічних полів уже використовував
 * `parseOptionalBoundedNumber` (pre-beta input-boundaries аудит), тобто
 * хелпер і патерн у репо були — фізрук їх просто не підключив.
 *
 * Загроза тут не в зловмиснику: sync вимагає власної сесії, а запис у
 * чужий рядок і так відхиляється (`user_id_mismatch`). Реальне джерело
 * сміття — свої ж: баг у клієнті, кривий імпорт, помилка в одиницях
 * (фунти замість кілограмів, хвилини замість годин). Такі значення
 * тихо осідають в історії здоровʼя і псують графіки та середні на
 * сторінках Body/Progress, які і є цінністю модуля.
 *
 * ЧОМУ САМЕ В `@sergeant/shared`, а не в `@sergeant/fizruk-domain`:
 * межі потрібні одночасно домену (форма + валідатор на web/mobile) і
 * серверу, а `apps/server` навмисно не залежить від domain-пакетів.
 * `shared` — єдиний пакет, який уже є в залежностях обох, тож числа
 * живуть тут, а `MEASUREMENT_FIELDS` у fizruk-domain їх імпортує і
 * доклеює презентаційні label/unit. Дублювати константи по два боки
 * не можна: розійдуться (рішення власника 2026-08-25, варіант «б»).
 *
 * Шар відповідальності: це САНІТАРНА межа сервера, а не UX-обмеження.
 * Клієнтська форма може бути суворішою (наприклад, вага 20–300 у
 * `BodyEntryForm.tsx`) — це нормально; сервер лише відсікає те, що не
 * може бути правдою в принципі.
 */

/** Межі одного числового поля заміру. Обидві межі — включні. */
export interface MeasurementBound {
  /** Включна нижня межа. */
  readonly min: number;
  /** Включна верхня межа. */
  readonly max: number;
  /** `true` — поле цілочисельне (шкала 1–5), дробові підлягають floor. */
  readonly integer?: boolean;
}

/**
 * Вісім полів, що збігаються один-в-один з числовими колонками таблиці
 * `fizruk_measurements` (міграція 029): `weight_kg`, `waist_cm`,
 * `chest_cm`, `hips_cm`, `bicep_cm`, `sleep_hours`, `energy_level`,
 * `mood`. Ключі — camelCase-ідентифікатори доменних полів; серверний
 * апплаєр звертається до них явно по імені (`MEASUREMENT_BOUNDS.weightKg`),
 * тож окрема мапа column→field не потрібна.
 *
 * Додаєш нове числове поле заміру — додай межі СЮДИ першими, далі
 * колонку в міграції, далі парсер у `applyMisc.ts`.
 */
export const MEASUREMENT_BOUNDS = {
  weightKg: { min: 20, max: 400 },
  waistCm: { min: 30, max: 300 },
  chestCm: { min: 30, max: 300 },
  hipsCm: { min: 30, max: 300 },
  bicepCm: { min: 10, max: 100 },
  sleepHours: { min: 0, max: 24 },
  energyLevel: { min: 1, max: 5, integer: true },
  mood: { min: 1, max: 5, integer: true },
} as const satisfies Record<string, MeasurementBound>;

/** Ідентифікатор поля, для якого визначені канонічні межі. */
export type MeasurementBoundId = keyof typeof MEASUREMENT_BOUNDS;
