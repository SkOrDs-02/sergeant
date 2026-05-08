import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { chartHex } from "@sergeant/design-tokens/tokens";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import { FirstRunHintBanner } from "../../../core/onboarding/FirstRunHintBanner";
import { useBiometrics } from "../../../core/profile/useBiometrics";
import {
  NUTRITION_GOALS,
  computeNutritionTargetsFromBiometrics,
  type NutritionGoalId,
  type NutritionTargets,
} from "../lib/tdee";
import type {
  MealTypeId,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type {
  NutritionDayPlan,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";

const TDEE_COPY = messages.nutritionTdee;

const TDEE_GOAL_LABELS: Record<NutritionGoalId, string> = {
  cutting: TDEE_COPY.goalCutting,
  maintenance: TDEE_COPY.goalMaintenance,
  bulking: TDEE_COPY.goalBulking,
};

interface PlanMeal {
  type?: MealTypeId | string;
  label?: string;
  name?: string;
  description?: string;
  kcal?: number | null;
  protein_g?: number | null;
  fat_g?: number | null;
  carbs_g?: number | null;
  ingredients?: string[];
  [key: string]: unknown;
}

interface Preset {
  id: string;
  label: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

interface WeekPlanDay {
  label?: string;
  note?: string;
  meals?: string[];
}

const PRESETS = [
  {
    id: "cutting",
    label: "Схуднення",
    kcal: 1500,
    protein_g: 130,
    fat_g: 55,
    carbs_g: 130,
  },
  {
    id: "maintenance",
    label: "Підтримка",
    kcal: 2000,
    protein_g: 150,
    fat_g: 70,
    carbs_g: 200,
  },
  {
    id: "bulking",
    label: "Набір маси",
    kcal: 2700,
    protein_g: 200,
    fat_g: 90,
    carbs_g: 290,
  },
];

const MEAL_TYPE_ORDER: readonly string[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
];
const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: "Сніданок",
  lunch: "Обід",
  dinner: "Вечеря",
  snack: "Перекус",
};
const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: "☀️",
  lunch: "🥗",
  dinner: "🍽️",
  snack: "🍎",
};

/**
 * PR-37 ux-roast 2026-Q3 / §3.3.
 *
 * Перевіряє, чи цільові макро вкладаються в цільові ккал. Якщо
 * ні — повертає {kind: "over"} з різницею; якщо вкладаються, але
 * істотно недотягують — {kind: "under"}; інакше null.
 *
 * Допуск ±5% покриває звичайне округлення macro-grams (1г білка ≠
 * рівно 4 ккал у живій їжі), щоб не сипати warnings на пресети.
 */
export function calcMacroKcalMismatch(prefs: NutritionPrefs): {
  kind: "over" | "under";
  target: number;
  calc: number;
  diff: number;
} | null {
  const target = prefs.dailyTargetKcal ?? 0;
  if (target <= 0) return null;
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (prot <= 0 && fat <= 0 && carb <= 0) return null;
  const calc = Math.round(prot * 4 + fat * 9 + carb * 4);
  const tolerance = Math.round(target * 0.05);
  const diff = calc - target;
  if (diff > tolerance) {
    return { kind: "over", target, calc, diff };
  }
  if (diff < -tolerance) {
    return { kind: "under", target, calc, diff };
  }
  return null;
}

interface MacroKcalWarningProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean;
}

