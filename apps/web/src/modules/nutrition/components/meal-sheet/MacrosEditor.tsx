/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useRef, useState } from "react";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import type { PickedFood } from "./FoodPickerSection";
import {
  emptyForm,
  type MealFormPhotoResult,
  type MealFormState,
} from "./mealFormUtils";

type MacroFieldKey = "kcal" | "protein_g" | "fat_g" | "carbs_g";

/** Один список для розмітки полів і для перевірки «чи є хоч одне число». */
const MACRO_FIELDS = [
  { key: "kcal", label: "Ккал", placeholder: "350" },
  { key: "protein_g", label: "Білки г", placeholder: "12" },
  { key: "fat_g", label: "Жири г", placeholder: "6" },
  { key: "carbs_g", label: "Вуглев. г", placeholder: "60" },
] as const satisfies readonly {
  key: MacroFieldKey;
  label: string;
  placeholder: string;
}[];

interface PendingUnlink {
  key: MacroFieldKey | null;
  value: string | null;
}

interface MacrosEditorProps {
  form: MealFormState;
  field: (key: keyof MealFormState) => (value: string) => void;
  setForm: Dispatch<SetStateAction<MealFormState>>;
  pickedFood: PickedFood | null;
  setPickedFood: Dispatch<SetStateAction<PickedFood | null>>;
  pickedGrams: string;
  photoResult?: MealFormPhotoResult | null | undefined;
  hasPhotoMacros: boolean;
}

export function MacrosEditor({
  form,
  field,
  setForm,
  pickedFood,
  setPickedFood,
  pickedGrams,
  photoResult,
  hasPhotoMacros,
}: MacrosEditorProps) {
  // Guarded edit: when a food is linked from the DB, direct macro edits
  // used to silently drop the `foodId`. Now the first edit opens a
  // confirmation panel and the user must explicitly unlink before editing.
  const [pendingUnlink, setPendingUnlink] = useState<PendingUnlink | null>(
    null,
  );

  const handleMacroChange =
    (key: MacroFieldKey) => (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      // Гард однаковий для всіх чотирьох полів. Раніше ккал його обходили
      // («routinely overridden manually»), і це виглядало зручністю, поки
      // правка лишалась на екрані. Насправді вона не доживала до запису:
      // `PickedFoodCard` перераховує ВСІ чотири поля з картки продукту на
      // кожну зміну ваги (`PickedFoodCard.tsx:96-107`), тож набране вручну
      // число тихо затиралось наступним рухом колеса. Асиметрія була не
      // косметичною — вона втрачала дані.
      const isLinked = Boolean(pickedFood) && Number(pickedGrams) > 0;
      if (isLinked) {
        setPendingUnlink({ key, value: v });
        return;
      }
      field(key)(v);
    };

  const confirmUnlink = () => {
    if (!pendingUnlink) return;
    const { key, value } = pendingUnlink;
    setPickedFood(null);
    if (key && value !== null) field(key)(value);
    setPendingUnlink(null);
  };

  const cancelUnlink = () => setPendingUnlink(null);

  // role="alertdialog" inline panel: move focus into the warning when it
  // opens, let Escape cancel, and restore focus on close. Non-modal
  // (no backdrop), so no inertBackground / aria-modal.
  const isLinked = Boolean(pickedFood) && Number(pickedGrams) > 0;
  const hasAnyMacro = MACRO_FIELDS.some(({ key }) => form[key] !== "");

  const unlinkPanelRef = useRef<HTMLDivElement | null>(null);
  useDialogFocusTrap(Boolean(pendingUnlink), unlinkPanelRef, {
    onEscape: cancelUnlink,
  });

  return (
    <div className="mb-1">
      {hasPhotoMacros && (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() =>
              setForm((s) => ({
                ...s,
                ...emptyForm(photoResult),
                mealType: s.mealType,
                time: s.time,
                name: s.name,
                err: "",
              }))
            }
            className="inline-flex items-center gap-1 text-style-caption text-nutrition-strong dark:text-nutrition font-semibold hover:underline"
          >
            <Icon name="chevron-left" size="sm" />З результату фото
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {MACRO_FIELDS.map(({ key, label, placeholder }) => (
          <div key={key}>
            <SectionHeading
              as="div"
              size="xs"
              variant="nutrition"
              className="mb-1"
            >
              {label}
            </SectionHeading>
            <Input
              value={form[key]}
              onChange={handleMacroChange(key)}
              inputMode="decimal"
              placeholder={placeholder}
              maxLength={8}
              showCharCount={false}
              aria-label={label}
            />
          </div>
        ))}
      </div>
      {/*
        Афорданс тут один — самі поля. Кнопка «Редагувати КБЖВ вручну» вела
        в ТОЙ САМИЙ `pendingUnlink`, що й правка будь-якого поля, і була
        видима рівно в тому стані, де поля вже відкривають ту саму панель
        підтвердження. Лишилась вона з часів, коли гард мала тільки вона;
        поля гард отримали, а старий вхід не прибрали.
      */}
      {/* AI-NOTE: `text-style-caption` тут навмисний — це підказка під
          контролом, документований виняток правила `no-sentence-in-caption`
          (`docs/design/design/density-hierarchy-spec.md` §4). Підняти до
          `text-style-body` означало б зробити пояснення важчим за самі
          поля, які воно пояснює. */}
      {isLinked && !pendingUnlink && (
        <p className="mt-2 text-style-caption text-subtle leading-relaxed">
          Рахується з картки продукту на 100 г і масштабується під вагу. Зміни
          будь-яке поле, і значення зафіксуються для цього запису.
        </p>
      )}
      {/*
        Позначка ручних значень. Без неї два різні стани виглядають
        однаково: числа з картки продукту (живі, їдуть за вагою) і числа,
        набрані руками (мертві). Друге — підсумок ПОРЦІЇ, не етикетка на
        100 г; режим етикетки лишається окремим входом («маю етикетку»).
      */}
      {/* AI-NOTE: той самий виняток, що й у підказці вище — позначка стану
          під полями, не текст для читання. */}
      {!pickedFood && hasAnyMacro && (
        <p className="mt-2 text-style-caption text-subtle leading-relaxed">
          <span className="text-text font-medium">Вручну</span>: підсумок
          порції. Значення зафіксовані для цього запису й не масштабуються під
          вагу.
        </p>
      )}
      {pendingUnlink && (
        <div
          ref={unlinkPanelRef}
          role="alertdialog"
          aria-label="Підтвердити ручне редагування КБЖВ"
          className="mt-3 rounded-2xl border border-warning/40 bg-warning/10 p-3 text-xs text-text space-y-2"
        >
          <p className="font-semibold">
            Редагувати КБЖВ для «{pickedFood?.name || "продукт"}» вручну?
          </p>
          <p className="text-muted">
            Значення стануть підсумком порції: зафіксуються для цього запису й
            більше не масштабуватимуться під вагу чи картку продукту.
          </p>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={cancelUnlink}
            >
              Скасувати
            </Button>
            <Button
              type="button"
              variant="primary"
              module="nutrition"
              size="sm"
              className="flex-1"
              onClick={confirmUnlink}
            >
              Редагувати вручну
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
