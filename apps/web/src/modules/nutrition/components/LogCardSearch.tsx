/**
 * Last validated: 2026-05-14
 * Status: Active
 */
/* eslint-disable sergeant-design/no-cyrillic-jsx-literal -- pre-existing i18n tech debt; strings moved from LogCard.tsx during T3 decomposition */
import { useEffect, useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Measure } from "@shared/components/ui/Measure";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { searchMealsByName } from "../lib/nutritionStorage";
import type { Meal, NutritionLog } from "@sergeant/nutrition-domain";

interface LogCardSearchProps {
  log: NutritionLog;
  setSelectedDate: (date: string) => void;
  onAddMealFromSearch?: ((meal: Meal, date?: string) => void) | undefined;
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
    <section className="space-y-2">
      <SectionHeading as="h2" size="lg">
        Пошук по журналу
      </SectionHeading>
      <Input
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Назва страви"
        aria-label="Пошук по журналу"
        // Без `type="search"`, тож автоматичний guard з `Input` сюди не
        // дістає — спред обовʼязковий. Розбір, чому Chrome інакше пропонує
        // тут збережений пароль, — у `searchFieldProps.ts`.
        {...searchFieldProps("nutrition-log-search")}
      />
      {searchQuery.trim() && (
        <ul className="max-h-48 overflow-y-auto divide-y divide-line">
          {searchHits.length === 0 && (
            <li className="py-2 text-muted text-style-label">
              Нічого не знайшов
            </li>
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
                className="flex items-center gap-2 py-2"
              >
                <button
                  type="button"
                  className="text-left min-w-0 flex-1 rounded-lg focus-ring"
                  onClick={() => {
                    setSelectedDate(date);
                    setSearchQuery("");
                  }}
                >
                  <div className="text-style-body font-semibold text-text truncate">
                    {meal.name}
                  </div>
                  <div className="flex gap-1.5 mt-0.5 flex-wrap text-style-caption text-muted">
                    <span className="tabular-nums">{date}</span>
                    {mac.kcal != null && (
                      <Measure
                        value={Math.round(mac.kcal)}
                        unit="ккал"
                        tone="inherit"
                        className="text-style-caption text-text font-semibold"
                      />
                    )}
                    {mac.protein_g != null && (
                      <span>
                        {/* Одиниця тут раніше була відсутня зовсім (`Б24`),
                            тоді як сусідній `MealRow` набирав `Б 24г`, а
                            `FoodHitRow` — `Б 24г` із пробілом після літери.
                            Той самий факт трьома наборами — рівно те, проти
                            чого П4. */}
                        Б <Measure value={Math.round(mac.protein_g)} unit="г" />
                      </span>
                    )}
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 h-9 px-3 pointer-coarse:min-h-[44px] inline-flex items-center justify-center rounded-[7px] border border-line text-style-label font-semibold text-text hover:bg-line/40 focus-ring"
                  onClick={() => {
                    // AI-DANGER: походження запису НЕ переписуємо.
                    //
                    // Тут стояло жорстке `source: "manual", macroSource:
                    // "manual", foodId: null, amount_g: null` — тобто копія
                    // запису з фото (`source: "photo"`) або з бази продуктів
                    // (`macroSource: "productDb"`) ставала «ручною», а
                    // звʼязок із продуктом рвався.
                    // `searchMealsByName` віддає СПРАВЖНІ записи журналу з
                    // їхнім походженням; копіювати їх і брехати про джерело
                    // означає псувати і статистику по джерелах, і всю
                    // математику, що спирається на `foodId`/`amount_g`
                    // (комора, поповнення Сільпо). Знахідка PR-N1, аудит
                    // 2026-09-13.
                    //
                    // `id` тут не генеруємо: сторінка все одно видає свій
                    // (`NutritionLogPage`), і два генератори на один запис
                    // читались як два різні id.
                    onAddMealFromSearch?.({
                      ...meal,
                      time: "",
                      macros: meal.macros
                        ? { ...meal.macros }
                        : {
                            kcal: null,
                            protein_g: null,
                            fat_g: null,
                            carbs_g: null,
                          },
                    });
                    setSearchQuery("");
                  }}
                  title="Додати до поточного дня"
                  aria-label={`Додати ${meal.name} до поточного дня`}
                >
                  Додати
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
