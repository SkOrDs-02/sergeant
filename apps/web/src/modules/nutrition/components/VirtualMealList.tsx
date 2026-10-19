/**
 * Last validated: 2026-07-20
 * Status: Active
 */
import { useMemo } from "react";
import { Button } from "@shared/components/ui/Button";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { VirtualList } from "@shared/components/ui/VirtualList";
import { type Meal, type MealTypeId } from "@sergeant/nutrition-domain";
import { MEAL_ORDER, MEAL_META } from "../lib/mealTypes";
import { Icon } from "@shared/components/ui/Icon";
import { formatNumberUk } from "@sergeant/shared";
import { MealRow } from "./MealRow";

const MEAL_ROW_HEIGHT = 60;
const MEAL_HEADER_HEIGHT = 44;
const MAX_MEAL_LIST_HEIGHT = MEAL_ROW_HEIGHT * 8;

interface VirtualMealListProps {
  groups: Record<MealTypeId, Meal[]>;
  meals: Meal[];
  selectedDate: string;
  onRemoveMeal?: ((date: string, meal: Meal) => void) | undefined;
  onEditMeal?: ((date: string, meal: Meal) => void) | undefined;
  onCopyMeals?: ((type: MealTypeId) => void) | undefined;
}

type MealListItem =
  | { kind: "header"; type: MealTypeId }
  | { kind: "meal"; type: MealTypeId; meal: Meal };

export function VirtualMealList({
  groups,
  meals,
  selectedDate,
  onRemoveMeal,
  onEditMeal,
  onCopyMeals,
}: VirtualMealListProps) {
  const activeTypes = useMemo(
    () =>
      MEAL_ORDER.filter((t: MealTypeId) => groups[t]?.length) as MealTypeId[],
    [groups],
  );
  const flatItems = useMemo<MealListItem[]>(() => {
    const items: MealListItem[] = [];
    for (const type of activeTypes) {
      items.push({ kind: "header", type });
      for (const meal of groups[type] ?? []) {
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
    <VirtualList
      items={flatItems}
      height={listHeight}
      estimateSize={(index) =>
        flatItems[index]?.kind === "header"
          ? MEAL_HEADER_HEIGHT
          : MEAL_ROW_HEIGHT
      }
      getItemKey={(_index, item) =>
        item.kind === "header" ? `h-${item.type}` : item.meal.id
      }
    >
      {(item) => {
        if (item.kind === "header") {
          const meta = MEAL_META[item.type];
          const groupKcal = (groups[item.type] ?? []).reduce(
            (sum, m) => sum + (m.macros?.kcal ?? 0),
            0,
          );
          return (
            <div className="flex items-center gap-2 pt-3 pb-1">
              <span className="text-style-body font-bold text-text">
                {meta.label}
              </span>
              <span className="ml-auto text-style-label font-semibold text-text tabular-nums">
                {formatNumberUk(Math.round(groupKcal))} ккал
              </span>
              {onCopyMeals && (
                <Button
                  variant="ghost"
                  size="xs"
                  iconOnly
                  onClick={() => onCopyMeals(item.type)}
                  aria-label={`Скопіювати прийом: ${meta.label}`}
                  className="text-muted hover:text-text"
                >
                  <Icon name="more-horizontal" size="sm" aria-hidden />
                </Button>
              )}
            </div>
          );
        }
        return (
          <div className="border-t border-line">
            <SwipeToAction
              onSwipeLeft={() => onRemoveMeal?.(selectedDate, item.meal)}
              rightLabel={
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="trash" size={18} aria-hidden />
                  Видалити
                </span>
              }
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
    </VirtualList>
  );
}
