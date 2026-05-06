import { useMemo } from "react";
import { Virtuoso } from "react-virtuoso";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { type Meal, type MealTypeId } from "@sergeant/nutrition-domain";
import { MEAL_ORDER, MEAL_META } from "../lib/mealTypes";
import { MealRow } from "./MealRow";

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

export function VirtualMealList({
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
