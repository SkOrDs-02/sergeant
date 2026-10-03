/**
 * Last validated: 2026-08-08
 * Status: Active
 *
 * Місток «самопочуття з фінішу тренування → денний журнал Body».
 *
 * AI-CONTEXT: до 2026-08 це були два незалежні входи одного й того
 * самого факту. Людина ставила «енергія 4 / настрій 4» в аркуші
 * завершення тренування, йшла у Body — і бачила порожню форму
 * самопочуття за сьогодні (аудит L-10.3, 2026-08-07). Запис із фінішу
 * лягав у `workout.wellbeing` і нікуди більше.
 *
 * Правило дозапису навмисно однобічне: фініш ДОПИСУЄ, але ніколи не
 * ПЕРЕПИСУЄ. Якщо на сьогодні вже є запис із заповненою енергією чи
 * настроєм — людина вже сказала своє слово в Body, і побічний ефект
 * тренування не має права його переставити. Автоматика тут дешева, а
 * втрачений ручний ввід — ні.
 *
 * Межа доби — ГОДИННИК ПРИСТРОЮ (ADR-0078): денний запис Body є
 * особистою сутністю, а не серверним звітом.
 */

interface DailyLogEntryLike {
  readonly at?: string | null;
  readonly energyLevel?: number | null;
  readonly moodScore?: number | null;
}

export interface WellbeingValues {
  readonly energy?: number | null;
  readonly mood?: number | null;
}

/**
 * Чи припадає ISO-момент на ту саму добу пристрою, що й `reference`.
 *
 * @param iso Момент запису журналу.
 * @param reference Точка відліку («зараз»), передається явно, щоб
 *   тест не залежав від системного годинника.
 */
export function isSameDeviceDay(
  iso: string | null | undefined,
  reference: Date,
): boolean {
  if (!iso) return false;
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return false;
  return (
    /* eslint-disable sergeant-design/prefer-kyiv-time -- ADR-0078: денний запис самопочуття — особиста сутність, її доба належить ПРИСТРОЮ, а не Києву. Київський день-ключ тут дав би «вчора» тому, хто тренується пізно ввечері в іншому поясі, і місток дописав би оцінку в чужу добу. */
    at.getFullYear() === reference.getFullYear() &&
    at.getMonth() === reference.getMonth() &&
    at.getDate() === reference.getDate()
    /* eslint-enable sergeant-design/prefer-kyiv-time */
  );
}

/**
 * Що саме треба дописати в денний журнал після фінішу тренування.
 *
 * @returns `null`, коли дописувати нічого: або користувач нічого не
 *   оцінив, або сьогоднішній запис уже несе оцінку.
 */
export function planWellbeingHandoff(
  values: WellbeingValues,
  entries: readonly DailyLogEntryLike[],
  reference: Date,
): { energyLevel?: number; moodScore?: number } | null {
  const energy = typeof values.energy === "number" ? values.energy : null;
  const mood = typeof values.mood === "number" ? values.mood : null;
  if (energy === null && mood === null) return null;

  const alreadyRated = entries.some(
    (entry) =>
      isSameDeviceDay(entry.at, reference) &&
      (entry.energyLevel != null || entry.moodScore != null),
  );
  if (alreadyRated) return null;

  return {
    ...(energy !== null ? { energyLevel: energy } : {}),
    ...(mood !== null ? { moodScore: mood } : {}),
  };
}