function MacroKcalWarning({ prefs, setPrefs, busy }: MacroKcalWarningProps) {
  const mismatch = calcMacroKcalMismatch(prefs);
  if (!mismatch) return null;

  const { kind, target, calc, diff } = mismatch;
  const absDiff = Math.abs(diff);
  const overshoot = kind === "over";

  const tone = overshoot
    ? "border-danger/40 bg-danger/10"
    : "border-warn/40 bg-warn/10";
  const iconTone = overshoot ? "text-danger" : "text-warn";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 rounded-xl border px-3 py-2.5 text-xs space-y-2",
        tone,
      )}
      data-testid="macro-kcal-warning"
    >
      <div className="flex items-start gap-2">
        <span className={cn("shrink-0 font-bold", iconTone)} aria-hidden>
          {overshoot ? "⚠" : "ℹ"}
        </span>
        <p className="text-text leading-snug">
          {overshoot ? (
            <>
              Сума макро виходить на <strong>{calc} ккал</strong> — це на{" "}
              <strong>{absDiff} ккал</strong> більше за ціль{" "}
              <strong>{target} ккал</strong>. 1 г білка = 4 ккал, 1 г жиру = 9
              ккал, 1 г вуглеводів = 4 ккал.
            </>
          ) : (
            <>
              Сума макро дає лише <strong>{calc} ккал</strong> — це на{" "}
              <strong>{absDiff} ккал</strong> менше за ціль{" "}
              <strong>{target} ккал</strong>.
            </>
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
        <button
          type="button"
          disabled={busy}
          onClick={() => setPrefs((p) => ({ ...p, dailyTargetKcal: calc }))}
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/60 text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
        >
          Перерахувати ккал → {calc}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setPrefs((p) => ({
              ...p,
              dailyTargetProtein_g: null,
              dailyTargetFat_g: null,
              dailyTargetCarbs_g: null,
            }))
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/40 text-subtle hover:text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
        >
          Скинути макро
        </button>
      </div>
    </div>
  );
}

interface MissingMacrosHintProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  busy?: boolean;
}

/**
 * Користувач у фідбеку 2026-05 (UX-roast §3.3): «коли вводить ккал
 * воно підставляло середні стартові значення для макросів, а юзер
 * потім редачив». Тут — м'яка підказка з кнопкою «Підставити середні»,
 * яка з'являється тільки коли вже задано ккал, але макросів ще немає.
 * Дефолти: 1.6 г білка / 1 г жиру на кг ваги (типові безпечні старт-
 * рекомендації); вуглеводи добираються залишком ккал. Ваги ми не
 * знаємо в цій картці, тому стартуємо з macro-сплітом 30/25/45 від
 * заданих ккал — це одночасно дає валідні цифри й не претендує на
 * точність (її користувач уточнить вручну).
 */
function MissingMacrosHint({ prefs, setPrefs, busy }: MissingMacrosHintProps) {
  const kcal = prefs.dailyTargetKcal ?? 0;
  if (kcal <= 0) return null;
  const hasAnyMacro =
    (prefs.dailyTargetProtein_g ?? 0) > 0 ||
    (prefs.dailyTargetFat_g ?? 0) > 0 ||
    (prefs.dailyTargetCarbs_g ?? 0) > 0;
  if (hasAnyMacro) return null;

  // 30 % білок · 25 % жир · 45 % вуглеводи від цільових ккал → грами.
  const suggestedProtein = Math.round((kcal * 0.3) / 4);
  const suggestedFat = Math.round((kcal * 0.25) / 9);
  const suggestedCarbs = Math.round((kcal * 0.45) / 4);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "mt-3 rounded-xl border border-warn/40 bg-warn/10 px-3 py-2.5",
        "text-xs space-y-2",
      )}
      data-testid="missing-macros-hint"
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-bold text-warn" aria-hidden>
          ℹ
        </span>
        <p className="text-text leading-snug">
          Задано лише <strong>{kcal} ккал</strong>, але без макро AI не зрозуміє
          що тобі важливо — білок, жир чи вуглеводи. Підстав середні стартові
          значення й відредагуй під себе.
        </p>
      </div>
      <div className="flex flex-wrap gap-2 pl-5">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            setPrefs((p) => ({
              ...p,
              dailyTargetProtein_g: suggestedProtein,
              dailyTargetFat_g: suggestedFat,
              dailyTargetCarbs_g: suggestedCarbs,
            }))
          }
          className={cn(
            "inline-flex items-center gap-1 rounded-xl border px-2 py-1",
            "border-line/60 bg-bg/60 text-text hover:bg-panelHi",
            "disabled:opacity-50 transition-colors",
          )}
        >
          Підставити середні · Б{suggestedProtein} · Ж{suggestedFat} · В
          {suggestedCarbs}
        </button>
      </div>
    </div>
  );
}

