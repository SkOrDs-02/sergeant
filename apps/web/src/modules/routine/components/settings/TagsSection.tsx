import {
  useCallback,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { z } from "zod";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms";
import { messages } from "@shared/i18n/uk";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { createTag, deleteTag, updateTag } from "../../lib/routineStorage";
import type { RoutineState } from "../../lib/types";

export interface TagsSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  tagDraft: string;
  setTagDraft: Dispatch<SetStateAction<string>>;
}

// Item #8 round-12: form-engine — `useApiForm` (zod + RHF) для inline rename.
// Schema нормалізує whitespace через `.trim()` і відсікає порожні tag names —
// раніше це робив `commitEdit` через `editingTagName.trim()` без валідації як
// окремий крок, що створювало двозначність при `onBlur` після Backspace до пустого.
const tagRenameSchema = z.object({
  tagName: z.string().trim().min(1, messages.validation.tagNameRequired),
});

type TagRenameValues = z.infer<typeof tagRenameSchema>;

export function TagsSection({
  routine,
  setRoutine,
  tagDraft,
  setTagDraft,
}: TagsSectionProps) {
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  /** Помилка валідації поля «Новий тег» — під полем, не в тості. */
  const [draftError, setDraftError] = useState<string | null>(null);
  const toast = useToast();

  // `useApiForm` тримає uniform pattern (server-error mapping залишається
  // нульовим для local-only форм, як показав round-11 на Body.tsx). Submit
  // спрацьовує і на Enter (native form submit), і на blur (через `submit()`
  // imperatively); `isSubmitting`-guard всередині useApiForm дедуплікує
  // одночасні виклики, замінюючи `tagSavedRef` antipattern із попередньої
  // інкарнації.
  const { register, submit, reset, setError, isSubmitting, formState } =
    useApiForm<TagRenameValues, void>({
      schema: tagRenameSchema,
      defaultValues: { tagName: "" },
      onSubmit: async (values) => {
        if (!editingTagId) return;
        const trimmed = values.tagName.trim();
        // PR-058 (web): дзеркало create-flow. Reducer-level `applyUpdateTag`
        // тепер returns same state при conflict (інший тег уже носить таку
        // назву) — без цього guard'у `onSuccess` би прогнав reset, edit-mode
        // зник, а тег у списку лишився б зі старим імʼям без жодного UI
        // signal. Throw тримає edit-mode активним, toast показує copy.
        const conflict = routine.tags.some(
          (t) =>
            t.id !== editingTagId &&
            t.name.trim().toLocaleLowerCase() === trimmed.toLocaleLowerCase(),
        );
        if (conflict) {
          // Помилка поля → у поле: `setError` фарбує інпут і дає AT
          // `aria-invalid`. Toast тут лишається СВІДОМО, на відміну від
          // create-flow нижче: перейменування живе в chip-інпуті шириною
          // 6rem усередині flex-wrap списку тегів — рядка helper-тексту під
          // ним нема куди покласти, не розсунувши всю решітку. Червона
          // рамка без слів не пояснює «чому», тож текст несе toast.
          setError("tagName", {
            type: "validate",
            message: messages.validation.tagNameDuplicate,
          });
          toast.warning(messages.validation.tagNameDuplicate);
          throw new Error(messages.validation.tagNameDuplicate);
        }
        setRoutine((s) => updateTag(s, editingTagId, trimmed));
      },
      onSuccess: () => {
        setEditingTagId(null);
        reset({ tagName: "" });
      },
    });

  const startEdit = useCallback(
    (id: string, name: string) => {
      setEditingTagId(id);
      reset({ tagName: name });
    },
    [reset],
  );

  const cancelEdit = useCallback(() => {
    setEditingTagId(null);
    reset({ tagName: "" });
  }, [reset]);

  return (
    <Card as="section" radius="lg" padding="md" className="space-y-3">
      <SectionHeading as="h2" size="sm" variant="routine">
        Теги
      </SectionHeading>
      <div className="flex gap-2 items-stretch">
        <Input
          className="routine-touch-field min-w-0 flex-1"
          placeholder="Новий тег"
          value={tagDraft}
          error={!!draftError}
          helperText={draftError ?? undefined}
          onChange={(e) => {
            setTagDraft(e.target.value);
            if (draftError) setDraftError(null);
          }}
        />
        <Button
          type="button"
          variant="secondary"
          className="min-h-[44px] shrink-0 px-4"
          onClick={() => {
            // PR-058 (web): пара з reducer-level dedupe у `applyCreateTag`.
            // Якщо запис із такою trim-назвою (case-insensitive) уже існує,
            // reducer повертає той самий state — раніше `setRoutine` тихо
            // запускався без жодного UI feedback, тож натиск «+» вдруге
            // підряд виглядав так, ніби нічого не відбулось (хоча в
            // деяких попередніх версіях він навпаки створював дублікат).
            // Тепер ми перехоплюємо обидва no-op кейси (порожнє + дублікат)
            // в UI і показуємо точний copy у toast.
            const trimmed = tagDraft.trim();
            if (!trimmed) return;
            const isDuplicate = routine.tags.some(
              (t) =>
                t.name.trim().toLocaleLowerCase() ===
                trimmed.toLocaleLowerCase(),
            );
            if (isDuplicate) {
              // Тут поле повнорозмірне — помилка живе під ним, а не в
              // тості в протилежному куті екрана.
              setDraftError(messages.validation.tagNameDuplicate);
              return;
            }
            setDraftError(null);
            setRoutine((s) => createTag(s, trimmed));
            setTagDraft("");
          }}
          aria-label="Додати тег"
        >
          <Icon name="plus" size={16} aria-hidden />
        </Button>
      </div>
      <ul className="flex flex-wrap gap-2">
        {routine.tags.map((t) => (
          <li
            key={t.id}
            className="text-style-caption inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-panelHi border border-line"
          >
            {editingTagId === t.id ? (
              <form
                className="inline-flex items-center gap-1"
                onSubmit={submit}
              >
                <Input
                  className="h-7! px-1.5! text-xs! w-24"
                  aria-label={`Назва тега ${t.name}`}
                  aria-invalid={Boolean(formState.errors.tagName) || undefined}
                  disabled={isSubmitting}
                  {...register("tagName", {
                    onBlur: () => {
                      // Submit on blur, але тільки якщо input не порожній —
                      // інакше zod refine впаде на min(1) і onSuccess не
                      // зачинить edit, що дасть користувачу другу спробу.
                      void submit();
                    },
                  })}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      cancelEdit();
                    }
                  }}
                />
              </form>
            ) : (
              <>
                {t.name}
                {/*
                  Скільки звичок носять тег. До 2026-08-03 це число існувало
                  лише в тексті undo-тоста ПІСЛЯ видалення — тобто дізнатись
                  «а чи використовується цей тег» можна було, тільки видаливши
                  його.
                */}
                <span className="text-style-caption text-subtle tabular-nums">
                  {
                    routine.habits.filter((h) =>
                      (h.tagIds || []).includes(t.id),
                    ).length
                  }
                </span>
                <IconButton
                  size="xs"
                  variant="ghost"
                  className="rounded-xl text-subtle hover:text-text"
                  onClick={() => startEdit(t.id, t.name)}
                  aria-label={`Змінити ${t.name}`}
                >
                  <Icon name="edit" size={14} aria-hidden />
                </IconButton>
                <IconButton
                  size="xs"
                  variant="ghost"
                  className="rounded-xl text-subtle hover:text-danger"
                  onClick={() => {
                    // Soft-delete with undo (see docs/design/UNDO-PATTERN.md):
                    // snapshot the routine before applying the delete, then
                    // surface a 5 s undo toast that restores the snapshot.
                    // No ConfirmDialog — confirms are reserved for
                    // non-reversible flows per the unified undo policy.
                    const snapshot = routine;
                    const usageCount = routine.habits.filter((h) =>
                      (h.tagIds || []).includes(t.id),
                    ).length;
                    setRoutine((s) => deleteTag(s, t.id));
                    const detail =
                      usageCount > 0 ? ` (відʼєднано від ${usageCount})` : "";
                    showUndoToast(toast, {
                      msg: `Видалено тег «${t.name}»${detail}`,
                      onUndo: () => setRoutine(snapshot),
                    });
                  }}
                  aria-label={`Видалити ${t.name}`}
                >
                  <Icon name="close" size={14} aria-hidden />
                </IconButton>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
