/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useEffect, useMemo, useState } from "react";
import { Card } from "@shared/components/ui/Card";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { searchMealsByName } from "../lib/nutritionStorage";
import type { Meal, NutritionLog } from "@sergeant/nutrition-domain";

interface LogCardSearchProps {
  log: NutritionLog;
  setSelectedDate: (date: string) => void;
  onAddMealFromSearch?: (meal: Meal, date?: string) => void;
}

export function LogCardSearch({
  log,
  setSelectedDate,
  onAddMealFromSearch,
}: LogCardSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearchQuery(searchQuery), 150);
    return () => clearTimeout(id);
  }, [searchQuery]);

  const searchHits = useMemo(() => {
    const q = debouncedSearchQuery.trim();
    if (!q) return [];
    return searchMealsByName(log, q).slice(0, 40);
  }, [log, debouncedSearchQuery]);

  return (
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
  );
}