function MacroRatioBar({ prefs }: { prefs: NutritionPrefs }) {
  const prot = prefs.dailyTargetProtein_g ?? 0;
  const fat = prefs.dailyTargetFat_g ?? 0;
  const carb = prefs.dailyTargetCarbs_g ?? 0;
  if (!(prot > 0) && !(fat > 0) && !(carb > 0)) return null;

  const protKcal = prot * 4;
  const fatKcal = fat * 9;
  const carbKcal = carb * 4;
  const total = protKcal + fatKcal + carbKcal || 1;

  const pctP = Math.round((protKcal / total) * 100);
  const pctF = Math.round((fatKcal / total) * 100);
  const pctC = 100 - pctP - pctF;

  return (
    <div className="mt-3 space-y-1.5">
      <SectionHeading as="div" size="xs">
        Відсоткове співвідношення макро
      </SectionHeading>
      <div className="flex rounded-xl overflow-hidden h-5">
        {pctP > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctP}%`, backgroundColor: chartHex.protein }}
          >
            {pctP}%
          </div>
        )}
        {pctF > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctF}%`, backgroundColor: chartHex.fat }}
          >
            {pctF}%
          </div>
        )}
        {pctC > 0 && (
          <div
            className="flex items-center justify-center text-2xs font-bold text-white"
            style={{ width: `${pctC}%`, backgroundColor: chartHex.carbs }}
          >
            {pctC}%
          </div>
        )}
      </div>
      <div className="flex gap-3 flex-wrap">
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.protein }}
          />{" "}
          Б {pctP}% · {prot}г · {Math.round(protKcal)} ккал
        </span>
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.fat }}
          />{" "}
          Ж {pctF}% · {fat}г · {Math.round(fatKcal)} ккал
        </span>
        <span className="flex items-center gap-1 text-2xs text-subtle">
          <span
            className="w-2 h-2 rounded-sm"
            style={{ backgroundColor: chartHex.carbs }}
          />{" "}
          В {pctC}% · {carb}г · {Math.round(carbKcal)} ккал
        </span>
      </div>
    </div>
  );
}

interface MacroBadgeProps {
  label: string;
  value: number | null | undefined;
  unit?: string;
  color?: string;
}

function MacroBadge({
  label,
  value,
  unit = "г",
  color = "bg-panelHi border border-line text-subtle",
}: MacroBadgeProps) {
  if (value == null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs rounded-xl px-2 py-0.5",
        color || "bg-bg border border-line text-subtle",
      )}
    >
      <span className="font-semibold text-text">{Math.round(value)}</span>
      <span>{unit}</span>
      <span className="text-muted">{label}</span>
    </span>
  );
}

interface MealRowProps {
  meal: PlanMeal;
  onAddToLog: (meal: PlanMeal) => void | Promise<void>;
  onRegen: (mealType: string) => void | Promise<void>;
  busy?: boolean;
}

