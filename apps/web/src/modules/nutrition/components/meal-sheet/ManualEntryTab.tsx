/**
 * ManualEntryTab — вкладка «Своє»: ручний ввід, де одиниця КБЖВ обирається
 * перемикачем, а не окремим маршрутом.
 *
 * AI-CONTEXT: вибір тут — це не «як вводити», а «які числа в мене на
 * руках», і від нього залежить ОДИНИЦЯ КБЖВ. «З упаковки» бере значення
 * з етикетки (завжди на 100 г) і масштабує їх під вагу порції; «Готова
 * страва» бере КБЖВ одразу за всю порцію й ваги не має взагалі. Доти це
 * була одна безпідписна кнопка «Ввести вручну», і люди вводили в неї
 * значення з етикетки — розбіжність нічим не ловилась. Не зливай режими
 * назад в один.
 *
 * Перемикач НЕ конвертує вже введені числа — він лише вирішує, який
 * ввід показати. Тиха конвертація була б рівно тим самим класом дефекту,
 * проти якого цей екран і переробляли.
 *
 * Поля режиму «з упаковки» рендерить справжній `PackageEntryStep` — той
 * самий компонент, що й на однойменному кроці. Дублювати його поля тут
 * означало б два місця з валідацією, стелею порції та `upsertFood`, які
 * розійшлись би з першою ж правкою.
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { cn } from "@shared/lib/ui/cn";
import type { PickedFood } from "./FoodPickerSection";
import { PackageEntryStep } from "./PackageEntryStep";

type Basis = "per100" | "portion";

const MODES: ReadonlyArray<{ id: Basis; title: string; hint: string }> = [
  { id: "per100", title: "З упаковки", hint: "на 100 г" },
  { id: "portion", title: "Готова страва", hint: "за всю порцію" },
];

interface ManualEntryTabProps {
  /** Продукт створено з етикетки — аркуш іде на «fill» із вагою порції. */
  onCreated: (product: PickedFood, grams: string) => void;
  /** Разовий запис: «fill» без продукту, КБЖВ за всю порцію. */
  onWholeMeal: () => void;
}

export function ManualEntryTab({
  onCreated,
  onWholeMeal,
}: ManualEntryTabProps) {
  const [basis, setBasis] = useState<Basis>("per100");

  return (
    <div className="space-y-3">
      {/* Одиниця — головне рішення цієї вкладки, тому стоїть НАД полями. */}
      <div>
        <SectionHeading as="div" size="xs" variant="nutrition" className="mb-1">
          Звідки числа
        </SectionHeading>
        <div
          role="radiogroup"
          aria-label="Одиниця КБЖВ"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-panelHi p-1"
        >
          {MODES.map((m) => {
            const isActive = basis === m.id;
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setBasis(m.id)}
                className={cn(
                  "min-h-[44px] rounded-xl px-3 py-2 text-left",
                  "transition-[background-color,color] focus-visible:outline-none",
                  "focus-visible:ring-2 focus-visible:ring-nutrition/60",
                  isActive
                    ? "bg-nutrition-strong text-white"
                    : "text-muted hover:text-text",
                )}
              >
                <span className="block text-style-label">{m.title}</span>
                <span
                  className={cn(
                    "block text-style-caption font-normal",
                    isActive ? "text-white/80" : "text-subtle",
                  )}
                >
                  {m.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {basis === "per100" ? (
        <PackageEntryStep onCreated={onCreated} />
      ) : (
        <>
          <p className="text-style-caption text-muted">
            Далі введеш назву й КБЖВ за всю порцію: так, як зʼїв. Вага тут не
            потрібна, а запис у пошук не потрапляє.
          </p>
          <Button
            type="button"
            variant="primary"
            module="nutrition"
            className="w-full min-h-[44px]"
            onClick={onWholeMeal}
          >
            Далі
          </Button>
        </>
      )}
    </div>
  );
}
