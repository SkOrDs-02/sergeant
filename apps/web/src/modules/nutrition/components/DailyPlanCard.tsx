import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { chartHex } from "@sergeant/design-tokens/tokens";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Card } from "@shared/components/ui/Card";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import type {
  MealTypeId,
  NutritionPrefs,
  PantryItem,
} from "@sergeant/nutrition-domain";
import type {
  NutritionDayPlan,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";

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
}: DailyPlanCardProps) {
  const [showManual, setShowManual] = useState(false);

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
  };

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
        <div>
          <div className="text-xs text-subtle mb-2">Пресет або ручні цілі</div>
          <div className="flex gap-2 flex-wrap">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                disabled={busy || dayPlanBusy}
                className={cn(
                  "flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                  activePreset?.id === preset.id
                    ? "bg-nutrition-strong text-white border-nutrition"
                    : "border-line text-text hover:border-nutrition/50 hover:bg-nutrition/5",
                )}
              >
                <div>{preset.label}</div>
                <div className="text-2xs opacity-70 mt-0.5">
                  ~{preset.kcal} ккал
                </div>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setShowManual((v) => !v)}
              disabled={busy || dayPlanBusy}
              className={cn(
                "flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-semibold border transition-[background-color,border-color,color,opacity]",
                showManual && !activePreset
                  ? "bg-panel border-nutrition text-text"
                  : "border-line text-subtle hover:border-nutrition/50 hover:text-text",
              )}
            >
              Свої цілі
            </button>
          </div>

          {showManual && (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
                        raw === ""
                          ? null
                          : Number(raw) > 0
                            ? Number(raw)
                            : null;
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
                            const fat =
                              key === "dailyTargetFat_g" ? v : prevFat;
                            const carb =
                              key === "dailyTargetCarbs_g" ? v : prevCarb;
                            const calc = Math.round(
                              (prot || 0) * 4 +
                                (fat || 0) * 9 +
                                (carb || 0) * 4,
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
          )}

          <MacroRatioBar prefs={prefs} />

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
