/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { Measure } from "@shared/components/ui/Measure";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { messages } from "@shared/i18n/uk";
import {
  kcalFromMacros,
  type NutritionPrefs,
  type PantryItem,
} from "@sergeant/nutrition-domain";
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
import { WeekPlanButton } from "./WeekPlanButton";
import {
  DailyPlanMealRow,
  MEAL_TYPE_ORDER,
  type PlanMeal,
} from "./DailyPlanMealRow";
import { DailyPlanGoalSelectors } from "./DailyPlanGoalSelectors";
import { PantryModeSelect } from "./PantryModeSelect";
import { describePlanFreshness } from "../lib/planFreshness";

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
  /** Dismiss callback for the first-run hint banner. */
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
    <Card as="section" padding="md">
      <SectionHeading as="div" size="lg">
        Денний план
      </SectionHeading>
      <div className="text-style-caption text-muted mt-0.5">
        {pantryIgnored
          ? messages.nutrition.dayPlanIntro.pantryIgnored
          : messages.nutrition.dayPlanIntro.withPantry}
      </div>

      <div className="mt-5 space-y-7">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionHeading as="div" size="md">
              Цілі на день
            </SectionHeading>
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
                { key: "dailyTargetKcal", label: "Ккал/день", unit: "" },
                { key: "dailyTargetProtein_g", label: "Білки", unit: "г" },
                { key: "dailyTargetFat_g", label: "Жири", unit: "г" },
                { key: "dailyTargetCarbs_g", label: "Вуглеводи", unit: "г" },
              ] as const
            ).map(({ key, label, unit }) => (
              <div key={key}>
                {/* Підпис стоїть НАД інпутом навмисно: правило «підпис під
                    числом» діє для чисел, які читають, а не для полів, які
                    заповнюють. Усі чотири підписи нейтральні: колір макро
                    живе лише в даних (мова H). */}
                <div className="mb-1 text-style-label text-muted">
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
                      const next = {
                        ...p,
                        [key]: v,
                        adaptiveGoalEnabled: false,
                      };
                      // Авто-перерахунок Ккал лише коли користувач явно не
                      // задав ціль (kcal === null) або коли вона дорівнює
                      // попередньому авто-значенню. Інакше тиха перезапис
                      // зʼїдала кастомні значення (M7 з аудиту).
                      if (key !== "dailyTargetKcal") {
                        const prevProt = p.dailyTargetProtein_g ?? 0;
                        const prevFat = p.dailyTargetFat_g ?? 0;
                        const prevCarb = p.dailyTargetCarbs_g ?? 0;
                        const prevCalc = Math.round(
                          kcalFromMacros({
                            protein_g: prevProt,
                            fat_g: prevFat,
                            carbs_g: prevCarb,
                          }),
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
                            kcalFromMacros({
                              protein_g: prot,
                              fat_g: fat,
                              carbs_g: carb,
                            }),
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

          {!prefs.adaptiveGoalEnabled && (
            <p className="text-style-caption text-muted">
              Автокалібрування вмикається в Налаштуваннях → Їжа.
            </p>
          )}

          {hasTargets && (
            <div className="flex flex-wrap items-baseline gap-x-2 text-style-label text-text tabular-nums">
              {prefs.dailyTargetKcal != null && (
                <span className="font-semibold">
                  <Measure
                    value={prefs.dailyTargetKcal}
                    unit="ккал"
                    tone="inherit"
                  />
                </span>
              )}
              {prefs.dailyTargetProtein_g != null && (
                <span className="text-muted">
                  Б: <Measure value={prefs.dailyTargetProtein_g} unit="г" />
                </span>
              )}
              {prefs.dailyTargetFat_g != null && (
                <span className="text-muted">
                  Ж: <Measure value={prefs.dailyTargetFat_g} unit="г" />
                </span>
              )}
              {prefs.dailyTargetCarbs_g != null && (
                <span className="text-muted">
                  В: <Measure value={prefs.dailyTargetCarbs_g} unit="г" />
                </span>
              )}
              <button
                type="button"
                className="touch-target ml-auto rounded-lg px-1 text-style-label font-semibold text-muted hover:text-text focus-ring"
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
          <Button
            type="button"
            variant="solid"
            className="w-full"
            onClick={fetchDayPlan}
            disabled={busy || dayPlanBusy}
          >
            {dayPlanBusy ? "Генерую план…" : "Згенерувати денний план"}
          </Button>
          {typeof fetchWeekPlan === "function" && (
            <WeekPlanButton
              onClick={fetchWeekPlan}
              disabled={busy || weekPlanBusy}
              busy={weekPlanBusy}
            />
          )}
          {pantryItems?.length === 0 && !pantryIgnored && (
            <div className="text-style-body text-muted text-center">
              Додай продукти в комору, і план їх врахує
            </div>
          )}
        </div>

        {weekPlanDays.length > 0 && (
          <div>
            <SectionHeading as="div" size="md">
              Тижневий план
            </SectionHeading>
            <div className="mt-2 divide-y divide-line border-t border-line">
              {weekPlanDays.map((d: WeekPlanDay, i: number) => (
                <div
                  key={i}
                  /* AI-DANGER: `text-sm` — це кегль КОНТЕЙНЕРА, від якого
                     успадковують діти. `text-style-label` замість нього
                     підняв би вагу до 500 на всьому блоці, включно з
                     нотатками, які мають лишатись звичайними. Заміняти
                     можна тільки разом із перебором дітей. */
                  className="py-2.5 text-sm"
                >
                  <div className="font-semibold text-text">{d.label}</div>
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
          </div>
        )}

        {/* AI-DANGER: сира відповідь моделі — DEV-ONLY.
                Це діагностика для розробника: неформатований текст від
                LLM, який у продакшн-UI не пояснює людині нічого, зате
                показує їй внутрішню кухню (знахідка PR-N8, аудит
                2026-09-13). `import.meta.env.DEV` статично `false` у
                прод-збірці, тож Vite вирізає гілку цілком — це той самий
                гейт, що в `StandaloneRoutes` для внутрішнього стайлгайду.
                Повертаєш це людям — роби через прапорець і у вигляді,
                який можна прочитати, а не `<pre>{raw}</pre>`. */}
        {import.meta.env.DEV &&
          weekPlanRaw &&
          (!weekPlan?.days || weekPlan.days.length === 0) && (
            <details className="rounded-panel border border-line p-3">
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
            <SectionHeading
              as="div"
              size="lg"
              {...(dayPlan?.totalKcal != null && {
                action: (
                  <span className="text-style-label text-muted tabular-nums">
                    ~
                    <Measure
                      value={Math.round(dayPlan.totalKcal)}
                      unit="ккал"
                    />{" "}
                    разом
                  </span>
                ),
              })}
            >
              {freshness.stale ? "Твій план" : "Твій план на сьогодні"}
            </SectionHeading>
            {freshness.label && (
              <div className="-mt-2 text-style-caption text-muted">
                {freshness.label}
              </div>
            )}

            {dayPlan?.totalKcal != null && prefs.dailyTargetKcal != null && (
              <div>
                <div className="mb-1 flex justify-between text-style-caption text-muted">
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
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-line">
                  <div
                    className={
                      dayPlan.totalKcal > prefs.dailyTargetKcal * 1.1
                        ? "h-full rounded-[3px] bg-danger transition-[width,background-color]"
                        : "h-full rounded-[3px] bg-chart-nutrition transition-[width,background-color]"
                    }
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

            <div className="divide-y divide-line border-y border-line">
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
              <p className="text-style-caption text-muted">{dayPlan.note}</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