function MealRow({ meal, onAddToLog, onRegen, busy }: MealRowProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-2xl border border-line bg-bg/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-base leading-none" aria-hidden>
              {MEAL_TYPE_ICONS[String(meal.type ?? "")] || "🍴"}
            </span>
            <SectionHeading as="span" size="sm" variant="nutrition">
              {MEAL_TYPE_LABELS[String(meal.type ?? "")] || meal.label}
            </SectionHeading>
          </div>
          <div className="text-style-label text-text leading-tight">
            {meal.name}
          </div>
          {meal.description && (
            <div className="text-xs text-subtle mt-0.5 leading-snug">
              {meal.description}
            </div>
          )}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {meal.kcal != null && (
              <MacroBadge
                label="ккал"
                value={meal.kcal}
                unit=""
                color="bg-nutrition/10 border border-nutrition/20 text-nutrition-strong dark:text-nutrition"
              />
            )}
            <MacroBadge label="Б" value={meal.protein_g} />
            <MacroBadge label="Ж" value={meal.fat_g} />
            <MacroBadge label="В" value={meal.carbs_g} />
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0 items-end">
          <Button
            type="button"
            variant="ghost"
            className="h-8 text-xs px-2"
            onClick={() => onAddToLog(meal)}
            disabled={busy}
          >
            + Журнал
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="h-8 text-xs px-2 text-subtle"
            onClick={() => onRegen(String(meal.type ?? ""))}
            disabled={busy}
          >
            ↻ Замінити
          </Button>
        </div>
      </div>
      {(meal.ingredients?.length ?? 0) > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-nutrition-strong/90 dark:text-nutrition/70 hover:text-nutrition-strong dark:text-nutrition transition-colors"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "▲ Сховати інгредієнти" : "▼ Інгредієнти"}
        </button>
      )}
      {expanded && (meal.ingredients?.length ?? 0) > 0 && (
        <ul className="mt-1.5 text-xs text-text list-disc pl-4 space-y-0.5">
          {meal.ingredients!.map((ing: string, i: number) => (
            <li key={i}>{ing}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface DailyPlanCardProps {
  prefs: NutritionPrefs;
  setPrefs: Dispatch<SetStateAction<NutritionPrefs>>;
  pantryItems?: PantryItem[];
  busy?: boolean;
  dayPlan?: NutritionDayPlan | null;
  dayPlanBusy?: boolean;
  fetchDayPlan: () => void | Promise<void>;
  regenMeal: (mealType: string) => void | Promise<void>;
  addMealToLog: (meal: PlanMeal) => void | Promise<void>;
  weekPlan?: NutritionWeekPlan | null;
  weekPlanRaw?: string;
  weekPlanBusy?: boolean;
  fetchWeekPlan: () => void | Promise<void>;
  /**
   * When true, render a `<FirstRunHintBanner />` above the goal
   * inputs framing the kcal/Б/Ж/В row as the canonical «домівка»
   * for nutrition goals. Set on the user's first Nutrition entry by
   * `NutritionApp` via `useModuleFirstRun`.
   */
  firstRunHint?: boolean;
  /** Dismiss callback for the first-run hint banner. */
  onDismissFirstRunHint?: () => void;
}

export function DailyPlanCard({
  prefs,
  setPrefs,
  pantryItems,
  busy,
  dayPlan,
  dayPlanBusy,
  fetchDayPlan,
  regenMeal,
  addMealToLog,
  weekPlan,
  weekPlanRaw,
  weekPlanBusy,
  fetchWeekPlan,
  firstRunHint,
  onDismissFirstRunHint,
}: DailyPlanCardProps) {
  // UX-roast 2026-05 §3.3: користувач хотів, аби пресети «Схуднення /
  // Підтримка / Набір» не були первинним фокусом, а виглядали як
  // підказка, бо їх рідко обирають дослівно. Тепер дефолт — чотири
  // інпути (ккал/Б/Ж/В), а пресети сховані за випадайкою.
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const presetMenuRef = useRef<HTMLDivElement | null>(null);

  // «Розрахувати з профілю» — випадайка поруч з пресетами. Читає
  // hub-level біометрію (PR #1) і обраховує TDEE через Mifflin-St
  // Jeor (apps/web/src/modules/nutrition/lib/tdee.ts).
  const [tdeeMenuOpen, setTdeeMenuOpen] = useState(false);
  const tdeeMenuRef = useRef<HTMLDivElement | null>(null);
  const { biometrics } = useBiometrics();

  const tdeeTargets = useMemo<Record<
    NutritionGoalId,
    NutritionTargets
  > | null>(() => {
    const result: Partial<Record<NutritionGoalId, NutritionTargets>> = {};
    for (const goal of NUTRITION_GOALS) {
      const t = computeNutritionTargetsFromBiometrics(biometrics, goal);
      if (!t) return null;
      result[goal] = t;
    }
    return result as Record<NutritionGoalId, NutritionTargets>;
  }, [biometrics]);

  const activePreset = PRESETS.find(
    (p) =>
      p.kcal === prefs.dailyTargetKcal &&
      p.protein_g === prefs.dailyTargetProtein_g &&
      p.fat_g === prefs.dailyTargetFat_g &&
      p.carbs_g === prefs.dailyTargetCarbs_g,
  );

  const applyPreset = (preset: Preset) => {
    setPrefs((p) => ({
      ...p,
      dailyTargetKcal: preset.kcal,
      dailyTargetProtein_g: preset.protein_g,
      dailyTargetFat_g: preset.fat_g,
      dailyTargetCarbs_g: preset.carbs_g,
    }));
    setPresetMenuOpen(false);
  };

  const applyTdeeTargets = (targets: NutritionTargets) => {
    setPrefs((p) => ({
      ...p,
      dailyTargetKcal: targets.kcal,
      dailyTargetProtein_g: targets.protein_g,
      dailyTargetFat_g: targets.fat_g,
      dailyTargetCarbs_g: targets.carbs_g,
    }));
    setTdeeMenuOpen(false);
  };

  // Закривати випадайку пресетів по тапу/кліку поза нею. Користуємось
  // mousedown — щоб закриття відбулось до того, як саме поле забере
  // фокус (інакше виходить «миготіння» меню при тапі по інпуту).
  useEffect(() => {
    if (!presetMenuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = presetMenuRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      setPresetMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [presetMenuOpen]);

  // Аналогічний outside-click для «Розрахувати з профілю» — окремий
  // ref/state, щоб дві випадайки не «билися» одна з одною при відкриванні.
  useEffect(() => {
    if (!tdeeMenuOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const root = tdeeMenuRef.current;
      if (!root) return;
      const target = e.target as Node | null;
      if (target && root.contains(target)) return;
      setTdeeMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [tdeeMenuOpen]);

  const hasTargets = prefs.dailyTargetKcal != null;

  const sortedMeals: PlanMeal[] = dayPlan?.meals
    ? [...(dayPlan.meals as PlanMeal[])].sort(
        (a: PlanMeal, b: PlanMeal) =>
          MEAL_TYPE_ORDER.indexOf(String(a.type ?? "")) -
          MEAL_TYPE_ORDER.indexOf(String(b.type ?? "")),
      )
    : [];

  return (
    <Card className="p-4">
      <div className="text-style-label text-text">Денний план</div>
      <div className="text-xs text-subtle mt-0.5">
        AI генерує персоналізований план прийомів їжі з урахуванням твоїх цілей
        та продуктів зі складу.
      </div>

      <div className="mt-4 space-y-4">
        {firstRunHint && (
          <FirstRunHintBanner
            variant="nutrition"
            title="Це попередня ціль — потім сам поправиш"
            description="Постав ккал/Б/Ж/В нижче або обери пресет як підказку. Цілі живуть отут ж — повертайся на цю сторінку, коли захочеш змінити."
            onDismiss={onDismissFirstRunHint ?? (() => {})}
          />
        )}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="text-xs text-subtle">Цілі на день</div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end">
              <div ref={tdeeMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setTdeeMenuOpen((v) => !v)}
                  disabled={busy || dayPlanBusy}
                  aria-haspopup="menu"
                  aria-expanded={tdeeMenuOpen}
                  title={tdeeTargets ? undefined : TDEE_COPY.triggerHint}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold",
                    "border-nutrition/50 text-nutrition-strong dark:text-nutrition",
                    "hover:border-nutrition hover:bg-nutrition/10",
                    "disabled:opacity-50 transition-colors",
                  )}
                >
                  {TDEE_COPY.triggerLabel}
                  <span aria-hidden className="text-2xs">
                    ▾
                  </span>
                </button>
                {tdeeMenuOpen && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute right-0 top-full mt-1 z-10 min-w-[240px]",
                      "rounded-xl border border-line bg-bg shadow-lg overflow-hidden",
                    )}
                  >
                    {tdeeTargets ? (
                      NUTRITION_GOALS.map((goal) => {
                        const targets = tdeeTargets[goal];
                        return (
                          <button
                            key={goal}
                            type="button"
                            role="menuitem"
                            onClick={() => applyTdeeTargets(targets)}
                            disabled={busy || dayPlanBusy}
                            className={cn(
                              "w-full text-left px-3 py-2 border-b border-line last:border-0",
                              "hover:bg-panelHi disabled:opacity-50 transition-colors",
                            )}
                          >
                            <div className="text-style-label">
                              {TDEE_GOAL_LABELS[goal]}
                            </div>
                            <div className="text-2xs text-subtle mt-0.5">
                              {targets.kcal} ккал · Б{targets.protein_g} · Ж
                              {targets.fat_g} · В{targets.carbs_g}
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-3 py-2 text-xs text-subtle">
                        <div className="text-text">{TDEE_COPY.triggerHint}</div>
                        <a
                          href="#/profile"
                          className="mt-1 inline-block text-nutrition-strong dark:text-nutrition underline"
                          onClick={() => setTdeeMenuOpen(false)}
                        >
                          {TDEE_COPY.profileLink}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div ref={presetMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPresetMenuOpen((v) => !v)}
                  disabled={busy || dayPlanBusy}
                  aria-haspopup="menu"
                  aria-expanded={presetMenuOpen}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-xs font-semibold",
                    "border-line/70 text-subtle hover:text-text hover:border-nutrition/50",
                    "disabled:opacity-50 transition-colors",
                  )}
                >
                  {activePreset
                    ? `Пресет: ${activePreset.label}`
                    : "Підказати з пресету"}
                  <span aria-hidden className="text-2xs">
                    ▾
                  </span>
                </button>
                {presetMenuOpen && (
                  <div
                    role="menu"
                    className={cn(
                      "absolute right-0 top-full mt-1 z-10 min-w-[200px]",
                      "rounded-xl border border-line bg-bg shadow-lg overflow-hidden",
                    )}
                  >
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        role="menuitem"
                        onClick={() => applyPreset(preset)}
                        disabled={busy || dayPlanBusy}
                        className={cn(
                          "w-full text-left px-3 py-2 border-b border-line last:border-0",
                          "hover:bg-panelHi disabled:opacity-50 transition-colors",
                          activePreset?.id === preset.id &&
                            "bg-nutrition/10 text-nutrition-strong dark:text-nutrition",
                        )}
                      >
                        <div className="text-style-label">{preset.label}</div>
                        <div className="text-2xs text-subtle mt-0.5">
                          {preset.kcal} ккал · Б{preset.protein_g} · Ж
                          {preset.fat_g} · В{preset.carbs_g}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {(
              [
                {
                  key: "dailyTargetKcal",
                  label: "Ккал/день",
                  unit: "",
                  color: null,
                },
                {
                  key: "dailyTargetProtein_g",
                  label: "Білки",
                  unit: "г",
                  color: "text-blue-400",
                },
                {
                  key: "dailyTargetFat_g",
                  label: "Жири",
                  unit: "г",
                  color: "text-yellow-400",
                },
                {
                  key: "dailyTargetCarbs_g",
                  label: "Вуглеводи",
                  unit: "г",
                  color: "text-green-400",
                },
              ] as const
            ).map(({ key, label, unit, color }) => (
              <div key={key}>
                <div
                  className={cn(
                    "text-xs mb-1 font-semibold",
                    color ?? "text-subtle",
                  )}
                >
                  {label}
                  {unit && ` (${unit})`}
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={prefs[key] != null ? String(prefs[key]) : ""}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const v =
                      raw === "" ? null : Number(raw) > 0 ? Number(raw) : null;
                    setPrefs((p) => {
                      const next = { ...p, [key]: v };
                      // Авто-перерахунок Ккал лише коли користувач явно не
                      // задав ціль (kcal === null) або коли вона дорівнює
                      // попередньому авто-значенню. Інакше тиха перезапис
                      // з'їдала кастомні значення (M7 з аудиту).
                      if (key !== "dailyTargetKcal") {
                        const prevProt = p.dailyTargetProtein_g ?? 0;
                        const prevFat = p.dailyTargetFat_g ?? 0;
                        const prevCarb = p.dailyTargetCarbs_g ?? 0;
                        const prevCalc = Math.round(
                          prevProt * 4 + prevFat * 9 + prevCarb * 4,
                        );
                        const isAutoKcal =
                          p.dailyTargetKcal == null ||
                          p.dailyTargetKcal === prevCalc;
                        if (isAutoKcal) {
                          const prot =
                            key === "dailyTargetProtein_g" ? v : prevProt;
                          const fat = key === "dailyTargetFat_g" ? v : prevFat;
                          const carb =
                            key === "dailyTargetCarbs_g" ? v : prevCarb;
                          const calc = Math.round(
                            (prot || 0) * 4 + (fat || 0) * 9 + (carb || 0) * 4,
                          );
                          next.dailyTargetKcal = calc > 0 ? calc : null;
                        }
                      }
                      return next;
                    });
                  }}
                  placeholder="—"
                  disabled={busy || dayPlanBusy}
                />
              </div>
            ))}
          </div>

          <MacroRatioBar prefs={prefs} />

          <MissingMacrosHint prefs={prefs} setPrefs={setPrefs} busy={busy} />

          <MacroKcalWarning prefs={prefs} setPrefs={setPrefs} busy={busy} />

          {hasTargets && (
            <div className="mt-2 flex flex-wrap gap-1 items-center">
              {prefs.dailyTargetKcal != null && (
                <span className="text-xs bg-nutrition/10 text-nutrition-strong dark:text-nutrition border border-nutrition/20 rounded-xl px-2 py-0.5">
                  {prefs.dailyTargetKcal} ккал
                </span>
              )}
              {prefs.dailyTargetProtein_g != null && (
                <span className="text-xs bg-bg border border-line rounded-xl px-2 py-0.5 text-subtle">
                  Б: {prefs.dailyTargetProtein_g}г
                </span>
              )}
              {prefs.dailyTargetFat_g != null && (
                <span className="text-xs bg-bg border border-line rounded-xl px-2 py-0.5 text-subtle">
                  Ж: {prefs.dailyTargetFat_g}г
                </span>
              )}
              {prefs.dailyTargetCarbs_g != null && (
                <span className="text-xs bg-bg border border-line rounded-xl px-2 py-0.5 text-subtle">
                  В: {prefs.dailyTargetCarbs_g}г
                </span>
              )}
              <button
                type="button"
                className="text-xs text-muted hover:text-danger transition-colors px-1 ml-auto"
                onClick={() =>
                  setPrefs((p) => ({
                    ...p,
                    dailyTargetKcal: null,
                    dailyTargetProtein_g: null,
                    dailyTargetFat_g: null,
                    dailyTargetCarbs_g: null,
                  }))
                }
              >
                ✕ Скинути
              </button>
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <button
            type="button"
            onClick={fetchDayPlan}
            disabled={busy || dayPlanBusy}
            className={cn(
              "text-style-label w-full h-11 rounded-2xl",
              "bg-nutrition-strong text-white hover:bg-nutrition-hover disabled:opacity-50 transition-colors",
            )}
          >
            {dayPlanBusy ? "Генерую план…" : "Згенерувати денний план"}
          </button>
          {typeof fetchWeekPlan === "function" && (
            <button
              type="button"
              onClick={fetchWeekPlan}
              disabled={busy || weekPlanBusy}
              className={cn(
                "text-style-label w-full h-11 rounded-2xl border border-nutrition/40",
                "text-nutrition-strong dark:text-nutrition hover:bg-nutrition/10 disabled:opacity-50 transition-colors",
              )}
            >
              {weekPlanBusy ? "…" : "План на тиждень + покупки"}
            </button>
          )}
        </div>

        {pantryItems?.length === 0 && (
          <div className="text-xs text-subtle text-center -mt-2">
            Додай продукти на склад — AI врахує їх у плані
          </div>
        )}

        {(weekPlan?.days?.length ?? 0) > 0 && (
          <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
            <div className="text-style-label text-text">Тижневий план</div>
            {(weekPlan!.days as WeekPlanDay[]).map(
              (d: WeekPlanDay, i: number) => (
                <div
                  key={i}
                  className="text-sm border-b border-line/40 pb-2 last:border-0"
                >
                  <div className="font-semibold text-nutrition-strong dark:text-nutrition">
                    {d.label}
                  </div>
                  {d.note && (
                    <div className="text-xs text-subtle mt-0.5">{d.note}</div>
                  )}
                  {Array.isArray(d.meals) && d.meals.length > 0 && (
                    <ul className="list-disc pl-4 mt-1 text-xs text-text space-y-0.5">
                      {d.meals.map((line: string, j: number) => (
                        <li key={j}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
            {((weekPlan!.shoppingList as string[] | undefined)?.length ?? 0) >
              0 && (
              <div>
                <div className="text-xs text-subtle mb-1">Список покупок</div>
                <ul className="list-disc pl-4 text-sm text-text space-y-0.5">
                  {(weekPlan!.shoppingList as string[]).map(
                    (s: string, i: number) => (
                      <li key={i}>{s}</li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {weekPlanRaw && (!weekPlan?.days || weekPlan.days.length === 0) && (
          <details className="rounded-2xl border border-line bg-bg p-3">
            <summary className="cursor-pointer text-xs text-muted">
              Діагностика плану (raw)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-xs text-subtle max-h-48 overflow-auto">
              {weekPlanRaw}
            </pre>
          </details>
        )}

        {sortedMeals.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-style-label text-text">
                Ваш план на сьогодні
              </div>
              {dayPlan?.totalKcal != null && (
                <span className="text-xs text-subtle">
                  ~{Math.round(dayPlan.totalKcal)} ккал разом
                </span>
              )}
            </div>

            {dayPlan?.totalKcal != null && prefs.dailyTargetKcal != null && (
              <div className="rounded-xl bg-panel border border-line px-3 py-2">
                <div className="flex justify-between text-xs text-subtle mb-1">
                  <span>Прогрес до цілі</span>
                  <span>
                    {Math.round(dayPlan.totalKcal)} / {prefs.dailyTargetKcal}{" "}
                    ккал
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-line overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width,background-color]",
                      dayPlan.totalKcal > prefs.dailyTargetKcal * 1.1
                        ? "bg-danger"
                        : "bg-nutrition",
                    )}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(
                          (dayPlan.totalKcal / prefs.dailyTargetKcal) * 100,
                        ),
                      )}%`,
                    }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              {sortedMeals.map((meal, i) => (
                <MealRow
                  key={`${meal.type}_${i}`}
                  meal={meal}
                  onAddToLog={addMealToLog}
                  onRegen={regenMeal}
                  busy={busy || dayPlanBusy}
                />
              ))}
            </div>

            {dayPlan?.note && (
              <div className="rounded-xl bg-panel/60 border border-line px-3 py-2 text-xs text-subtle">
                {dayPlan.note}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
