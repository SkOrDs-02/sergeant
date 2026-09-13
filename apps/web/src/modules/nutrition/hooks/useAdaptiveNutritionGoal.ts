import { useEffect, useMemo } from "react";
import {
  addDeviceDays,
  clampGoalDelta,
  deviceDayKey,
  isDayFullyLogged,
  measuredTdee,
  type IntakeDay,
  type MeasuredTdeeResult,
  type NutritionLog,
  type NutritionPrefs,
  type WeightPoint,
} from "@sergeant/nutrition-domain";
import { computeWorkoutKcalBurned } from "@sergeant/fizruk-domain";
import { computeAgeYears } from "../../../core/profile/biometrics";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import { getCachedFizrukSqliteState } from "../../fizruk/lib/sqliteReader";
import { useFizrukSqliteReadTick } from "../../fizruk/lib/sqliteReadGate";
import { getDaySummary } from "../lib/nutritionStorage";
import {
  persistAdaptiveNutritionPrefs,
  persistProfileNutritionPrefs,
} from "../lib/nutritionStorage";
import {
  GOAL_KCAL_DELTA,
  computeMacrosForKcal,
  computeNutritionTargetsFromBiometrics,
  mifflinStJeorBmr,
} from "../lib/tdee";

export interface AdaptiveGoalState {
  mode: "disabled" | "profile-needed" | "calibrating" | "active";
  completeDays: number;
  weightPoints: number;
  lastUpdatedAt: string | null;
  /**
   * Підстава останнього перерахунку — ті самі три числа, що їх обіцяє
   * спека: середнє споживання, тренд ваги, виміряна витрата. Доти стан
   * їх не віз узагалі, хоча `measuredTdee` рахує їх усі, тож показати
   * причину зміни цілі було нічим.
   */
  measured: MeasuredTdeeResult | null;
  /** Чинна ціль, щоб підпис показував не лише витрату, а й саме число. */
  goalKcal: number | null;
}

/** Вікно аналізу: 14 завершених днів до сьогодні. */
const WINDOW_DAYS = 14;

let lastScheduledSignature = "";

/**
 * Скидає модульний дедуп планувальника.
 *
 * `lastScheduledSignature` навмисно живе поза компонентом: він гасить
 * повторний запис тієї самої цілі при кожному ре-рендері. Але між
 * тест-кейсами він же робить другий `render()` беззвучним no-op-ом, тож
 * тестам потрібен явний ресет — як `__setFizrukSqliteCacheForTests` у
 * `modules/fizruk/lib/sqliteReader.ts`.
 */
export function __resetAdaptiveGoalScheduleForTests(): void {
  lastScheduledSignature = "";
}

function pointDay(at: string): string | null {
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : deviceDayKey(parsed);
}

function collectWeights(start: string, end: string): WeightPoint[] {
  const cache = getCachedFizrukSqliteState();
  const byDay = new Map<string, number>();
  for (const entry of [...cache.measurements, ...cache.dailyLog]) {
    const value = entry.weightKg;
    const dateKey = pointDay(entry.at);
    if (
      dateKey &&
      dateKey >= start &&
      dateKey <= end &&
      typeof value === "number" &&
      Number.isFinite(value) &&
      value > 0 &&
      !byDay.has(dateKey)
    ) {
      byDay.set(dateKey, value);
    }
  }
  return [...byDay].map(([dateKey, weightKg]) => ({ dateKey, weightKg }));
}

/**
 * Найсвіжіша вага з вікна.
 *
 * Не `weights.at(-1)`: `collectWeights` наповнює `Map` у порядку кешу
 * fizruk (newest-first, спершу `measurements`, потім `dailyLog`), тож
 * останній елемент масиву — найСТАРІШИЙ день, ще й залежний від того,
 * який із двох джерельних масивів непорожній. Доменні функції
 * (`weightTrendEma`) сортують самі й цього не помічають, а ось
 * розрахунок цілі брав не ту вагу.
 */
function latestWeightKg(weights: readonly WeightPoint[]): number | null {
  let latest: WeightPoint | null = null;
  for (const point of weights) {
    if (!latest || point.dateKey > latest.dateKey) latest = point;
  }
  return latest?.weightKg ?? null;
}

