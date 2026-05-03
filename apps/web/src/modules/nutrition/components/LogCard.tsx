import { useEffect, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Virtuoso } from "react-virtuoso";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Badge } from "@shared/components/ui/Badge";
import { Input } from "@shared/components/ui/Input";
import { cn } from "@shared/lib/ui/cn";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { Icon } from "@shared/components/ui/Icon";
import { EmptyState } from "@shared/components/ui/EmptyState";
import {
  searchMealsByName,
  getMacrosForDateRange,
  estimateLogBytes,
  toLocalISODate,
} from "../lib/nutritionStorage";
import {
  addDaysISODate,
  type Meal,
  type MealTypeId,
  type NutritionLog,
} from "@sergeant/nutrition-domain";
import {
  MEAL_ORDER,
  MEAL_META,
  isMealTypeId,
  mealTypeFromLabel,
} from "../lib/mealTypes";
import {
  avgFromSummary,
  getRowsForRange,
  mealTypeBreakdown,
  summarizeRows,
  topMeals,
} from "../lib/nutritionStats";
import { getMealThumbnailBlob } from "../lib/mealPhotoStorage";

interface LogCardProps {
  log: NutritionLog;
  selectedDate: string;
  setSelectedDate: Dispatch<SetStateAction<string>>;
  onAddMeal?: () => void;
  onAddMealFromSearch?: (meal: Meal, date?: string) => void;
  onRemoveMeal?: (date: string, meal: Meal) => void;
  onEditMeal?: (date: string, meal: Meal) => void;
  onDuplicateYesterday?: () => void;
  onTrimLog?: (keepDays: number) => void;
}

function toISODate(d: Date): string {
  return toLocalISODate(d);
}

function formatDate(isoDate: string): string {
  const today = toISODate(new Date());
  const yesterday = addDaysISODate(today, -1);
  const tomorrow = addDaysISODate(today, 1);
  if (isoDate === today) return "Сьогодні";
  if (isoDate === yesterday) return "Вчора";
  if (isoDate === tomorrow) return "Завтра";
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

function groupByMealType(meals: Meal[]): Record<MealTypeId, Meal[]> {
  const groups: Partial<Record<MealTypeId, Meal[]>> = {};
  for (const meal of meals) {
    const mealType: MealTypeId = isMealTypeId(meal.mealType)
      ? meal.mealType
      : mealTypeFromLabel(meal.label);
    if (!groups[mealType]) groups[mealType] = [];
    groups[mealType]!.push(meal);
  }
  return groups as Record<MealTypeId, Meal[]>;
}

function MealThumb({ mealId }: { mealId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | undefined;
    (async () => {
      const b = await getMealThumbnailBlob(mealId);
      if (b) {
        u = URL.createObjectURL(b);
        setUrl(u);
      }
    })();
    return () => {
      if (u) URL.revokeObjectURL(u);
    };
  }, [mealId]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      decoding="async"
      width="40"
      height="40"
      className="w-10 h-10 rounded-xl object-cover shrink-0 border border-line"
    />
  );
}

