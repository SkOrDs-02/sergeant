/**
 * Last validated: 2026-06-15
 * Status: Active
 */
import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { TimeField } from "@shared/components/ui/TimeField";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseMealSpeech } from "@sergeant/shared";
import { NAME_MAX_LEN } from "@shared/lib/text/limits";
import {
  currentTime,
  macroToFieldString,
  type MealFormState,
} from "./mealFormUtils";

interface NameTimeRowProps {
  form: MealFormState;
  field: (key: keyof MealFormState) => (value: string) => void;
  setForm: Dispatch<SetStateAction<MealFormState>>;
}

export function NameTimeRow({ form, field, setForm }: NameTimeRowProps) {
  // 95%+ of the time the user logs a meal «right now». Showing the time
  // input on every open forces an extra tap past the picker in the
  // default case — parallels the «Не сьогодні? Змінити дату» collapse
  // in `ManualExpenseSheet`. Reveal the field only when the time differs
  // from «now» (editing an older meal) or the user explicitly expands it.
  const [showTime, setShowTime] = useState(false);
  const isNow = form.time === currentTime();
  const timeVisible = showTime || !isNow;

  const handleVoiceMeal = useCallback(
    (transcript: string) => {
      const parsed = parseMealSpeech(transcript);
      if (!parsed) return;
      // Порція йде В НАЗВУ, і це єдине чесне місце для неї тут.
      //
      // `parseMealSpeech` повертає `grams`, підказка Whisper у сусідньому
      // рядку прямо вчить їх називати — а `MealFormState` поля для них не
      // має і мати не мусить: це РУЧНИЙ запис, де ккал і білок абсолютні
      // для всієї страви, а не на 100 г. Масштабувати грамами тут нічого
      // (на відміну від товарних шляхів — `PackageEntryStep`,
      // `PickedFoodCard`, — де грами множать склад на 100 г).
      //
      // Доти число просто зникало: людина казала «гречка двісті грам», і
      // порція не лишалась ніде. Назва «Гречка 200 г» — рівно те, що
      // сказали, і рівно те, що людина написала б рукою.
      const portionSuffix =
        parsed.grams != null ? ` ${Math.round(parsed.grams)} г` : "";
      const spokenName = parsed.name ? `${parsed.name}${portionSuffix}` : "";
      setForm((s) => ({
        ...s,
        name: spokenName || s.name,
        kcal: parsed.kcal != null ? macroToFieldString(parsed.kcal) : s.kcal,
        protein_g:
          parsed.protein != null
            ? macroToFieldString(parsed.protein)
            : s.protein_g,
        err: "",
      }));
    },
    [setForm],
  );

  return (
    <div className="mb-4">
      <div
        className={
          timeVisible
            ? // Обидва треки явні: `1fr` без `minmax(0,…)` має floor
              // min-content, а `auto` під поле часу брав ширину з контента —
              // рівно два канали, якими нативний контрол розпирає рядок.
              "grid grid-cols-[minmax(0,1fr)_7rem] gap-3"
            : "grid grid-cols-1 gap-3"
        }
      >
        <div>
          <SectionHeading
            as="div"
            size="xs"
            variant="nutrition"
            className="mb-1 flex items-center gap-2"
          >
            Назва страви
            <VoiceMicButton
              module="nutrition"
              size="sm"
              onResult={handleVoiceMeal}
              onError={(e) => setForm((s) => ({ ...s, err: e }))}
              label="Голосовий ввід страви"
              promptHint="Прийом їжі: гречка 200 грам 180 ккал, овочевий салат 150 г 45 калорій, омлет 250 грам 30 г білка."
            />
          </SectionHeading>
          <Input
            value={form.name}
            onChange={(e) => field("name")(e.target.value)}
            placeholder="Вівсянка з бананом"
            maxLength={NAME_MAX_LEN}
            showCharCount={false}
            aria-label="Назва страви"
          />
        </div>
        {timeVisible && (
          <div>
            <SectionHeading
              as="div"
              size="xs"
              variant="nutrition"
              className="mb-1"
            >
              Час
            </SectionHeading>
            {/* Спільний примітив, а не `Input type="time"` з фіксованим
                `w-[100px]`: фіксована ширина задає БАЖАНУ, не мінімальну, і
                нативний контрол зі своїм intrinsic inline-size все одно
                розпирав `auto`-трек грида. `TimeField` форсує
                `inline-size: 100%` від треку, а трек тепер заданий явно
                (див. `grid-cols` вище) і внеску контента не має взагалі.
                Рецепт: docs/start/instructions/fix-mobile-horizontal-overflow.md */}
            <TimeField
              value={form.time}
              onChange={(e) => field("time")(e.target.value)}
              aria-label="Час"
            />
          </div>
        )}
      </div>
      {!timeVisible && (
        <button
          type="button"
          onClick={() => setShowTime(true)}
          className="mt-2 text-style-caption text-muted hover:text-text underline decoration-dotted underline-offset-2 transition-colors"
        >
          Не зараз? Змінити час ({form.time})
        </button>
      )}
    </div>
  );
}
