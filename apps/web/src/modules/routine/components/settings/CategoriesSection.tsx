import { useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { IconButton } from "@shared/components/ui/IconButton";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../lib/routineStorage";
import type { CategoryDraft, RoutineState } from "../../lib/types";

export interface CategoriesSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  catDraft: CategoryDraft;
  setCatDraft: Dispatch<SetStateAction<CategoryDraft>>;
}

export function CategoriesSection({
  routine,
  setRoutine,
  catDraft,
  setCatDraft,
}: CategoriesSectionProps) {
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const toast = useToast();

  return (
    <>
      <Card as="section" radius="lg" padding="md" className="space-y-3">
        <SectionHeading as="h2" size="sm">
          {editingCatId ? "Редагувати категорію" : "Категорії"}
        </SectionHeading>
        <div className="flex flex-wrap gap-2 items-stretch">
          <Input
            className="routine-touch-field w-16 shrink-0"
            placeholder="🏠"
            value={catDraft.emoji}
            onChange={(e) =>
              setCatDraft((d) => ({ ...d, emoji: e.target.value }))
            }
          />
          <Input
            className="routine-touch-field min-w-0 flex-1 basis-[min(100%,14rem)]"
            placeholder="Назва категорії"
            value={catDraft.name}
            onChange={(e) =>
              setCatDraft((d) => ({ ...d, name: e.target.value }))
            }
          />
          {editingCatId ? (
            <>
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] min-w-0 sm:min-w-28"
                onClick={() => {
                  setRoutine((s) =>
                    updateCategory(s, editingCatId, {
                      name: catDraft.name,
                      emoji: catDraft.emoji,
                    }),
                  );
                  setEditingCatId(null);
                  setCatDraft({ name: "", emoji: "" });
                }}
              >
                Зберегти
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-[44px] min-w-0"
                onClick={() => {
                  setEditingCatId(null);
                  setCatDraft({ name: "", emoji: "" });
                }}
              >
                Скасувати
              </Button>
            </>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px] w-full min-w-0 sm:w-auto sm:min-w-28"
              onClick={() => {
                setRoutine((s) =>
                  createCategory(s, catDraft.name, catDraft.emoji),
                );
                setCatDraft({ name: "", emoji: "" });
              }}
            >
              Додати
            </Button>
          )}
        </div>
        {routine.categories.length > 0 && (
          <ul className="space-y-2 mt-2">
            {routine.categories.map((c) => {
              const habitCount = routine.habits.filter(
                (h) => h.categoryId === c.id,
              ).length;
              return (
                <li
                  key={c.id}
                  className={cn(
                    "flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-panelHi border border-line",
                    editingCatId === c.id &&
                      "ring-2 ring-routine-ring/60 dark:ring-routine-border-dark/40",
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-style-label truncate">
                      {c.emoji ? `${c.emoji} ` : ""}
                      {c.name}
                    </span>
                    <span className="shrink-0 text-2xs text-subtle bg-panel border border-line rounded-full px-2 py-0.5">
                      {habitCount}{" "}
                      {habitCount === 1
                        ? "звичка"
                        : habitCount >= 2 && habitCount <= 4
                          ? "звички"
                          : "звичок"}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <IconButton
                      size="xs"
                      variant="ghost"
                      className="rounded-xl text-subtle hover:text-text text-xs!"
                      onClick={() => {
                        setEditingCatId(c.id);
                        setCatDraft({ name: c.name, emoji: c.emoji || "" });
                      }}
                      aria-label={`Змінити ${c.name}`}
                    >
                      ✎
                    </IconButton>
                    <IconButton
                      size="xs"
                      variant="ghost"
                      className="rounded-xl text-subtle hover:text-danger text-xs!"
                      onClick={() => {
                        // Soft-delete with undo: snapshot the full
                        // routine state, apply the deletion, then offer
                        // a 5 s undo toast that restores the snapshot.
                        // No `ConfirmDialog` — per the unified undo
                        // policy (`AGENTS.md`) confirmation dialogs are
                        // reserved for non-reversible flows.
                        const snapshot = routine;
                        const wasEditing = editingCatId === c.id;
                        setRoutine((s) => deleteCategory(s, c.id));
                        if (wasEditing) {
                          setEditingCatId(null);
                          setCatDraft({ name: "", emoji: "" });
                        }
                        const detail =
                          habitCount > 0
                            ? ` (${habitCount} ${habitCount === 1 ? "звичка" : "звичок"} без категорії)`
                            : "";
                        showUndoToast(toast, {
                          msg: `Видалено категорію «${c.name}»${detail}`,
                          onUndo: () => setRoutine(snapshot),
                        });
                      }}
                      aria-label={`Видалити ${c.name}`}
                    >
                      ×
                    </IconButton>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
