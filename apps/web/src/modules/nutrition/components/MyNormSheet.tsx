/**
 * Last validated: 2026-10-08
 * Status: Active
 *
 * Аркуш «Моя норма»: біометрика + мета + темп -> норма ккал/БЖВ із видимим
 * розкладом формули. Працює без входу: біометрика локальна, вага йде у
 * fizruk-журнал через `persistBiometricsDiff` (ADR-0080), норма пишеться
 * патчем у `NutritionPrefs` (origin `preset`, як «Розрахувати з профілю»).
 * Мережа не потрібна, тому гейта `online` тут немає.
 */
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Segmented } from "@shared/components/ui/Segmented";
import { Sheet } from "@shared/components/ui/Sheet";
import { normalizeAmountInput } from "@shared/lib/format/amount";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import {
  DEFAULT_WEEKLY_RATE_KG,
  WEEKLY_RATES_KG,
  type WeeklyRateKg,
} from "@sergeant/nutrition-domain";
import {
  BiometricsFormFields,
  formToBiometrics,
  persistBiometricsDiff,
  useBiometricsForm,
} from "../../../core/profile/BiometricsFormFields";
import {
  WEIGHT_KG_RANGE,
  type ActivityLevel,
} from "../../../core/profile/biometrics";
import { useAverageWorkoutKcalPerDay } from "../../../core/profile/useAverageWorkoutKcal";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import { useLatestBodyWeightKg } from "../../../core/profile/useLatestBodyWeight";
import { useDailyLog } from "../../fizruk/hooks/useDailyLog";
import {
  NUTRITION_GOALS,
  estimateGoalDate,
  explainNutritionTargetsFromBiometrics,
  resolveEffectiveWeightKg,
  weeklyRateDeficitKcal,
  type NutritionGoalId,
} from "../lib/tdee";
import {
  loadLatestNutritionPrefs,
  patchProfileNutritionPrefs,
} from "../lib/nutritionStorage";

const COPY = messages.nutrition.myNorm;

const ACTIVITY_WORD: Record<ActivityLevel, string> = {
  sedentary: COPY.activitySedentary,
  light: COPY.activityLight,
  moderate: COPY.activityModerate,
  active: COPY.activityActive,
  very_active: COPY.activityVeryActive,
};

const GOAL_LABEL: Record<NutritionGoalId, string> = {
  cutting: COPY.goalCutting,
  maintenance: COPY.goalMaintenance,
  bulking: COPY.goalBulking,
};

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? (values[key] ?? whole) : whole,
  );
}

const fmtInt = (n: number): string => Math.round(n).toLocaleString("uk-UA");
const fmtDecimal = (n: number): string => String(n).replace(".", ",");

function parseGoalWeight(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(normalizeAmountInput(trimmed));
  return Number.isFinite(n) &&
    n >= WEIGHT_KG_RANGE.min &&
    n <= WEIGHT_KG_RANGE.max
    ? n
    : "invalid";
}

interface MyNormSheetProps {
  open: boolean;
  onClose: () => void;
}

export function MyNormSheet({ open, onClose }: MyNormSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={COPY.description}
      panelClassName="nutrition-sheet"
      zIndex={120}
    >
      {/* Тіло змонтоване лише поки аркуш відкритий: форма щоразу стартує зі
          збережених значень. */}
      {open && <MyNormBody onClose={onClose} />}
    </Sheet>
  );
}