export function LogCard({
  log,
  selectedDate,
  setSelectedDate,
  onAddMeal,
  onAddMealFromSearch,
  onRemoveMeal,
  onEditMeal,
  onDuplicateYesterday,
  onTrimLog,
}: LogCardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [duplicateConfirm, setDuplicateConfirm] = useState(false);
  const [trimConfirm, setTrimConfirm] = useState(false);
  const [statsRange, setStatsRange] = useState(30);
  const [weekOpen, setWeekOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const dayData = log[selectedDate];
  const meals = dayData?.meals || [];
  const groups = groupByMealType(meals);

  const searchHits = useMemo(() => {
    const q = debouncedSearchQuery.trim();
    if (!q) return [];
    return searchMealsByName(log, q).slice(0, 40);
  }, [log, debouncedSearchQuery]);

  const weekRows = useMemo(
    () => getMacrosForDateRange(log, selectedDate, 7),
    [log, selectedDate],
  );

  const statsRows = useMemo(
    () => getRowsForRange(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );
  const statsSummary = useMemo(() => summarizeRows(statsRows), [statsRows]);
  const statsAvg = useMemo(() => avgFromSummary(statsSummary), [statsSummary]);
  const statsTop = useMemo(
    () => topMeals(log, selectedDate, statsRange, 8),
    [log, selectedDate, statsRange],
  );
  const statsMealTypes = useMemo(
    () => mealTypeBreakdown(log, selectedDate, statsRange),
    [log, selectedDate, statsRange],
  );

  const logBytes = useMemo(() => estimateLogBytes(log), [log]);
  const logSizeWarn = logBytes > 350_000;

  function shiftDate(delta: number) {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const next = new Date(y, m - 1, d + delta);
    setSelectedDate(toISODate(next));
  }

  const previousDayIso = addDaysISODate(selectedDate, -1);
  const hasPreviousDayMeals = (log[previousDayIso]?.meals?.length || 0) > 0;

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => shiftDate(-1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Попередній день"
          >
            ‹
          </button>
          <div className="flex flex-col items-center gap-0.5">
            <span className="font-extrabold text-text text-base">
              {formatDate(selectedDate)}
            </span>
            <span className="text-xs text-subtle">{selectedDate}</span>
          </div>
          <button
            type="button"
            onClick={() => shiftDate(1)}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-panelHi text-muted hover:text-text transition-colors"
            aria-label="Наступний день"
          >
            ›
          </button>
        </div>

        {typeof onDuplicateYesterday === "function" && hasPreviousDayMeals && (
          <button
            type="button"
            onClick={() => setDuplicateConfirm(true)}
            className="w-full h-10 rounded-2xl border border-line bg-panel/40 px-3 text-xs font-semibold text-subtle hover:text-text hover:border-nutrition/50 transition-colors flex items-center justify-center gap-1.5"
          >
            Скопіювати з попереднього дня ({previousDayIso})
          </button>
        )}

        <Card
          variant="flat"
          radius="lg"
          padding="none"
          className="bg-panel/40 px-3 py-3 space-y-2"
        >
          <SectionHeading as="div" size="xs">
            Пошук по журналу
          </SectionHeading>
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Назва страви…"
            aria-label="Пошук по журналу"
          />
          {searchQuery.trim() && (
            <ul className="max-h-48 overflow-y-auto text-sm space-y-1">
              {searchHits.length === 0 && (
                <li className="text-muted text-xs">Нічого не знайдено</li>
              )}
              {searchHits.map(({ date, meal }) => {
                const mac = meal.macros || {
                  kcal: null,
                  protein_g: null,
                  fat_g: null,
                  carbs_g: null,
                };
                return (
                  <li
                    key={`${date}-${meal.id}`}
                    className="flex items-center gap-2 bg-panelHi rounded-xl px-2.5 py-2"
                  >
                    <button
                      type="button"
                      className="text-left min-w-0 flex-1"
                      onClick={() => {
                        setSelectedDate(date);
                        setSearchQuery("");
                      }}
                    >
                      <div className="text-xs font-semibold text-text truncate">
                        {meal.name}
                      </div>
                      <div className="flex gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-2xs text-subtle">{date}</span>
                        {mac.kcal != null && (
                          <span className="text-2xs text-nutrition-strong dark:text-nutrition font-bold">
                            {Math.round(mac.kcal)} ккал
                          </span>
                        )}
                        {mac.protein_g != null && (
                          <span className="text-2xs text-subtle">
                            Б{Math.round(mac.protein_g)}
                          </span>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-xl bg-nutrition/10 text-nutrition-strong dark:text-nutrition hover:bg-nutrition/20 transition-colors"
                      onClick={() => {
                        onAddMealFromSearch?.({
                          id: `meal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                          time: "",
                          name: meal.name,
                          mealType: meal.mealType,
                          label: meal.label,
                          macros: meal.macros
                            ? { ...meal.macros }
                            : {
                                kcal: null,
                                protein_g: null,
                                fat_g: null,
                                carbs_g: null,
                              },
                          source: "manual",
                          macroSource: "manual",
                          foodId: null,
                          amount_g: null,
                        });
                        setSearchQuery("");
                      }}
                      title="Додати до поточного дня"
                      aria-label={`Додати ${meal.name} до поточного дня`}
                    >
                      +
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {logSizeWarn && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            Журнал великий (~{Math.round(logBytes / 1024)} КБ).{" "}
            <button
              type="button"
              className="underline font-semibold"
              onClick={() => onTrimLog?.(365)}
            >
              Залишити лише останні 365 днів
            </button>
          </div>
        )}

        <SectionHeading
          as="button"
          size="xs"
          type="button"
          onClick={() => setWeekOpen((v) => !v)}
          className="flex items-center gap-2 w-full text-left py-1"
        >
          <Icon
            name="chevron-right"
            size={12}
            strokeWidth={2.5}
            className={cn(
              "transition-transform shrink-0",
              weekOpen ? "rotate-90" : "",
            )}
          />
          Журнал за тиждень
        </SectionHeading>

        {weekOpen && (
          <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="text-subtle">
                    <th className="py-1 pr-2">Дата</th>
                    <th className="py-1 pr-2">Ккал</th>
                    <th className="py-1 pr-2">Б</th>
                    <th className="py-1 pr-2">Ж</th>
                    <th className="py-1">В</th>
                  </tr>
                </thead>
                <tbody>
                  {weekRows.map((r) => (
                    <tr key={r.date} className="border-t border-line/40">
                      <td className="py-1 pr-2 font-mono text-2xs">
                        {r.date.slice(5)}
                      </td>
                      <td className="py-1 pr-2">{Math.round(r.kcal)}</td>
                      <td className="py-1 pr-2">{Math.round(r.protein_g)}</td>
                      <td className="py-1 pr-2">{Math.round(r.fat_g)}</td>
                      <td className="py-1">{Math.round(r.carbs_g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-line bg-panel/40 px-3 py-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <SectionHeading as="div" size="xs">
              Аналітика (тренди)
            </SectionHeading>
            <div className="flex gap-2">
              {[30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setStatsRange(d)}
                  className={cn(
                    "px-2 py-1 rounded-xl text-xs font-semibold border",
                    statsRange === d
                      ? "border-nutrition/60 text-nutrition-strong dark:text-nutrition bg-nutrition/10"
                      : "border-line text-subtle bg-panelHi",
                  )}
                >
                  {d} днів
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { key: "kcal", label: "Сер. ккал/день", v: statsAvg.kcal },
              { key: "protein_g", label: "Сер. Б/день", v: statsAvg.protein_g },
              { key: "fat_g", label: "Сер. Ж/день", v: statsAvg.fat_g },
              { key: "carbs_g", label: "Сер. В/день", v: statsAvg.carbs_g },
            ].map((x) => (
              <div key={x.key} className="bg-panelHi rounded-2xl px-2 py-3">
                <div className="text-2xs text-subtle">{x.label}</div>
                <div className="text-base font-extrabold text-text tabular-nums">
                  {Math.round(Number(x.v) || 0)}
                </div>
                <div className="text-2xs text-subtle">
                  на {statsAvg.denom} активн. днів
                </div>
              </div>
            ))}
          </div>

          <div className="bg-panelHi rounded-2xl px-3 py-3">
            <SectionHeading as="div" size="xs" className="mb-2">
              Калорії по днях (останні {Math.min(statsRange, statsRows.length)})
            </SectionHeading>
            {statsRows.length === 0 ? (
              // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
              <div className="text-xs text-muted">Поки що порожньо</div>
            ) : (
              (() => {
                const kcals = statsRows.map((r) => Number(r.kcal) || 0);
                const max = Math.max(1, ...kcals);
                return (
                  <div className="flex items-end gap-0.5 h-12">
                    {kcals.slice(-statsRange).map((k, i) => (
                      <div
                        key={i}
                        title={`${Math.round(k)} ккал`}
                        className="flex-1 rounded-sm bg-nutrition/60"
                        style={{
                          height: `${Math.max(2, Math.round((k / max) * 48))}px`,
                        }}
                      />
                    ))}
                  </div>
                );
              })()
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="bg-panelHi rounded-2xl px-3 py-3">
              <SectionHeading as="div" size="xs" className="mb-2">
                Топ страв
              </SectionHeading>
              {statsTop.length === 0 ? (
                // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
                <div className="text-xs text-muted">Поки що порожньо</div>
              ) : (
                <ol className="space-y-1">
                  {statsTop.map((x) => (
                    <li
                      key={x.name}
                      className="flex items-baseline justify-between gap-2"
                    >
                      <span className="text-xs text-text truncate">
                        {x.name}
                      </span>
                      <span className="text-xs text-subtle shrink-0">
                        {x.count}× · {Math.round(x.kcal)} ккал
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="bg-panelHi rounded-2xl px-3 py-3">
              <SectionHeading as="div" size="xs" className="mb-2">
                Розподіл прийомів
              </SectionHeading>
              {Object.keys(statsMealTypes).length === 0 ? (
                // eslint-disable-next-line sergeant-design/no-bare-empty-text -- pre-existing tech debt; tracked in docs/tech-debt/frontend.md
                <div className="text-xs text-muted">Поки що порожньо</div>
              ) : (
                <ul className="space-y-1">
                  {MEAL_ORDER.filter((t) => statsMealTypes[t]?.count > 0).map(
                    (t) => (
                      <li
                        key={t}
                        className="flex items-baseline justify-between gap-2"
                      >
                        <span className="text-xs text-text">
                          {MEAL_META[t]?.emoji} {MEAL_META[t]?.label || t}
                        </span>
                        <span className="text-xs text-subtle shrink-0">
                          {statsMealTypes[t].count}× ·{" "}
                          {Math.round(statsMealTypes[t].kcal)} ккал
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              )}
            </div>
          </div>
        </div>

        {meals.length === 0 ? (
          <EmptyState
            compact
            icon={
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 3h18v4H3zM5 7v14h14V7" />
                <path d="M9 11h6M9 15h6" />
              </svg>
            }
            title="Поки немає записів"
            description="Додайте перший прийом їжі, щоб почати вести журнал."
          />
        ) : (
          <VirtualMealList
            groups={groups}
            meals={meals}
            selectedDate={selectedDate}
            onRemoveMeal={onRemoveMeal}
            onEditMeal={onEditMeal}
          />
        )}

        <button
          type="button"
          onClick={onAddMeal}
          className="text-style-label w-full h-12 min-h-[44px] rounded-2xl border-2 border-dashed border-line text-muted hover:border-nutrition/60 hover:text-nutrition-strong dark:text-nutrition transition-[border-color,color,background-color]"
        >
          + Додати прийом їжі
        </button>
      </div>

      <ConfirmDialog
        open={duplicateConfirm}
        title="Скопіювати прийоми?"
        description="Скопіювати всі прийоми з попереднього дня в цей день?"
        confirmLabel="Скопіювати"
        danger={false}
        onConfirm={() => {
          setDuplicateConfirm(false);
          onDuplicateYesterday?.();
        }}
        onCancel={() => setDuplicateConfirm(false)}
      />

      <ConfirmDialog
        open={trimConfirm}
        title="Видалити стару історію?"
        description="Журнал буде обрізано до останніх 365 днів. Старіші прийоми та фото страв безповоротно видаляються."
        confirmLabel="Видалити"
        danger
        onConfirm={() => {
          setTrimConfirm(false);
          onTrimLog?.(365);
        }}
        onCancel={() => setTrimConfirm(false)}
      />
    </>
  );
}

const MEAL_ROW_HEIGHT = 68;
const MEAL_HEADER_HEIGHT = 32;
const MAX_MEAL_LIST_HEIGHT = MEAL_ROW_HEIGHT * 8;

interface VirtualMealListProps {
  groups: Record<MealTypeId, Meal[]>;
  meals: Meal[];
  selectedDate: string;
  onRemoveMeal?: (date: string, meal: Meal) => void;
  onEditMeal?: (date: string, meal: Meal) => void;
}

type MealListItem =
  | { kind: "header"; type: MealTypeId }
  | { kind: "meal"; type: MealTypeId; meal: Meal };

function VirtualMealList({
  groups,
  meals,
  selectedDate,
  onRemoveMeal,
  onEditMeal,
}: VirtualMealListProps) {
  const activeTypes = MEAL_ORDER.filter(
    (t: MealTypeId) => groups[t]?.length,
  ) as MealTypeId[];
  const flatItems = useMemo<MealListItem[]>(() => {
    const items: MealListItem[] = [];
    for (const type of activeTypes) {
      items.push({ kind: "header", type });
      for (const meal of groups[type]) {
        items.push({ kind: "meal", type, meal });
      }
    }
    return items;
  }, [groups, activeTypes]);

  const listHeight = Math.min(
    meals.length * MEAL_ROW_HEIGHT + activeTypes.length * MEAL_HEADER_HEIGHT,
    MAX_MEAL_LIST_HEIGHT,
  );

  return (
    <Virtuoso
      style={{ height: listHeight }}
      data={flatItems}
      itemContent={(_, item) => {
        if (item.kind === "header") {
          const meta = MEAL_META[item.type];
          return (
            <div className="flex items-center gap-2 pt-2 pb-1">
              <span className="text-base">{meta.emoji}</span>
              <SectionHeading as="span" size="sm">
                {meta.label}
              </SectionHeading>
            </div>
          );
        }
        return (
          <div className="mb-1.5">
            <SwipeToAction
              onSwipeLeft={() => onRemoveMeal?.(selectedDate, item.meal)}
              rightLabel="🗑 Видалити"
              rightColor="bg-danger"
            >
              <MealRow
                meal={item.meal}
                onEdit={
                  onEditMeal
                    ? () => onEditMeal(selectedDate, item.meal)
                    : undefined
                }
                onRemove={() => onRemoveMeal?.(selectedDate, item.meal)}
              />
            </SwipeToAction>
          </div>
        );
      }}
    />
  );
}

interface MealRowProps {
  meal: Meal;
  onRemove?: () => void;
  onEdit?: () => void;
}

function MealRow({ meal, onRemove, onEdit }: MealRowProps) {
  const mac = meal.macros ?? {
    kcal: null,
    protein_g: null,
    fat_g: null,
    carbs_g: null,
  };
  const macroSource = String(meal?.macroSource || "manual");
  const sourceLabel =
    macroSource === "photoAI"
      ? "AI"
      : macroSource === "recipeAI"
        ? "AI-рецепт"
        : macroSource === "productDb"
          ? "DB"
          : "";
  return (
    <div className="flex items-center gap-3 bg-panelHi rounded-2xl px-3 py-2.5 group">
      <MealThumb mealId={meal.id} />
      <button
        type="button"
        onClick={onEdit}
        disabled={!onEdit}
        className={cn(
          "flex flex-col flex-1 min-w-0 text-left",
          onEdit ? "cursor-pointer" : "cursor-default",
        )}
        aria-label={onEdit ? "Редагувати запис" : undefined}
      >
        <div className="flex items-baseline gap-2">
          <span className="text-style-label text-text truncate">
            {meal.name}
          </span>
          {meal.time && (
            <span className="text-xs text-subtle shrink-0">{meal.time}</span>
          )}
          {sourceLabel && (
            <Badge
              variant="neutral"
              tone="soft"
              size="xs"
              className="shrink-0 rounded-full uppercase tracking-wider"
              title="Походження КБЖВ"
            >
              {sourceLabel}
            </Badge>
          )}
        </div>
        <div className="flex gap-2 mt-0.5 flex-wrap">
          {mac.kcal != null && (
            <span className="text-xs text-nutrition-strong dark:text-nutrition font-bold">
              {Math.round(mac.kcal)} ккал
            </span>
          )}
          {mac.protein_g != null && (
            <span className="text-xs text-subtle">
              Б {Math.round(mac.protein_g)}г
            </span>
          )}
          {mac.fat_g != null && (
            <span className="text-xs text-subtle">
              Ж {Math.round(mac.fat_g)}г
            </span>
          )}
          {mac.carbs_g != null && (
            <span className="text-xs text-subtle">
              В {Math.round(mac.carbs_g)}г
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="w-8 h-8 flex items-center justify-center rounded-full text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        aria-label="Видалити запис"
      >
        ✕
      </button>
    </div>
  );
}
