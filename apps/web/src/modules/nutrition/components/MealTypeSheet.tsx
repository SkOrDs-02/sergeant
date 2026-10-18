/**
 * Last validated: 2026-09-15
 * Status: Active
 *
 * Аркуш ОДНОГО прийому дня — «що в мене у вечері».
 *
 * AI-CONTEXT (рішення власника 2026-09-15). Тап по сегменту hero-стрічки
 * (`MealStrip`) доти відкривав форму додавання з уже обраним типом. Сегмент
 * при цьому НЕСЕ факт («Вечеря, 520 ккал»), тож природне продовження тапу —
 * розгорнути цей факт, а не почати новий запис: число на сегменті вже є
 * підсумком, і єдине, чого про нього не видно, — з чого воно склалось.
 *
 * **Кнопки «Додати» тут навмисно НЕМАЄ.** Вхід «щось нове» у модулі один —
 * FAB, і другий такий самий вхід тут був би рівно тим дублем, який модуль
 * уже прибирав двічі (CTA «Аналіз фото» на «Огляді», кнопка «Редагувати
 * КБЖВ вручну» в `MacrosEditor`). Порожній прийом сюди й не доходить:
 * показувати нічого, тож `NutritionApp` для нього лишає стару поведінку —
 * відкриває форму з обраним типом. З того ж боку закритий і другий шлях у
 * порожній аркуш: видалення ОСТАННЬОГО рядка закриває його разом із собою
 * (`NutritionOverlays`), інакше людина лишалась би в глухому куті.
 *
 * Рядки ті самі, що й у журналі (`MealRow` + `SwipeToAction`), бо це та сама
 * річ під іншим зрізом: тап по рядку веде в редагування, свайп ліворуч
 * видаляє. Списку тут не більше десятка рядків (один прийом одного дня),
 * тож віртуалізація `VirtualMealList` не потрібна — і не варта фіксованої
 * висоти контейнера, яку вона вимагає всередині аркуша.
 */
import { Measure } from "@shared/components/ui/Measure";
import { Sheet } from "@shared/components/ui/Sheet";
import { SwipeToAction } from "@shared/components/ui/SwipeToAction";
import { clampNonNegative, pluralUa } from "@sergeant/shared";
import type { Meal, MealTypeId } from "@sergeant/nutrition-domain";
import { messages } from "@shared/i18n/uk";
import { MEAL_META } from "../lib/mealTypes";
import { MealRow } from "./MealRow";

interface MealTypeSheetProps {
  /** `null` — аркуш закритий; тип прийому тут же і є ознакою відкриття. */
  mealType: MealTypeId | null;
  /** Записи ЦЬОГО прийому за `date`, у порядку журналу. */
  meals: Meal[];
  /** День, до якого належать записи — потрібен обробникам журналу. */
  date: string;
  onClose: () => void;
  onEditMeal: (date: string, meal: Meal) => void;
  onRemoveMeal: (date: string, meal: Meal) => void;
}

export function MealTypeSheet({
  mealType,
  meals,
  date,
  onClose,
  onEditMeal,
  onRemoveMeal,
}: MealTypeSheetProps) {
  if (!mealType) return null;

  const copy = messages.nutrition.mealTypeSheet;
  const meta = MEAL_META[mealType];
  const kcal = meals.reduce(
    (sum, m) => sum + clampNonNegative(m?.macros?.kcal),
    0,
  );

  return (
    <Sheet
      open
      onClose={onClose}
      title={meta.label}
      description={
        <span className="inline-flex items-center gap-1 tabular-nums">
          {meals.length}{" "}
          {pluralUa(meals.length, {
            one: copy.entriesOne,
            few: copy.entriesFew,
            many: copy.entriesMany,
          })}
          <span aria-hidden>·</span>
          <Measure value={Math.round(kcal)} unit={copy.kcalUnit} />
        </span>
      }
    >
      <ul className="divide-y divide-line">
        {meals.map((meal) => (
          <li key={meal.id}>
            <SwipeToAction
              onSwipeLeft={() => onRemoveMeal(date, meal)}
              rightLabel={<span>{copy.remove}</span>}
              rightColor="bg-danger"
            >
              <MealRow
                meal={meal}
                onEdit={() => onEditMeal(date, meal)}
                onRemove={() => onRemoveMeal(date, meal)}
              />
            </SwipeToAction>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
