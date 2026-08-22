/**
 * ManualEntryChooser — вибір ручного режиму на кроці «source».
 *
 * AI-CONTEXT: дві кнопки, а не одна, бо вибір тут — це не «як вводити», а
 * «які числа в мене на руках», і від нього залежить ОДИНИЦЯ КБЖВ:
 * «з упаковки» бере значення з етикетки (завжди на 100 г) і масштабує їх
 * під вагу порції, «готова страва» бере КБЖВ одразу за всю порцію й ваги
 * не має взагалі. Доти це була одна безпідписна кнопка «Ввести вручну»,
 * і люди вводили в неї значення з етикетки — розбіжність нічим не
 * ловилась. Не зливай назад в одну кнопку.
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import { Button } from "@shared/components/ui/Button";

interface ManualEntryChooserProps {
  /** Крок «package»: назва + КБЖВ на 100 г + вага порції. */
  onPackage: () => void;
  /** Крок «fill» без продукту: КБЖВ за всю порцію. */
  onWholeMeal: () => void;
}

export function ManualEntryChooser({
  onPackage,
  onWholeMeal,
}: ManualEntryChooserProps) {
  return (
    <>
      <div className="mt-5 flex items-center gap-3 text-style-caption text-muted">
        <span className="flex-1 h-px bg-line" />
        або ввести вручну
        <span className="flex-1 h-px bg-line" />
      </div>
      <div className="mt-3 grid gap-2">
        <Button
          type="button"
          variant="secondary"
          className="w-full min-h-[44px] flex-col items-start gap-0.5 py-3 text-left"
          onClick={onPackage}
        >
          <span className="text-style-label text-text">З упаковки</span>
          <span className="text-style-caption text-muted font-normal">
            КБЖВ на 100 г з етикетки + скільки з’їв
          </span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full min-h-[44px] flex-col items-start gap-0.5 py-3 text-left"
          onClick={onWholeMeal}
        >
          <span className="text-style-label text-text">Готова страва</span>
          <span className="text-style-caption text-muted font-normal">
            КБЖВ одразу за всю порцію
          </span>
        </Button>
      </div>
    </>
  );
}
