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
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { useApiForm } from "@shared/forms/useApiForm";
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
  const toast = useToast();

  // `useApiForm` тримає uniform pattern (server-error mapping залишається
  // нульовим для local-only форм, як показав round-11 на Body.tsx). Submit
  // спрацьовує і на Enter (native form submit), і на blur (через `submit()`
  // imperatively); `isSubmitting`-guard всередині useApiForm дедуплікує
  // одночасні виклики, замінюючи `tagSavedRef` antipattern із попередньої
  // інкарнації.
  const { register, submit, reset, isSubmitting, formState } = useApiForm<
    TagRenameValues,
    void
  >({
    schema: tagRenameSchema,
    defaultValues: { tagName: "" },
    onSubmit: async (values) => {
      if (!editingTagId) return;
      setRoutine((s) => updateTag(s, editingTagId, values.tagName));
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
      <SectionHeading as="h2" size="sm">
        Теги
      </SectionHeading>
      <div className="flex gap-2 items-stretch">
        <Input
          className="routine-touch-field min-w-0 flex-1"
          placeholder="Новий тег"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          className="min-h-[44px] shrink-0 border border-line px-4"
          onClick={() => {
            setRoutine((s) => createTag(s, tagDraft));
            setTagDraft("");
          }}
        >
          +
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
                <button
                  type="button"
                  className="text-subtle hover:text-text min-w-[28px] min-h-[28px] flex items-center justify-center rounded-xl"
                  onClick={() => startEdit(t.id, t.name)}
                  aria-label={`Змінити ${t.name}`}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="text-subtle hover:text-danger min-w-[28px] min-h-[28px] flex items-center justify-center rounded-xl"
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
                  ×
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
