/**
 * Last validated: 2026-08-07
 * Status: Active
 */
import { Card } from "@shared/components/ui/Card";
import type { Meal, MealTypeId } from "@sergeant/nutrition-domain";
import { DayStrip } from "./DayStrip";
import { VirtualMealList } from "./VirtualMealList";

interface DayLogSheetProps {
  meals: Meal[];
  groups: Record<MealTypeId, Meal[]>;
  selectedDate: string;
  onRemoveMeal?: ((date: string, meal: Meal) => void) | undefined;
  onEditMeal?: ((date: string, meal: Meal) => void) | undefined;
}

/**
 * Аркуш одного дня в журналі їжі — смуга доби плюс прийоми, і НІЧОГО
 * більше.
 *
 * AI-CONTEXT (П3 «край і зріз», 2026-08-07): цей файл існує саме тому, що
 * краю не було куди дати. Тест «чи існує ця річ у житті як аркуш» лог їжі
 * проходив ще 2026-08-07, але в розмітці не було вузла, який був би РІВНО
 * записом дня: `LogCard` тримав в одному `flex-col` і запис, і органи
 * керування ним — перемикач дати, пошук, «скопіювати з попереднього дня»,
 * попередження про розмір журналу, «+ Додати прийом їжі». Обгорнути це
 * краєм означало б обвести перфорацією навігатор і кнопку додавання —
 * рівно те, за що край зняли з hero Рутини.
 *
 * Тому робота полягала не в додаванні класу, а у **виділенні вузла**:
 * аркуш — це `DayStrip` + список прийомів; решта лишилась робочою
 * поверхнею навколо нього. Це відповідь на правило, яке той самий розбір
 * і сформулював: перш ніж питати «чи це аркуш», спитай «чи є вузол, який
 * є ЛИШЕ цим», і якщо ні — виділи його.
 *
 * `stub`, а не пара `rule`/`perf`: пара стверджує СУМІЖНІСТЬ у стосі, а
 * тут аркуш один і навколо нього `gap-4`. Той самий вибір, що в
 * `WeeklyDigestCard` і `RecentWorkoutsSection`.
 *
 * Порожнього стану тут немає навмисно — і це не спрощення. Порожній стан
 * повідомляє про ВІДСУТНІСТЬ запису, паперового аналога в нього немає
 * (те саме рішення зняло `surface="document"` з `EmptyState`). Немає
 * прийомів — немає й сторінки в щоденнику, тож гілку тримає викликач.
 */
export function DayLogSheet({
  meals,
  groups,
  selectedDate,
  onRemoveMeal,
  onEditMeal,
}: DayLogSheetProps) {
  return (
    <Card
      as="section"
      edge="stub"
      padding="none"
      aria-label={`Записи за ${selectedDate}`}
    >
      <div className="p-4 flex flex-col gap-3">
        {/*
          Смуга стоїть НАД журналом, а не замість нього (анти-слоп П1,
          рішення власника 2026-08-06 на `signature-views.html`). Той самий
          вибір, що гребінь над списком підписок: у смузі нема чого
          натиснути — редагувати, видалити, змінити час можна лише в рядку.
          Замінити список смугою означало б поміняти одну втрату
          інформації на іншу.

          Компонент сам вирішує, чи показуватись: нижче двох прийомів
          повертає `null`. Порога тут навмисно немає — інакше правило
          мовчання жило б у двох місцях.
        */}
        <DayStrip meals={meals} />

        <VirtualMealList
          groups={groups}
          meals={meals}
          selectedDate={selectedDate}
          onRemoveMeal={onRemoveMeal}
          onEditMeal={onEditMeal}
        />
      </div>
    </Card>
  );
}
