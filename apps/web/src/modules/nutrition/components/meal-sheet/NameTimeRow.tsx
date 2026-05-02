import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { VoiceMicButton } from "@shared/components/ui/VoiceMicButton";
import { parseMealSpeech } from "@sergeant/shared";
import { currentTime, type MealFormState } from "./mealFormUtils";

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
      setForm((s) => ({
        ...s,
        name: parsed.name || s.name,
        kcal: parsed.kcal != null ? String(Math.round(parsed.kcal)) : s.kcal,
        protein_g:
          parsed.protein != null
            ? String(Math.round(parsed.protein))
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
            ? "grid grid-cols-[1fr_auto] gap-3"
            : "grid grid-cols-1 gap-3"
        }
      >
        <div>
          <SectionHeading
            as="div"
            size="xs"
            className="mb-1 flex items-center gap-2"
          >
            Назва страви
            <VoiceMicButton
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
            aria-label="Назва страви"
          />
        </div>
        {timeVisible && (
          <div>
            <SectionHeading as="div" size="xs" className="mb-1">
              Час
            </SectionHeading>
            <Input
              type="time"
              value={form.time}
              onChange={(e) => field("time")(e.target.value)}
              aria-label="Час"
              className="w-[100px]"
            />
          </div>
        )}
      </div>
      {!timeVisible && (
        <button
          type="button"
          onClick={() => setShowTime(true)}
          className="mt-2 text-xs text-muted hover:text-text underline decoration-dotted underline-offset-2 transition-colors"
        >
          Не зараз? Змінити час ({form.time})
        </button>
      )}
    </div>
  );
}