/**
 * Середньодобові витрати на тренуваннях за те саме вікно, що й решта
 * аналізу.
 *
 * Навіщо середнє, а не «сьогодні»: тут рахується БАЗОВА денна норма, і
 * вона не має стрибати залежно від того, чи саме сьогодні був
 * тренувальний день.
 *
 * Тут раніше стояло, що спалене за сьогодні «лишається для пресетів у
 * `DailyPlanGoalSelectors`, де людина свідомо тисне „розрахувати з
 * профілю“ і бачить корекцію на сьогодні». Половина правди: показати
 * сьогоднішню корекцію справді доречно, але пресет ЗАПИСУВАВ її в
 * постійну `dailyTargetKcal` — тобто разове тренування роздувало ціль
 * назавжди. Обидва шляхи тепер усереднюють
 * (`core/profile/useAverageWorkoutKcal.ts`), і `useTodayWorkoutKcal`
 * прибрано, щоб пастку не можна було зібрати наново.
 *
 * Має значення лише при `countWorkoutsInGoal` — у статичному режимі
 * `computeTdee` це число ігнорує, бо тренування вже сидять у множнику
 * рівня активності (`lib/tdee.ts:135-148`).
 */
function collectWorkoutKcalPerDay(
  start: string,
  end: string,
  weightKg: number | null,
): number {
  const cache = getCachedFizrukSqliteState();
  let total = 0;
  for (const workout of cache.workouts) {
    if (!workout.endedAt) continue;
    const dateKey = pointDay(workout.startedAt);
    if (!dateKey || dateKey < start || dateKey > end) continue;
    total += computeWorkoutKcalBurned(workout, weightKg) ?? 0;
  }
  return total / WINDOW_DAYS;
}

function isDue(lastUpdatedAt: string | null): boolean {
  if (!lastUpdatedAt) return true;
  const timestamp = new Date(lastUpdatedAt).getTime();
  return (
    !Number.isFinite(timestamp) || Date.now() - timestamp >= 7 * 86_400_000
  );
}

