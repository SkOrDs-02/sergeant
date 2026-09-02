/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useState, type Dispatch, type SetStateAction } from "react";
import { cn } from "@shared/lib/ui/cn";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { IconButton } from "@shared/components/ui/IconButton";
import { Icon } from "@shared/components/ui/Icon";
import { Input } from "@shared/components/ui/Input";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import {
  createCategory,
  updateCategory,
  deleteCategory,
} from "../../lib/routineStorage";
import { HabitGlyph } from "../HabitGlyph";
import { HabitGlyphPicker } from "../HabitGlyphPicker";
import type { CategoryDraft, RoutineState } from "../../lib/types";

export interface CategoriesSectionProps {
  routine: RoutineState;
  setRoutine: Dispatch<SetStateAction<RoutineState>>;
  catDraft: CategoryDraft;
  setCatDraft: Dispatch<SetStateAction<CategoryDraft>>;
}

/** Скільки звичок у категорії — з правильним UA-відмінком. */
function habitCountLabel(count: number): string {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return "звичок";
  const mod10 = count % 10;
  if (mod10 === 1) return "звичка";
  if (mod10 >= 2 && mod10 <= 4) return "звички";
  return "звичок";
}

export function CategoriesSection({
  routine,
  setRoutine,
  catDraft,
  setCatDraft,
}: CategoriesSectionProps) {
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  /**
   * Помилка валідації назви живе ПІД полем, а не в тості.
   *
   * До 2026-08-05 «Введи назву» / «Така категорія вже є» летіли
   * `toast.warning` у протилежний кут екрана: користувач мусив
   * відірватись від поля, знайти повідомлення внизу і повернутись назад.
   * Це помилка конкретного поля — за галузевою практикою (і за
   * tone-таблицею toast-policy, де warning — це деградація сервісу, а не
   * валідація) вона належить полю. Toast лишається для наслідків дій.
   */
  const [nameError, setNameError] = useState<string | null>(null);
  const toast = useToast();

  const resetDraft = () => {
    setCatDraft({ name: "", emoji: "" });
    setNameError(null);
  };

  return (
    <Card as="section" radius="lg" padding="md" className="space-y-3">
      <SectionHeading as="h2" size="xs" variant="routine">
        {editingCatId ? "Редагувати категорію" : "Категорії"}
      </SectionHeading>
      <div className="flex flex-wrap items-stretch gap-2">
        {/*
          До 2026-08-03 тут стояв `<Input placeholder="🏠" className="w-16">`:
          вільне текстове поле, в яке лізло будь-що (включно з реченням, що
          ламало рядок), а результат залежав від системного emoji-шрифту.
          Тепер — закритий набір іконок дизайн-системи.
        */}
        <HabitGlyphPicker
          value={catDraft.emoji}
          onChange={(glyph) => setCatDraft((d) => ({ ...d, emoji: glyph }))}
          label="Обрати іконку категорії"
          optional
        />
        <Input
          className="routine-touch-field min-w-0 flex-1 basis-[min(100%,14rem)]"
          placeholder="Назва категорії"
          aria-label="Назва категорії"
          value={catDraft.name}
          error={!!nameError}
          helperText={nameError ?? undefined}
          onChange={(e) => {
            setCatDraft((d) => ({ ...d, name: e.target.value }));
            // Користувач уже виправляє — не тримай червоне до наступного
            // натискання «Зберегти».
            if (nameError) setNameError(null);
          }}
        />
        {editingCatId ? (
          <>
            <Button
              type="button"
              variant="secondary"
              className="min-h-[44px] min-w-0 sm:min-w-28"
              onClick={() => {
                // PR-058 (web): пара до reducer-level dedupe в
                // `applyUpdateCategory`. Перевіряємо conflict в UI
                // (свіжий `routine`), тримаємо edit-mode активним
                // і показуємо toast — без цього save був би silent
                // no-op з побічним рефрешем входу.
                const trimmed = catDraft.name.trim();
                if (trimmed) {
                  const conflict = routine.categories.some(
                    (c) =>
                      c.id !== editingCatId &&
                      c.name.trim().toLocaleLowerCase() ===
                        trimmed.toLocaleLowerCase(),
                  );
                  if (conflict) {
                    setNameError(messages.validation.categoryNameDuplicate);
                    return;
                  }
                }
                setRoutine((s) =>
                  updateCategory(s, editingCatId, {
                    name: catDraft.name,
                    emoji: catDraft.emoji,
                  }),
                );
                setEditingCatId(null);
                resetDraft();
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
                resetDraft();
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
              // PR-058 (web): дзеркало TagsSection. Reducer-level dedupe
              // у `applyCreateCategory` повертає same state при
              // дублікаті — ловимо це в UI і показуємо toast,
              // щоб користувач розумів, чому «Додати» не працює.
              const trimmed = catDraft.name.trim();
              if (!trimmed) {
                setNameError(messages.validation.categoryNameRequired);
                return;
              }
              const isDuplicate = routine.categories.some(
                (c) =>
                  c.name.trim().toLocaleLowerCase() ===
                  trimmed.toLocaleLowerCase(),
              );
              if (isDuplicate) {
                setNameError(messages.validation.categoryNameDuplicate);
                return;
              }
              setRoutine((s) => createCategory(s, trimmed, catDraft.emoji));
              resetDraft();
            }}
          >
            Додати
          </Button>
        )}
      </div>
      {routine.categories.length === 0 ? (
        <p className="text-style-body text-subtle leading-snug">
          Категорій ще немає. Категорія групує звички за сферою життя:
          «Здоровʼя», «Робота», «Дім», і зʼявляється у формі звички під «Більше
          опцій».
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {routine.categories.map((c) => {
            const habitCount = routine.habits.filter(
              (h) => h.categoryId === c.id,
            ).length;
            return (
              <li
                key={c.id}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border border-line bg-panelHi px-3 py-2",
                  editingCatId === c.id &&
                    "ring-2 ring-routine-ring/60 dark:ring-routine-border-dark/40",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <HabitGlyph
                    value={c.emoji}
                    size="md"
                    className="text-muted"
                    optional
                  />
                  <span className="text-style-label truncate">{c.name}</span>
                  <span className="shrink-0 text-style-caption text-subtle bg-panel border border-line rounded-full px-2 py-0.5">
                    {habitCount} {habitCountLabel(habitCount)}
                  </span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton
                    size="xs"
                    variant="ghost"
                    className="rounded-xl text-subtle hover:text-text"
                    onClick={() => {
                      setEditingCatId(c.id);
                      setCatDraft({ name: c.name, emoji: c.emoji || "" });
                    }}
                    aria-label={`Змінити ${c.name}`}
                  >
                    <Icon name="edit" size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    size="xs"
                    variant="ghost"
                    className="rounded-xl text-subtle hover:text-danger"
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
                        resetDraft();
                      }
                      const detail =
                        habitCount > 0
                          ? ` (${habitCount} ${habitCountLabel(habitCount)} без категорії)`
                          : "";
                      showUndoToast(toast, {
                        msg: `Видалено категорію «${c.name}»${detail}`,
                        onUndo: () => setRoutine(snapshot),
                      });
                    }}
                    aria-label={`Видалити ${c.name}`}
                  >
                    <Icon name="close" size={14} aria-hidden />
                  </IconButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