function MyNormBody({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { biometrics, saveBiometrics } = useBiometrics();
  const { addEntry: addDailyLogEntry } = useDailyLog();
  const fizrukWeightKg = useLatestBodyWeightKg();
  const workoutKcal = useAverageWorkoutKcalPerDay();
  const formState = useBiometricsForm(biometrics);
  const { form } = formState;

  const [initialPrefs] = useState(() => loadLatestNutritionPrefs());
  const [goal, setGoal] = useState<NutritionGoalId>(
    initialPrefs.adaptiveGoalIntent === "cutting" ||
      initialPrefs.adaptiveGoalIntent === "bulking"
      ? initialPrefs.adaptiveGoalIntent
      : "maintenance",
  );
  const [rate, setRate] = useState<WeeklyRateKg>(
    initialPrefs.weeklyRateKg ?? DEFAULT_WEEKLY_RATE_KG,
  );
  const [goalWeightRaw, setGoalWeightRaw] = useState(
    initialPrefs.goalWeightKg == null ? "" : String(initialPrefs.goalWeightKg),
  );
  const [goalWeightTouched, setGoalWeightTouched] = useState(false);

  const goalWeight = parseGoalWeight(goalWeightRaw);
  const candidate = useMemo(
    () => formToBiometrics(form, biometrics),
    [form, biometrics],
  );
  const explanation = useMemo(
    () =>
      explainNutritionTargetsFromBiometrics(
        candidate,
        goal,
        new Date(),
        // Вага з форми має пріоритет над журналом: людина щойно її ввела.
        candidate.weightKg != null ? null : fizrukWeightKg,
        workoutKcal,
        rate,
      ),
    [candidate, goal, fizrukWeightKg, workoutKcal, rate],
  );

  const effectiveWeight = resolveEffectiveWeightKg(candidate, fizrukWeightKg);
  const goalDate =
    goal === "cutting" &&
    effectiveWeight != null &&
    typeof goalWeight === "number"
      ? estimateGoalDate(effectiveWeight, goalWeight, rate)
      : null;

  const canApply =
    explanation !== null &&
    goalWeight !== "invalid" &&
    !formState.hasInvalidField;

  const retry = { label: COPY.retry, onClick: () => handleApply() };

  const handleApply = () => {
    if (!explanation || goalWeight === "invalid") return;
    try {
      if (formState.diff && formState.dirty) {
        persistBiometricsDiff(formState.diff, {
          saveBiometrics,
          addDailyLogEntry,
        });
      }
      const { targets } = explanation;
      const ok = patchProfileNutritionPrefs({
        dailyTargetKcal: targets.kcal,
        dailyTargetProtein_g: targets.protein_g,
        dailyTargetFat_g: targets.fat_g,
        dailyTargetCarbs_g: targets.carbs_g,
        weeklyRateKg: rate,
        goalWeightKg: goalWeight,
        adaptiveGoalIntent: goal,
        adaptiveGoalLastUpdatedAt: new Date().toISOString(),
      });
      if (!ok) {
        toast.error(COPY.stillLoading, undefined, retry);
        return;
      }
      toast.success(COPY.applied);
      onClose();
    } catch {
      toast.error(COPY.saveError, undefined, retry);
    }
  };

  const deltaText = explanation
    ? explanation.deltaKcal < 0
      ? fill(COPY.deltaDeficit, { kcal: fmtInt(-explanation.deltaKcal) })
      : explanation.deltaKcal > 0
        ? fill(COPY.deltaSurplus, { kcal: fmtInt(explanation.deltaKcal) })
        : COPY.deltaNone
    : "";
  const dynamic = Boolean(explanation && candidate.countWorkoutsInGoal);

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-style-caption text-muted">{COPY.goalLabel}</div>
        <Segmented
          layout="bar"
          size="md"
          variant="nutrition"
          ariaLabel={COPY.goalLabel}
          value={goal}
          onChange={setGoal}
          items={NUTRITION_GOALS.map((value) => ({
            value,
            label: GOAL_LABEL[value],
          }))}
        />
      </div>

      {goal === "cutting" && (
        <div className="space-y-1">
          <div className="text-style-caption text-muted">{COPY.rateLabel}</div>
          <Segmented
            layout="bar"
            size="md"
            variant="nutrition"
            ariaLabel={COPY.rateLabel}
            value={String(rate)}
            onChange={(v) => setRate(Number(v) as WeeklyRateKg)}
            items={WEEKLY_RATES_KG.map((value) => ({
              value: String(value),
              label: fill(COPY.rateOption, { rate: fmtDecimal(value) }),
              title: `-${weeklyRateDeficitKcal(value)}`,
            }))}
          />
        </div>
      )}

      <div className="divide-y divide-line/60 rounded-xl border border-line">
        <BiometricsFormFields
          state={formState}
          fieldClassName="px-3 py-3 space-y-2"
        />
      </div>

      {goal === "cutting" && (
        <div className="space-y-2">
          <label
            htmlFor="my-norm-goal-weight"
            className="text-style-caption block text-muted"
          >
            {COPY.goalWeightLabel}
          </label>
          <Input
            id="my-norm-goal-weight"
            type="number"
            inputMode="decimal"
            min={WEIGHT_KG_RANGE.min}
            max={WEIGHT_KG_RANGE.max}
            step={0.1}
            value={goalWeightRaw}
            onChange={(e) => setGoalWeightRaw(e.target.value)}
            onBlur={() => setGoalWeightTouched(true)}
            className="min-w-0 max-w-full"
            error={goalWeight === "invalid" && goalWeightTouched}
            helperText={
              goalWeight === "invalid" && goalWeightTouched
                ? COPY.goalWeightRangeError
                : goalDate
                  ? fill(COPY.goalDate, {
                      date: goalDate.toLocaleDateString("uk-UA", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      }),
                    })
                  : undefined
            }
          />
        </div>
      )}

      <div
        className="rounded-xl border border-line bg-panel px-3 py-3"
        aria-live="polite"
      >
        {explanation ? (
          <>
            <div className="text-style-caption text-muted">
              {COPY.resultLabel}
            </div>
            <div className="text-style-heading text-text">
              {fill(COPY.resultKcal, {
                kcal: fmtInt(explanation.targets.kcal),
              })}
            </div>
            <p className="mt-1 text-style-caption text-muted">
              {dynamic
                ? fill(COPY.formulaLineDynamic, {
                    workout: fmtInt(explanation.workoutKcal),
                    delta: deltaText,
                  })
                : fill(COPY.formulaLine, {
                    activity: ACTIVITY_WORD[explanation.activityLevel],
                    multiplier: fmtDecimal(explanation.multiplier),
                    delta: deltaText,
                  })}
            </p>
            <details className="mt-1 text-style-caption text-muted">
              <summary className="cursor-pointer pointer-coarse:min-h-[44px] pointer-coarse:flex pointer-coarse:items-center text-nutrition-strong dark:text-nutrition">
                {COPY.howToggle}
              </summary>
              <p className="mt-1">
                {fill(dynamic ? COPY.howBodyDynamic : COPY.howBody, {
                  bmr: fmtInt(explanation.bmr),
                  multiplier: fmtDecimal(explanation.multiplier),
                  workout: fmtInt(explanation.workoutKcal),
                  tdee: fmtInt(explanation.tdee),
                  delta: deltaText,
                  kcal: fmtInt(explanation.targets.kcal),
                })}
              </p>
              {explanation.clampedBy === "floor" && (
                <p className="mt-1">{COPY.floorNote}</p>
              )}
            </details>
          </>
        ) : (
          <p className="text-style-caption text-muted">{COPY.incomplete}</p>
        )}
      </div>

      <Button
        variant="solid"
        tone="nutrition"
        className="w-full"
        disabled={!canApply}
        onClick={handleApply}
      >
        {COPY.apply}
      </Button>
    </div>
  );
}