export function useAdaptiveNutritionGoal(
  log: NutritionLog,
  prefs: NutritionPrefs,
): AdaptiveGoalState {
  const { biometrics } = useBiometrics();
  // Кеш fizruk читається нижче (`collectWeights`, `collectWorkoutKcalPerDay`),
  // а memo без цього тіку залежав би лише від `log` — новий вимір ваги чи
  // щойно завершене тренування лишали б ціль порахованою на старих даних.
  // Тік — канонічний спосіб підписки на цей кеш: так роблять усі
  // fizruk-хуки (`useWorkouts`, `useMeasurements`, …).
  const fizrukCacheTick = useFizrukSqliteReadTick();
  const analysis = useMemo(() => {
    // Тік — вхід інвалідації, а не значення: сам кеш читається нижче
    // функціями, які React не бачить. Без цього рядка `exhaustive-deps`
    // вважає залежність зайвою і пропонує її прибрати — тобто повернути
    // memo до стану «ціль порахована на старих даних fizruk».
    void fizrukCacheTick;
    const end = addDeviceDays(deviceDayKey(), -1);
    const start = addDeviceDays(end, -13);
    const intakeDays: IntakeDay[] = [];
    for (let i = 0; i < 14; i += 1) {
      const dateKey = addDeviceDays(start, i);
      const summary = getDaySummary(log, dateKey);
      intakeDays.push({
        dateKey,
        kcal: summary.kcal,
        // Повнота — від ВЛАСНОЇ цілі людини, не від лічильника прийомів:
        // три перекуси на 300 ккал не є повним днем, а один прийом на
        // 2000 — є. Розбір обох промахів — у `isDayFullyLogged`.
        //
        // Лічильник іде другим аргументом і працює лише як запасний, поки
        // цілі ще немає. Саме `loggedMealTypesCount`, НЕ `mealCount`:
        // фото, збережене кількома рядками одного прийому, не є кількома
        // прийомами (аудит PR-N2, 2026-09-13; контракт — у докстрінгу
        // `DaySummary.mealCount`). Обидві знахідки тут потрібні: та про
        // рядки проти прийомів виправляє ЛІЧИЛЬНИК, ця — вісь, по якій
        // міряють повноту взагалі.
        complete: isDayFullyLogged(
          summary.kcal,
          summary.loggedMealTypesCount,
          prefs.dailyTargetKcal ?? null,
        ),
      });
    }
    const weights = collectWeights(start, end);
    const latestKg = latestWeightKg(weights);
    return {
      intakeDays,
      weights,
      latestWeightKg: latestKg,
      // Вага з профілю як фолбек: без неї `computeWorkoutKcalBurned`
      // повертає `null` для сесій, порахованих за MET (тобто для всіх, де
      // `kcalBurned` не записаний явно), і витрати тихо стають нулем — рівно
      // для того, хто ввімкнув «рахувати тренування».
      workoutKcalPerDay: collectWorkoutKcalPerDay(
        start,
        end,
        latestKg ?? biometrics.weightKg,
      ),
      measured: measuredTdee(intakeDays, weights),
    };
    // `prefs.dailyTargetKcal` у залежностях обовʼязковий: він задає поріг
    // повноти дня, тож без нього класифікація лишалась би порахованою на
    // старій цілі.
    //
    // AI-CONTEXT: так, поріг бере ту саму ціль, яку ці ворота й гейтять —
    // самопосилання тут свідоме, і воно ЗГАСАЮЧЕ, а не розганяльне. Ціль
    // униз → поріг униз → днів проходить БІЛЬШЕ (дані повертаються); ціль
    // угору → поріг угору → днів менше, і перерахунок просто чекає. Рух
    // самої цілі обмежений ±10% за тиждень (`clampGoalDelta`) і підлогою
    // BMR, тож петля не має де розігнатись. Незалежним якорем був би BMR,
    // але він тут недосяжний без циклу: `profileTargets` сам залежить від
    // `analysis`.
  }, [log, fizrukCacheTick, biometrics.weightKg, prefs.dailyTargetKcal]);

  const profileTargets = useMemo(
    () =>
      computeNutritionTargetsFromBiometrics(
        biometrics,
        prefs.adaptiveGoalIntent,
        undefined,
        analysis.latestWeightKg,
        analysis.workoutKcalPerDay,
      ),
    [
      analysis.latestWeightKg,
      analysis.workoutKcalPerDay,
      biometrics,
      prefs.adaptiveGoalIntent,
    ],
  );

  useEffect(() => {
    if (!prefs.adaptiveGoalEnabled || !profileTargets) return;
    // Усі входи розрахунку, а не лише виміряний TDEE: інакше зміна ваги
    // чи витрат на тренуваннях лишала б підпис тим самим, і планувальник
    // пропускав би запис уже нової цілі.
    const signature = [
      prefs.adaptiveGoalLastUpdatedAt ?? "new",
      prefs.dailyTargetKcal ?? "unset",
      analysis.measured?.tdeeKcal ?? "calibrating",
      analysis.latestWeightKg ?? "no-weight",
      Math.round(analysis.workoutKcalPerDay),
      prefs.adaptiveGoalIntent,
    ].join(":");
    if (lastScheduledSignature === signature) return;

    if (prefs.dailyTargetKcal == null) {
      lastScheduledSignature = signature;
      persistProfileNutritionPrefs({
        ...prefs,
        dailyTargetKcal: profileTargets.kcal,
        dailyTargetProtein_g: profileTargets.protein_g,
        dailyTargetFat_g: profileTargets.fat_g,
        dailyTargetCarbs_g: profileTargets.carbs_g,
      });
      return;
    }
    if (!analysis.measured || !isDue(prefs.adaptiveGoalLastUpdatedAt)) return;

    const ageYears = computeAgeYears(biometrics.birthDate);
    const weightKg = analysis.latestWeightKg ?? biometrics.weightKg;
    if (
      ageYears == null ||
      weightKg == null ||
      biometrics.heightCm == null ||
      biometrics.sex == null
    ) {
      return;
    }
    const bmr = mifflinStJeorBmr({
      weightKg,
      heightCm: biometrics.heightCm,
      ageYears,
      sex: biometrics.sex,
    });
    const proposed =
      analysis.measured.tdeeKcal + GOAL_KCAL_DELTA[prefs.adaptiveGoalIntent];
    const kcal = clampGoalDelta(proposed, prefs.dailyTargetKcal, bmr);
    const targets = computeMacrosForKcal(
      kcal,
      weightKg,
      prefs.adaptiveGoalIntent,
    );
    lastScheduledSignature = signature;
    persistAdaptiveNutritionPrefs({
      ...prefs,
      dailyTargetKcal: targets.kcal,
      dailyTargetProtein_g: targets.protein_g,
      dailyTargetFat_g: targets.fat_g,
      dailyTargetCarbs_g: targets.carbs_g,
      adaptiveGoalLastUpdatedAt: new Date().toISOString(),
    });
  }, [analysis, biometrics, prefs, profileTargets]);

  if (!prefs.adaptiveGoalEnabled) {
    return {
      mode: "disabled",
      completeDays: 0,
      weightPoints: 0,
      lastUpdatedAt: null,
      measured: null,
      goalKcal: null,
    };
  }
  if (!profileTargets) {
    return {
      mode: "profile-needed",
      completeDays:
        analysis.measured?.completeDays ??
        analysis.intakeDays.filter((d) => d.complete).length,
      weightPoints: analysis.weights.length,
      lastUpdatedAt: prefs.adaptiveGoalLastUpdatedAt,
      measured: analysis.measured,
      goalKcal: prefs.dailyTargetKcal ?? null,
    };
  }
  return {
    mode: analysis.measured ? "active" : "calibrating",
    completeDays:
      analysis.measured?.completeDays ??
      analysis.intakeDays.filter((d) => d.complete).length,
    weightPoints: analysis.weights.length,
    lastUpdatedAt: prefs.adaptiveGoalLastUpdatedAt,
    measured: analysis.measured,
    goalKcal: prefs.dailyTargetKcal ?? null,
  };
}
