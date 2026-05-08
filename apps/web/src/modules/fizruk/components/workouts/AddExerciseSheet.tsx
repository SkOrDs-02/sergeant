import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import { useVisualKeyboardInset } from "@sergeant/shared";

const EQUIPMENT_OPTIONS = [
  { id: "bodyweight", label: "Власна вага" },
  { id: "barbell", label: "Штанга" },
  { id: "dumbbell", label: "Гантелі" },
  { id: "kettlebell", label: "Гиря" },
  { id: "cable", label: "Блок/трос" },
  { id: "machine", label: "Тренажер" },
  { id: "band", label: "Еспандер/резинка" },
  { id: "bench", label: "Лава" },
  { id: "other", label: "Інше" },
];

export type AddExerciseForm = {
  nameUk: string;
  primaryGroup: string;
  musclesPrimary: string[];
  musclesSecondary: string[];
  equipment: string[];
  description: string;
};

type AddExerciseSheetProps = {
  open: boolean;
  onClose: () => void;
  form: AddExerciseForm;
  setForm: Dispatch<SetStateAction<AddExerciseForm>>;
  primaryGroupsUk: Record<string, string>;
  musclesUk: Record<string, string>;
  musclesByPrimaryGroup: Record<string, string[]>;
  addExercise: (ex: FizrukData.RawExerciseDef) => void;
};

function slugify(s: string | null | undefined): string {
  return (s || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toggleArr(arr: string[] | undefined, value: string): string[] {
  const a = Array.isArray(arr) ? arr : [];
  return a.includes(value) ? a.filter((x) => x !== value) : [...a, value];
}

export function AddExerciseSheet({
  open,
  onClose,
  form,
  setForm,
  primaryGroupsUk,
  musclesUk,
  musclesByPrimaryGroup,
  addExercise,
}: AddExerciseSheetProps) {
  const kbInsetPx = useVisualKeyboardInset(open);
  // Inline validation message shown below «Назва (укр)» when the user
  // taps «Зберегти» with the field empty. Without it the click was
  // silently swallowed (just `if (!nameUk) return;`) and the user was
  // left wondering whether the button was broken — see screenshot in
  // dmytro.s.stakhov's PR feedback.
  const [nameError, setNameError] = useState<string | null>(null);

  const suggestedMuscles = useMemo(() => {
    const g = form.primaryGroup;
    const ids = musclesByPrimaryGroup?.[g] || [];
    return ids.filter((id) => musclesUk?.[id]);
  }, [form.primaryGroup, musclesByPrimaryGroup, musclesUk]);

  const handleClose = () => {
    setNameError(null);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      title="Додати вправу"
      description="Збережеться локально на цьому пристрої"
      closeLabel="Закрити форму"
      kbInsetPx={kbInsetPx}
      panelClassName="fizruk-sheet"
      zIndex={100}
    >
      <div className="space-y-3">
        <div>
          <Input
            placeholder="Назва (укр) *"
            value={form.nameUk}
            onChange={(e) => {
              setForm((f) => ({ ...f, nameUk: e.target.value }));
              if (nameError) setNameError(null);
            }}
            aria-label="Назва вправи українською"
            aria-invalid={nameError ? "true" : undefined}
            aria-describedby={nameError ? "add-exercise-name-error" : undefined}
            className={cn(
              nameError && "border-danger/70 focus-visible:border-danger/70",
            )}
          />
          {nameError && (
            <p
              id="add-exercise-name-error"
              role="alert"
              className="text-style-caption mt-1.5 text-danger"
            >
              {nameError}
            </p>
          )}
        </div>

        <label className="block">
          <SectionHeading as="div" size="xs" className="mb-1.5">
            Основна група
          </SectionHeading>
          <select
            className="input-focus-fizruk w-full min-h-[44px] rounded-2xl border border-line bg-panelHi px-3 py-2 text-sm text-text"
            value={form.primaryGroup}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                primaryGroup: e.target.value,
                musclesPrimary: [],
                musclesSecondary: [],
              }))
            }
            aria-label="Основна група м'язів"
          >
            {Object.keys(primaryGroupsUk).map((id) => (
              <option key={id} value={id}>
                {primaryGroupsUk[id]}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-line bg-panelHi px-3 py-2">
          <SectionHeading as="div" size="xs">
            Обладнання
          </SectionHeading>
          <div className="py-2 flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((o) => {
              const active = (form.equipment || []).includes(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      equipment: toggleArr(f.equipment, o.id),
                    }))
                  }
                  className={cn(
                    "text-xs px-3 py-2.5 min-h-[44px] rounded-full border transition-colors",
                    active
                      ? "bg-text text-bg border-text"
                      : "border-line bg-bg text-muted hover:border-muted hover:text-text",
                  )}
                  aria-pressed={active}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panelHi px-3 py-2">
          <SectionHeading as="div" size="xs">
            Основні мʼязи
          </SectionHeading>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestedMuscles.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "text-xs px-3 py-2 min-h-[44px] rounded-full border transition-colors",
                  (form.musclesPrimary || []).includes(id)
                    ? "bg-primary border-primary text-bg"
                    : "border-line bg-bg text-muted hover:border-muted hover:text-text",
                )}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    musclesPrimary: toggleArr(f.musclesPrimary, id),
                  }))
                }
              >
                {musclesUk[id] || id}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-panelHi px-3 py-2">
          <SectionHeading as="div" size="xs">
            Супутні мʼязи
          </SectionHeading>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {suggestedMuscles.map((id) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "text-xs px-3 py-2 min-h-[44px] rounded-full border transition-colors",
                  (form.musclesSecondary || []).includes(id)
                    ? "bg-text/80 border-text/80 text-white"
                    : "border-line bg-bg text-muted hover:border-muted hover:text-text",
                )}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    musclesSecondary: toggleArr(f.musclesSecondary, id),
                  }))
                }
              >
                {musclesUk[id] || id}
              </button>
            ))}
          </div>
        </div>

        <Input
          placeholder="Опис"
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Button
          className="h-12 min-h-[44px]"
          onClick={() => {
            const nameUk = (form.nameUk || "").trim();
            if (!nameUk) {
              setNameError(
                "Вкажи назву українською — без неї вправу не збережемо.",
              );
              return;
            }
            const id = `custom_${slugify(nameUk) || Date.now()}`;
            addExercise({
              id,
              name: { uk: nameUk, en: nameUk },
              primaryGroup: form.primaryGroup,
              primaryGroupUk:
                primaryGroupsUk[form.primaryGroup] || form.primaryGroup,
              muscles: {
                primary: form.musclesPrimary || [],
                secondary: form.musclesSecondary || [],
              },
              equipment: form.equipment || [],
              equipmentUk: (form.equipment || []).map(
                (eid) =>
                  EQUIPMENT_OPTIONS.find((x) => x.id === eid)?.label || eid,
              ),
              description: (form.description || "").trim(),
              source: "manual",
            });
            setNameError(null);
            onClose();
            setForm({
              nameUk: "",
              primaryGroup: "chest",
              musclesPrimary: [],
              musclesSecondary: [],
              equipment: ["bodyweight"],
              description: "",
            });
          }}
        >
          Зберегти
        </Button>
        <Button
          variant="ghost"
          className="h-12 min-h-[44px]"
          onClick={handleClose}
        >
          Скасувати
        </Button>
      </div>
    </Sheet>
  );
}
