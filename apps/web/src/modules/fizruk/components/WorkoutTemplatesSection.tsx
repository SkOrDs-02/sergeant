import { useId, useMemo, useState } from "react";
import { pluralExercises } from "@sergeant/shared";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { Label } from "@shared/components/ui/FormField";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import type { WorkoutTemplate } from "../hooks/useWorkoutTemplates";
import { SupersetBadge } from "./workouts/SupersetBadge";

type GroupType = "superset" | "circuit";

type Group = {
  id: string;
  type: GroupType;
  exerciseIds: string[];
  restSec?: number;
};

type WorkoutTemplatesSectionProps = {
  exercises: FizrukData.RawExerciseDef[];
  search: (query: string) => FizrukData.RawExerciseDef[];
  templates: WorkoutTemplate[];
  addTemplate: (
    name: string,
    exerciseIds: string[],
    opts?: { groups?: unknown[] },
  ) => WorkoutTemplate;
  updateTemplate: (id: string, patch: Partial<WorkoutTemplate>) => void;
  removeTemplate: (id: string) => void;
  restoreTemplate?: (
    template: WorkoutTemplate | null | undefined,
    atIndex?: number,
  ) => void;
  onStartTemplate?: (template: WorkoutTemplate) => void;
};

function uid(prefix = "g"): string {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID()}`;
}

export function WorkoutTemplatesSection({
  exercises,
  search,
  templates,
  addTemplate,
  updateTemplate,
  removeTemplate,
  restoreTemplate,
  onStartTemplate,
}: WorkoutTemplatesSectionProps) {
  const nameId = useId();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupSelectMode, setGroupSelectMode] = useState(false);
  const [groupSelected, setGroupSelected] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const pickList = useMemo(() => search(q).slice(0, 40), [search, q]);

  const byId = useMemo(() => {
    const m = new Map();
    for (const ex of exercises || []) {
      if (ex?.id) m.set(ex.id, ex);
    }
    return m;
  }, [exercises]);

  const exIdToGroup = useMemo(() => {
    const m = new Map();
    for (const g of groups) {
      for (const id of g.exerciseIds || []) {
        m.set(id, g);
      }
    }
    return m;
  }, [groups]);

  const startNew = () => {
    setEditingId("new");
    setName("");
    setOrderIds([]);
    setGroups([]);
    setQ("");
    setGroupSelectMode(false);
    setGroupSelected(new Set());
  };

  const startEdit = (t: WorkoutTemplate) => {
    setEditingId(t.id);
    setName(t.name || "");
    setOrderIds([...(t.exerciseIds || [])]);
    setGroups([...((t.groups as Group[] | undefined) || [])]);
    setQ("");
    setGroupSelectMode(false);
    setGroupSelected(new Set());
  };

  const save = () => {
    if (orderIds.length === 0) return;
    const n = name.trim() || "Мій шаблон";
    if (editingId === "new") {
      addTemplate(n, orderIds, { groups });
    } else if (editingId) {
      updateTemplate(editingId, { name: n, exerciseIds: orderIds, groups });
    }
    setEditingId(null);
    setName("");
    setOrderIds([]);
    setGroups([]);
  };

  const addEx = (ex: FizrukData.RawExerciseDef | null | undefined) => {
    if (!ex?.id) return;
    if (orderIds.includes(ex.id)) return;
    setOrderIds((o) => [...o, ex.id]);
  };

  const move = (idx: number, dir: number) => {
    setOrderIds((o) => {
      const j = idx + dir;
      if (j < 0 || j >= o.length) return o;
      const a = o[idx];
      const b = o[j];
      if (a === undefined || b === undefined) return o;
      const next = [...o];
      next[idx] = b;
      next[j] = a;
      return next;
    });
  };

  const removeAt = (idx: number) => {
    const removedId = orderIds[idx];
    setOrderIds((o) => o.filter((_, i) => i !== idx));
    setGroups((gs) =>
      gs
        .map((g) => ({
          ...g,
          exerciseIds: (g.exerciseIds || []).filter((id) => id !== removedId),
        }))
        .filter((g) => (g.exerciseIds || []).length >= 2),
    );
  };

  const handleToggleGroupSelect = (exId: string) => {
    setGroupSelected((prev) => {
      const next = new Set(prev);
      if (next.has(exId)) next.delete(exId);
      else next.add(exId);
      return next;
    });
  };

  const handleCreateGroup = (type: GroupType) => {
    if (groupSelected.size < 2 || groupSelected.size > 3) return;
    const exerciseIds = [...groupSelected];
    const newGroup = { id: uid("g"), type, exerciseIds, restSec: 60 };
    setGroups((gs) => [
      ...gs.filter((g) => !g.exerciseIds.some((id) => groupSelected.has(id))),
      newGroup,
    ]);
    setGroupSelected(new Set());
    setGroupSelectMode(false);
  };

  const handleRemoveGroup = (groupId: string) => {
    setGroups((gs) => gs.filter((g) => g.id !== groupId));
  };

  return (
    <div className="space-y-3">
      <div className="text-style-body text-muted leading-relaxed">
        Шаблони – лише твої: додай назву й послідовність вправ з каталогу. План
        на головній будується з цих шаблонів. Щоб стартувати тренування зі
        списку нижче, натисни «Почати» біля шаблону (відкриється журнал з
        активним тренуванням).
      </div>

      {!editingId && (
        <Button
          module="fizruk"
          className="w-full h-12 min-h-[44px]"
          onClick={startNew}
        >
          + Новий шаблон
        </Button>
      )}

      {editingId && (
        <Card radius="lg" className="space-y-3">
          <Label htmlFor={nameId}>Назва шаблону</Label>
          <Input
            id={nameId}
            placeholder="Напр. Push day, Ноги (без назви: «Мій шаблон»)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Назва шаблону"
          />
          <div>
            <SectionHeading
              as="div"
              size="xs"
              variant="fizruk"
              className="mb-2"
            >
              Додати вправу з каталогу
            </SectionHeading>
            <Input
              {...searchFieldProps("template-exercise-search")}
              placeholder="Пошук…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Пошук вправи для шаблону"
            />
            <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-line divide-y divide-line">
              {pickList.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 min-h-[44px] text-style-label hover:bg-panelHi transition-colors"
                  onClick={() => addEx(ex)}
                >
                  {ex?.name?.uk || ex?.name?.en}
                </button>
              ))}
              {pickList.length === 0 && (
                <div className="p-3 text-style-caption text-muted text-center">
                  Нічого не знайдено
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionHeading as="div" size="xs" variant="fizruk">
                Порядок ({orderIds.length})
              </SectionHeading>
              {orderIds.length >= 2 && !groupSelectMode && (
                <button
                  type="button"
                  // AI-DANGER: `text-xs` на цій і сусідніх чіп-кнопках —
                  // розмір КОНТРОЛА (бордер + падинг + hover), а не роль
                  // тексту. Семантична шкала ролей описує текст: `caption`
                  // це «мета, таймстемпи», і мітка кнопки нею не є.
                  // Спеціальної ролі для контролів у шкалі немає, тож
                  // правильна дія тут — лишити сирий розмір, а не
                  // підібрати найближчу роль. Те саме стосується
                  // `text-xs!` на компоненті `Button`.
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-xl border border-line text-subtle hover:text-text hover:bg-panelHi transition-colors"
                  onClick={() => {
                    setGroupSelectMode(true);
                    setGroupSelected(new Set());
                  }}
                >
                  <Icon name="plus-circle" size="sm" />
                  Суперсет
                </button>
              )}
              {groupSelectMode && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-xl border border-success/40 text-success-strong dark:text-success disabled:opacity-40"
                    disabled={groupSelected.size < 2 || groupSelected.size > 3}
                    onClick={() => handleCreateGroup("superset")}
                    title="Обери 2-3 вправи"
                  >
                    Суперсет ({groupSelected.size}/3)
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-xl border border-fizruk/40 text-fizruk disabled:opacity-40"
                    disabled={groupSelected.size < 2 || groupSelected.size > 3}
                    onClick={() => handleCreateGroup("circuit")}
                    title="Обери 2-3 вправи"
                  >
                    Коло ({groupSelected.size}/3)
                  </button>
                  <button
                    type="button"
                    aria-label="Скасувати групування"
                    className="text-xs px-2 py-1 rounded-xl border border-line text-subtle"
                    onClick={() => {
                      setGroupSelectMode(false);
                      setGroupSelected(new Set());
                    }}
                  >
                    <Icon name="close" size={14} aria-hidden />
                  </button>
                </div>
              )}
            </div>
            {orderIds.length === 0 ? (
              <div className="text-style-label text-subtle text-center py-4">
                Додай хоча б одну вправу
              </div>
            ) : (
              <ul className="space-y-1">
                {orderIds.map((id, idx) => {
                  const ex = byId.get(id);
                  const group = exIdToGroup.get(id);
                  const isSelected = groupSelected.has(id);
                  return (
                    <li
                      key={`${id}_${idx}`}
                      className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors ${isSelected ? "border-success bg-success/5" : group ? "border-success/40 bg-success/5" : "border-line bg-bg"}`}
                    >
                      {groupSelectMode && (
                        <button
                          type="button"
                          className={`w-5 h-5 rounded-xl border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-success-strong border-success-strong text-white" : "border-line bg-bg"}`}
                          onClick={() => handleToggleGroupSelect(id)}
                        >
                          {isSelected && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 10 10"
                              fill="none"
                            >
                              <path
                                d="M2 5l2.5 2.5L8 3"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                      <span className="text-style-caption text-muted w-5 text-center tabular-nums">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-style-label truncate min-w-0">
                        {ex?.name?.uk || ex?.name?.en || id}
                      </span>
                      {group && <SupersetBadge type={group.type} compact />}
                      {group && !groupSelectMode && (
                        <Tooltip
                          content="Прибрати з групи"
                          placement="top-center"
                        >
                          <button
                            type="button"
                            className="inline-flex items-center justify-center text-danger-strong dark:text-danger hover:text-danger px-1"
                            aria-label="Прибрати з групи"
                            onClick={() => handleRemoveGroup(group.id)}
                          >
                            <Icon name="x-circle" size="sm" />
                          </button>
                        </Tooltip>
                      )}
                      {!groupSelectMode && (
                        <>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-subtle hover:text-text"
                            aria-label="Вище"
                            onClick={() => move(idx, -1)}
                          >
                            <Icon name="arrow-up" size={15} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] text-subtle hover:text-text"
                            aria-label="Нижче"
                            onClick={() => move(idx, 1)}
                          >
                            <Icon name="arrow-down" size={15} aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="min-w-[44px] min-h-[44px] text-danger-strong dark:text-danger"
                            aria-label="Прибрати з шаблону"
                            onClick={() => removeAt(idx)}
                          >
                            <Icon name="trash" size={15} aria-hidden />
                          </button>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              module="fizruk"
              className="flex-1 h-12 min-h-[44px]"
              onClick={save}
              disabled={!orderIds.length}
            >
              Зберегти
            </Button>
            <Button
              variant="secondary"
              className="flex-1 h-12 min-h-[44px]"
              onClick={() => {
                setEditingId(null);
                setOrderIds([]);
                setName("");
                setGroups([]);
              }}
            >
              Скасувати
            </Button>
          </div>
        </Card>
      )}

      <Card radius="lg" padding="none" className="overflow-hidden">
        <div className="px-4 py-3 bg-panelHi/60 border-b border-line">
          <SectionHeading as="div" size="xs" variant="fizruk">
            Збережені шаблони
          </SectionHeading>
        </div>
        {(templates || []).length === 0 ? (
          <EmptyState
            compact
            module="fizruk"
            icon={<Icon name="dumbbell" size={20} />}
            title="Поки немає шаблонів"
            description="Створи свій перший, кнопка вище."
          />
        ) : (
          (templates || []).map((t) => (
            <div
              key={t.id}
              className="px-4 py-3 border-b border-line last:border-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="text-style-label text-text truncate">
                  {t.name}
                </div>
                <div className="text-style-caption text-muted">
                  {(t.exerciseIds || []).length}{" "}
                  {pluralExercises((t.exerciseIds || []).length)}
                  {(t.groups || []).length > 0 && (
                    <span className="ml-2 text-success-strong dark:text-success">
                      · {(t.groups || []).length} суперсет
                      {(t.groups || []).length > 1 ? "и" : ""}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 shrink-0 justify-end">
                {typeof onStartTemplate === "function" && (
                  <Button
                    size="sm"
                    className="h-10 min-h-[44px] px-3 bg-fizruk-strong text-white border-fizruk-strong hover:bg-fizruk-strong/90"
                    onClick={() => onStartTemplate(t)}
                    disabled={!(t.exerciseIds || []).length}
                  >
                    Почати
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-10 min-w-[44px] px-3"
                  onClick={() => startEdit(t)}
                >
                  Змінити
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  aria-label={`Видалити шаблон ${t.name}`}
                  className="h-10 min-w-[44px] px-3"
                  onClick={() => setConfirmDeleteId(t.id)}
                >
                  <Icon name="trash" size={15} aria-hidden />
                </Button>
              </div>
            </div>
          ))
        )}
      </Card>
      <ConfirmDialog
        open={confirmDeleteId != null}
        title="Видалити шаблон?"
        description="Натисни «Повернути» у тості, якщо це була випадкова дія."
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        danger
        onConfirm={() => {
          if (confirmDeleteId != null) {
            const idx = (templates || []).findIndex(
              (t) => t.id === confirmDeleteId,
            );
            const snapshot =
              idx >= 0 ? { template: templates[idx], index: idx } : null;
            removeTemplate(confirmDeleteId);
            if (snapshot && typeof restoreTemplate === "function") {
              showUndoToast(toast, {
                msg: `Видалено шаблон «${snapshot.template?.name ?? ""}»`,
                onUndo: () =>
                  restoreTemplate(snapshot.template, snapshot.index),
              });
            }
          }
          setConfirmDeleteId(null);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
