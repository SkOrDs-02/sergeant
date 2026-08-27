/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Measure } from "@shared/components/ui/Measure";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
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
import { PantryModeSelect } from "./PantryModeSelect";

// Re-export pure validation helpers for tests / consumers that already
// imported them from the original (now slimmed) component module. The
// canonical home is `../lib/dailyPlanValidation.ts`.
export {
  calcGoalRangeIssues,
  calcMacroKcalMismatch,
} from "../lib/dailyPlanValidation";
import { describePlanFreshness } from "../lib/planFreshness";

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
  /** Unix ms генерації — підпис свіжості. `null` = мітки немає. */
  dayPlanSavedAt?: number | null;
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
  dayPlanSavedAt,
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
  const weekPlanDays = Array.isArray(weekPlan?.days)
    ? (weekPlan.days as WeekPlanDay[])
    : [];

  // План навмисно не протухає (`planStorage.ts`), тож заголовок мусить
  // перестати обіцяти «сьогодні», щойно доба змінилась. Без цього єдина
  // помітна користувачеві неправда — саме цей рядок.
  const freshness = describePlanFreshness(dayPlanSavedAt);

  // Копія мусить відповідати режиму комори: обіцяти «з урахуванням продуктів
  // з комори», коли користувач обрав «не враховувати», — це та сама неправда,
  // що й ігнорувати сам вибір.
  const pantryIgnored = prefs.recipePantryMode === "ignore";

  return (
    <Card className="p-4">
      <div className="text-style-label text-text">Денний план</div>
      <div className="text-style-caption text-muted mt-0.5">
        {pantryIgnored
          ? messages.nutrition.dayPlanIntro.pantryIgnored
          : messages.nutrition.dayPlanIntro.withPantry}
      </div>

      <div className="mt-4 space-y-4">
        {firstRunHint && (
          <FirstRunHintBanner
            variant="nutrition"
            title="Це попередня ціль, потім сам поправиш"
            description="Постав ккал/Б/Ж/В нижче або обери пресет як підказку. Цілі живуть отут ж, повертайся на цю сторінку, коли захочеш змінити."
            onDismiss={onDismissFirstRunHint ?? (() => {})}
          />
        )}
        <div>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="text-style-caption text-muted">Цілі на день</div>
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
                  color: "text-info-strong dark:text-info",
                },
                {
                  key: "dailyTargetFat_g",
                  label: "Жири",
                  unit: "г",
                  color: "text-warning-strong dark:text-warning",
                },
                {
                  key: "dailyTargetCarbs_g",
                  label: "Вуглеводи",
                  unit: "г",
                  color: "text-success-strong dark:text-success",
                },
              ] as const
            ).map(({ key, label, unit, color }) => (
              <div key={key}>
                {/* AI-CONTEXT: тут стояв AI-DANGER «не міняти `text-xs` на
                    роль», і спирався він на побоювання, що поруч із
                    `font-semibold` два правила ваги на одному вузлі й
                    невідомо, яке виграє. Побоювання зняте заміром у
                    зібраному CSS (записаний у `tailwind-preset.js`): ролі
                    реєструються через `addUtilities`, тобто мають ту саму
                    специфічність, що й core-утиліти, і виграє той, що нижче
                    у файлі — `.font-semibold` (офсет 180546) стоїть нижче за
                    `.text-style-caption` (177815). Отже роль ПРОГРАЄ явній
                    вазі передбачувано, а не «як пощастить», і мітка лишається
                    напівжирною.

                    Що лишилось чинним із того коментаря: мітка стоїть НАД
                    інпутом навмисно — правило «підпис під числом» діє для
                    чисел, які читають, а не для полів, які заповнюють.

                    AI-DANGER: замір привʼязаний до порядку утиліт у білді.
                    Переміряй, перш ніж спиратись на нього деінде. */}
                <div
                  className={cn(
                    "text-style-caption mb-1 font-semibold",
                    color ?? "text-muted",
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
                      // зʼїдала кастомні значення (M7 з аудиту).
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
                  aria-label={unit ? `${label} (${unit})` : label}
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
                <span className="text-style-caption bg-nutrition/10 text-nutrition-strong dark:text-nutrition border border-nutrition/20 rounded-xl px-2 py-0.5">
                  <Measure
                    value={prefs.dailyTargetKcal}
                    unit="ккал"
                    tone="inherit"
                  />
                </span>
              )}
              {prefs.dailyTargetProtein_g != null && (
                <span className="text-style-caption bg-bg border border-line rounded-xl px-2 py-0.5 text-muted">
                  Б: <Measure value={prefs.dailyTargetProtein_g} unit="г" />
                </span>
              )}
              {prefs.dailyTargetFat_g != null && (
                <span className="text-style-caption bg-bg border border-line rounded-xl px-2 py-0.5 text-muted">
                  Ж: <Measure value={prefs.dailyTargetFat_g} unit="г" />
                </span>
              )}
              {prefs.dailyTargetCarbs_g != null && (
                <span className="text-style-caption bg-bg border border-line rounded-xl px-2 py-0.5 text-muted">
                  В: <Measure value={prefs.dailyTargetCarbs_g} unit="г" />
                </span>
              )}
              <button
                type="button"
                className="text-style-caption text-muted hover:text-danger transition-colors px-1 ml-auto"
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
                Скинути
              </button>
            </div>
          )}
        </div>

        <PantryModeSelect
          prefs={prefs}
          setPrefs={setPrefs}
          disabled={busy || dayPlanBusy || weekPlanBusy}
        />

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
              {weekPlanBusy ? "…" : "План на тиждень"}
            </button>
          )}
        </div>

        {pantryItems?.length === 0 && !pantryIgnored && (
          <div className="text-style-caption text-muted text-center -mt-2">
            Додай продукти в комору, AI врахує їх у плані
          </div>
        )}

        {weekPlanDays.length > 0 && (
          <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
            <div className="text-style-label text-text">Тижневий план</div>
            {weekPlanDays.map((d: WeekPlanDay, i: number) => (
              <div
                key={i}
                /* AI-DANGER: `text-sm` — це кегль КОНТЕЙНЕРА, від якого
                   успадковують діти. `text-style-label` замість нього підняв
                   би вагу до 500 на всьому блоці, включно з нотатками, які
                   мають лишатись звичайними. Заміняти можна тільки разом із
                   перебором дітей. */
                className="text-sm border-b border-line/40 pb-2 last:border-0"
              >
                <div className="font-semibold text-nutrition-strong dark:text-nutrition">
                  {d.label}
                </div>
                {d.note && (
                  <div className="text-style-caption text-muted mt-0.5">
                    {d.note}
                  </div>
                )}
                {Array.isArray(d.meals) && d.meals.length > 0 && (
                  <ul className="list-disc pl-4 mt-1 text-style-caption text-text space-y-0.5">
                    {d.meals.map((line: string, j: number) => (
                      <li key={j}>{line}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}

        {weekPlanRaw && (!weekPlan?.days || weekPlan.days.length === 0) && (
          <details className="rounded-2xl border border-line bg-bg p-3">
            <summary className="cursor-pointer text-style-caption text-muted">
              Діагностика плану (raw)
            </summary>
            <pre className="mt-2 whitespace-pre-wrap text-style-caption text-muted max-h-48 overflow-auto">
              {weekPlanRaw}
            </pre>
          </details>
        )}

        {sortedMeals.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-style-label text-text">
                  {freshness.stale ? "Твій план" : "Твій план на сьогодні"}
                </div>
                {freshness.label && (
                  <div className="text-style-caption text-muted">
                    {freshness.label}
                  </div>
                )}
              </div>
              {dayPlan?.totalKcal != null && (
                <span className="text-style-caption text-muted">
                  ~<Measure value={Math.round(dayPlan.totalKcal)} unit="ккал" />{" "}
                  разом
                </span>
              )}
            </div>

            {dayPlan?.totalKcal != null && prefs.dailyTargetKcal != null && (
              <div className="rounded-xl bg-panel border border-line px-3 py-2">
                <div className="flex justify-between text-style-caption text-muted mb-1">
                  <span>Прогрес до цілі</span>
                  {/* Одиниця стоїть один раз на пару чисел — перше йде з
                      порожнім `unit`, але з тими самими `tabular-nums`,
                      інакше чисельник і знаменник читаються різними
                      системами. Той самий прийом, що в `Money` для
                      «сплачено 1 000 з 5 000 ₴». */}
                  <span>
                    <Measure value={Math.round(dayPlan.totalKcal)} unit="" /> /{" "}
                    <Measure value={prefs.dailyTargetKcal} unit="ккал" />
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
              <div className="rounded-xl bg-panel/60 border border-line px-3 py-2 text-style-caption text-muted">
                {dayPlan.note}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
