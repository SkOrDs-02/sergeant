import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { createTag, deleteTag, updateTag } from "../../lib/routineStorage";
import type { RoutineState } from "../../lib/types";

export interface TagsSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  tagDraft: string;
  setTagDraft: Dispatch<SetStateAction<string>>;
}

export function TagsSection({
  routine,
  setRoutine,
  tagDraft,
  setTagDraft,
}: TagsSectionProps) {
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const tagSavedRef = useRef(false);
  const toast = useToast();

  const commitEdit = (id: string) => {
    if (!tagSavedRef.current && editingTagName.trim()) {
      tagSavedRef.current = true;
      setRoutine((s) => updateTag(s, id, editingTagName));
    }
    setEditingTagId(null);
    setEditingTagName("");
  };

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
                onSubmit={(e) => {
                  e.preventDefault();
                  commitEdit(t.id);
                }}
              >
                <Input
                  className="!h-7 !px-1.5 !text-xs w-24"
                  value={editingTagName}
                  onChange={(e) => setEditingTagName(e.target.value)}
                  onBlur={() => commitEdit(t.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      tagSavedRef.current = true;
                      setEditingTagId(null);
                      setEditingTagName("");
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
                  onClick={() => {
                    tagSavedRef.current = false;
                    setEditingTagId(t.id);
                    setEditingTagName(t.name);
                  }}
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
