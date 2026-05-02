import { useMemo, useState } from "react";
import type { FizrukData } from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Input } from "@shared/components/ui/Input";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { Icon } from "@shared/components/ui/Icon";
import { Tooltip } from "@shared/components/ui/Tooltip";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/undoToast";
import type { WorkoutTemplate } from "../hooks/useWorkoutTemplates";

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
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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
      const next = [...o];
      [next[idx], next[j]] = [next[j], next[idx]];
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
      <div className="text-xs text-subtle leading-relaxed">
        Шаблони — лише твої: додай назву й послідовність вправ з каталогу. План
        на головній будується з цих шаблонів. Щоб стартувати тренування зі
        списку нижче — натисни «Почати» біля шаблону (відкриється журнал з
        активним тренуванням).
      </div>

      {!editingId && (
        <Button className="w-full h-12 min-h-[44px]" onClick={startNew}>
          + Новий шаблон
        </Button>
      )}

      {editingId && (
        <Card radius="lg" className="space-y-3">
          <Input
            placeholder="Назва (за замовчуванням — «Мій шаблон»)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Назва шаблону"
          />
          <div>
            <SectionHeading as="div" size="xs" className="mb-2">
              Додати вправу з каталогу
            </SectionHeading>
            <Input
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
                  className="w-full text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-panelHi transition-colors"
                  onClick={() => addEx(ex)}
                >
                  {ex?.name?.uk || ex?.name?.en}
                </button>
              ))}
              {pickList.length === 0 && (
                <div className="p-3 text-xs text-subtle text-center">
                  Нічого не знайдено
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <SectionHeading as="div" size="xs">
                Порядок ({orderIds.length})
              </SectionHeading>
              {orderIds.length >= 2 && !groupSelectMode && (
                <button
                  type="button"
                  className="text-xs px-2 py-1 rounded-xl border border-line text-subtle hover:text-text hover:bg-panelHi transition-colors"
                  onClick={() => {
                    setGroupSelectMode(true);
                    setGroupSelected(new Set());
                  }}
                >
                  ⊕ Суперсет
                </button>
              )}
              {groupSelectMode && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded-xl border border-success/40 text-success disabled:opacity-40"
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
                    className="text-xs px-2 py-1 rounded-xl border border-line text-subtle"
                    onClick={() => {
                      setGroupSelectMode(false);
                      setGroupSelected(new Set());
                    }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            {orderIds.length === 0 ? (
              <div className="text-sm text-subtle text-center py-4">
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
                          className={`w-5 h-5 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${isSelected ? "bg-success-strong border-success-strong text-white" : "border-line bg-bg"}`}
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
                      <span className="text-xs text-subtle w-5 text-center">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm truncate min-w-0">
                        {ex?.name?.uk || ex?.name?.en || id}
                      </span>
                      {group && (
                        <span
                          // eslint-disable-next-line sergeant-design/no-eyebrow-drift -- Inline superset/circuit pill at text-2xs with dynamic module tint; defer Badge migration.
                          className={`text-2xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${group.type === "circuit" ? "bg-fizruk/15 text-fizruk border border-fizruk/30" : "bg-success/15 text-success border border-success/30"}`}
                        >
                          {group.type === "circuit" ? "Коло" : "СС"}
                        </span>
                      )}
                      {group && !groupSelectMode && (
                        <Tooltip
                          content="Прибрати з групи"
                          placement="top-center"
                        >
                          <button
                            type="button"
                            className="text-2xs text-danger/60 hover:text-danger px-1"
                            aria-label="Прибрати з групи"
                            onClick={() => handleRemoveGroup(group.id)}
                          >
                            ⊗
                          </button>
                        </Tooltip>
                      )}
                      {!groupSelectMode && (
                        <>
                          <button
                            type="button"
                            className="min-w-[44px] min-h-[44px] text-subtle hover:text-text"
                            aria-label="Вище"
                            onClick={() => move(idx, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="min-w-[44px] min-h-[44px] text-subtle hover:text-text"
                            aria-label="Нижче"
                            onClick={() => move(idx, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            className="min-w-[44px] min-h-[44px] text-danger/80"
                            aria-label="Прибрати з шаблону"
                            onClick={() => removeAt(idx)}
                          >
                            ✕
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
              className="flex-1 h-12 min-h-[44px]"
              onClick={save}
              disabled={!orderIds.length}
            >
              Зберегти
            </Button>
            <Button
              variant="ghost"
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
          <SectionHeading as="div" size="sm">
            Збережені шаблони
          </SectionHeading>
        </div>
        {(templates || []).length === 0 ? (
          <EmptyState
            compact
            module="fizruk"
            icon={<Icon name="dumbbell" size={20} />}
            title="Поки немає шаблонів"
            description="Створи свій перший — кнопка вище."
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
                <div className="text-xs text-subtle">
                  {(t.exerciseIds || []).length} вправ
                  {(t.groups || []).length > 0 && (
                    <span className="ml-2 text-success">
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
                  variant="ghost"
                  className="h-10 min-w-[44px] px-3"
                  onClick={() => startEdit(t)}
                >
                  Змінити
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="h-10 min-w-[44px] px-3"
                  onClick={() => setConfirmDeleteId(t.id)}
                >
                  ✕
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
                msg: `Видалено шаблон «${snapshot.template.name}»`,
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
