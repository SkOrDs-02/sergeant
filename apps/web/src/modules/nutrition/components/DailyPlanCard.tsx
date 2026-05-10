import type { Dispatch, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { FirstRunHintBanner } from "../../../core/onboarding/FirstRunHintBanner";
import type { NutritionPrefs, PantryItem } from "@sergeant/nutrition-domain";
import type {
  NutritionDayPlan,
  NutritionWeekPlan,
} from "../hooks/useNutritionUiState";
import {
  GoalRangeWarning,
  MacroKcalWarning,
  MissingMacrosHint,
} from "./DailyPlanWarnings";
import { MacroRatioBar } from "./DailyPlanMacros";
import {
  DailyPlanMealRow,
  MEAL_TYPE_ORDER,
  type PlanMeal,
} from "./DailyPlanMealRow";
import { DailyPlanGoalSelectors } from "./DailyPlanGoalSelectors";

// Re-export pure validation helpers for tests / consumers that already
// imported them from the original (now slimmed) component module. The
// canonical home is `../lib/dailyPlanValidation.ts`.
export {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
} from "../lib/dailyPlanValidation";

interface WeekPlanDay {
  label?: string;
  note?: string;
  meals?: string[];
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
            <DailyPlanGoalSelectors
              prefs={prefs}
              setPrefs={setPrefs}
              busy={busy}
              dayPlanBusy={dayPlanBusy}
            />
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

          <GoalRangeWarning prefs={prefs} />

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
                <DailyPlanMealRow
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
