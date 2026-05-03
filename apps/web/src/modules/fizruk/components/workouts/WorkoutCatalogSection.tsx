import type { Dispatch, SetStateAction } from "react";
import type {
  FizrukData,
  recoveryConflictsForExercise as recoveryConflictsForExerciseFn,
} from "@sergeant/fizruk-domain";
import { Input } from "@shared/components/ui/Input";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { FizrukEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";

type RecExerciseFn = typeof recoveryConflictsForExerciseFn;
type RecoveryByMap = Parameters<RecExerciseFn>[1];

export type CatalogGroup = {
  id: string;
  label: string;
  items: FizrukData.RawExerciseDef[];
  total: number;
};

type WorkoutCatalogSectionProps = {
  mode: "log" | "catalog";
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  equipmentFilter: string[];
  setEquipmentFilter: Dispatch<SetStateAction<string[]>>;
  equipmentUk: Record<string, string>;
  grouped: CatalogGroup[];
  open: Record<string, boolean>;
  setOpen: Dispatch<SetStateAction<Record<string, boolean>>>;
  handleExerciseInListClick: (ex: FizrukData.RawExerciseDef) => void;
  setSelected: (ex: FizrukData.RawExerciseDef) => void;
  recoveryConflictsForExercise: RecExerciseFn;
  rec: { by: RecoveryByMap };
  musclesUk: Record<string, string>;
};

function toggleArr(arr: string[] | null | undefined, value: string): string[] {
  const a = Array.isArray(arr) ? arr : [];
  return a.includes(value) ? a.filter((x) => x !== value) : [...a, value];
}

export function WorkoutCatalogSection({
  mode,
  q,
  setQ,
  equipmentFilter,
  setEquipmentFilter,
  equipmentUk,
  grouped,
  open,
  setOpen,
  handleExerciseInListClick,
  setSelected,
  recoveryConflictsForExercise,
  rec,
  musclesUk,
}: WorkoutCatalogSectionProps) {
  return (
    <>
      <div className="relative mb-3">
        <Input
          placeholder="Пошук (жим, підтягування, спина…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            onClick={() => setQ("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-text"
          >
            ✕
          </button>
        )}
      </div>

      {equipmentUk && Object.keys(equipmentUk).length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-subtle mb-1.5">
            Обладнання
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(equipmentUk as Record<string, string>).map(
              ([id, label]) => {
                const active = (equipmentFilter || []).includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setEquipmentFilter(toggleArr(equipmentFilter, id))
                    }
                    className={cn(
                      "text-xs px-3 py-1.5 rounded-full border transition-colors",
                      active
                        ? "bg-text text-bg border-text"
                        : "border-line bg-bg text-muted hover:border-muted hover:text-text",
                    )}
                    aria-pressed={active}
                  >
                    {label}
                  </button>
                );
              },
            )}
            {(equipmentFilter || []).length > 0 && (
              <button
                type="button"
                onClick={() => setEquipmentFilter([])}
                className="text-xs px-3 py-1.5 rounded-full border border-line text-muted hover:text-text hover:border-muted transition-colors"
              >
                Скинути
              </button>
            )}
          </div>
        </div>
      )}

      {mode === "log" && (
        <p className="text-xs text-subtle mb-2 leading-relaxed">
          Розкрий групу й тапни по вправі — додасться в активне тренування.
          Кнопка «ⓘ» праворуч — опис і фото без додавання.
        </p>
      )}

      <Card radius="lg" padding="none" className="overflow-hidden">
        {grouped.length === 0 ? (
          <EmptyState
            icon={<FizrukEmptyIllustration size={72} />}
            title="Поки немає вправ"
            description="Додай першу через кнопку «+ Додати»."
          />
        ) : (
          grouped.map((g) => {
            const isOpen = open[g.id] ?? false;
            return (
              <div key={g.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-panelHi/60 hover:bg-panelHi transition-colors"
                >
                  <div className="text-sm font-bold text-text">{g.label}</div>
                  <div className="text-xs text-muted flex items-center gap-2">
                    <span>{g.total}</span>
                    <span className="text-lg leading-none">
                      {isOpen ? "▾" : "▸"}
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div>
                    {g.items.map((ex) => {
                      const catCf = recoveryConflictsForExercise(ex, rec.by);
                      return (
                        <div key={ex.id} className="flex border-t border-line">
                          <button
                            type="button"
                            onClick={() => handleExerciseInListClick(ex)}
                            className={cn(
                              "flex-1 min-w-0 text-left px-4 py-3 transition-colors",
                              mode === "log"
                                ? "hover:bg-success/10 active:bg-success/15"
                                : "hover:bg-panelHi",
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-style-label text-text truncate flex items-center gap-2">
                                  {ex?.name?.uk || ex?.name?.en}
                                  {catCf.hasWarning ? (
                                    <span
                                      className="text-warning shrink-0"
                                      title="Мʼязи ще відновлюються"
                                    >
                                      ⚠
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-xs text-subtle mt-0.5">
                                  Мʼязи:{" "}
                                  <span className="font-semibold text-muted">
                                    {(ex?.muscles?.primary || [])
                                      .map((id) => musclesUk?.[id] || id)
                                      .join(", ") || "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 text-xs text-muted tabular-nums">
                                {typeof ex.rating === "number"
                                  ? ex.rating.toFixed(1)
                                  : ""}
                              </div>
                            </div>
                          </button>

                          {mode === "log" && (
                            <button
                              type="button"
                              className="shrink-0 w-12 min-h-[48px] flex items-center justify-center border-l border-line text-muted hover:text-text hover:bg-panelHi transition-colors"
                              aria-label="Опис і фото вправи"
                              onClick={() => setSelected(ex)}
                            >
                              <span
                                className="text-base leading-none"
                                aria-hidden
                              >
                                ⓘ
                              </span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {g.total > g.items.length && (
                      <div className="px-4 py-3 text-xs text-subtle border-t border-line">
                        Показано {g.items.length} з {g.total} (уточни пошук щоб
                        звузити)
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}
