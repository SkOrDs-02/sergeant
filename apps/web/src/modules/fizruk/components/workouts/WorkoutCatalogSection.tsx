/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type {
  FizrukData,
  recoveryConflictsForExercise as recoveryConflictsForExerciseFn,
} from "@sergeant/fizruk-domain";
import { equipmentForLocation } from "@sergeant/fizruk-domain/data";
import { Input } from "@shared/components/ui/Input";
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { Icon } from "@shared/components/ui/Icon";
import { MorphChevron } from "@shared/components/ui/MorphChevron";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { FizrukEmptyIllustration } from "@shared/components/ui/EmptyStateIllustrations";
import { cn } from "@shared/lib/ui/cn";
import { Card } from "@shared/components/ui/Card";
import { Segmented } from "@shared/components/ui/Segmented";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { fmt } from "../../lib/numberFmt";

type RecExerciseFn = typeof recoveryConflictsForExerciseFn;
type RecoveryByMap = Parameters<RecExerciseFn>[1];

export type CatalogGroup = {
  id: string;
  label: string;
  items: FizrukData.RawExerciseDef[];
  total: number;
};

/**
 * Локація — це не нове поле в каталозі, а прочитане `equipment`
 * (`getExerciseLocations`). Підписи живуть тут, бо це UI-копія.
 */
const LOCATION_OPTIONS: ReadonlyArray<{
  id: FizrukData.ExerciseLocation;
  label: string;
}> = [
  { id: "gym", label: "Зал" },
  { id: "home", label: "Дім" },
  { id: "outdoor", label: "Вулиця" },
];

type WorkoutCatalogSectionProps = {
  mode: "log" | "catalog";
  q: string;
  setQ: Dispatch<SetStateAction<string>>;
  equipmentFilter: string[];
  setEquipmentFilter: Dispatch<SetStateAction<string[]>>;
  locationFilter: FizrukData.ExerciseLocation;
  setLocationFilter: Dispatch<SetStateAction<FizrukData.ExerciseLocation>>;
  /** Скільки вправ дає кожен вид обладнання сам по собі в цій локації. */
  equipmentCounts: Record<string, number>;
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
  locationFilter,
  setLocationFilter,
  equipmentUk,
  equipmentCounts,
  grouped,
  open,
  setOpen,
  handleExerciseInListClick,
  setSelected,
  recoveryConflictsForExercise,
  rec,
  musclesUk,
}: WorkoutCatalogSectionProps) {
  const [equipmentOpen, setEquipmentOpen] = useState(false);

  /**
   * `gym` — найширший кошик (там доступний увесь каталог), тож він не
   * звужує список і не рахується за активний фільтр.
   */
  const hasQuery =
    q.trim().length > 0 ||
    (equipmentFilter || []).length > 0 ||
    locationFilter !== "gym";
  const availableEquipment = equipmentForLocation(locationFilter).filter(
    (id) => equipmentUk?.[id],
  );
  const hasEquipmentOptions = availableEquipment.length > 0;
  const selectedEquipment = (equipmentFilter || []).filter((id) =>
    availableEquipment.includes(id),
  );

  const resetFilters = () => {
    setQ("");
    setEquipmentFilter([]);
    setLocationFilter("gym");
  };

  /**
   * Обладнання, якого в новому місці немає, знімається одразу: інакше
   * фільтр мовчки дає нуль вправ і список виглядає зламаним.
   */
  const changeLocation = (next: FizrukData.ExerciseLocation) => {
    setLocationFilter(next);
    const allowed = equipmentForLocation(next);
    setEquipmentFilter((prev) =>
      (prev || []).filter((id) => allowed.includes(id)),
    );
  };

  return (
    <>
      <div className="relative mb-3">
        <Input
          {...searchFieldProps("workout-catalog-search")}
          placeholder="Пошук (жим, підтягування, спина…)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Очистити пошук"
            className="touch-target absolute right-1 top-1/2 -translate-y-1/2 text-subtle hover:text-text"
          >
            <Icon name="close" size={16} aria-hidden />
          </button>
        )}
      </div>

      <div className="mb-3 space-y-2">
        <Segmented
          items={LOCATION_OPTIONS.map(({ id, label }) => ({
            value: id,
            label,
          }))}
          value={locationFilter}
          onChange={changeLocation}
          variant="fizruk"
          size="md"
          layout="bar"
          ariaLabel="Де тренуюсь"
        />

        {hasEquipmentOptions && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEquipmentOpen(true)}
              className="focus-ring flex min-h-[44px] flex-1 items-center justify-between rounded-2xl border border-line bg-panelHi px-3 text-sm text-text transition-colors hover:border-muted"
            >
              <span>Обладнання</span>
              <span className="flex items-center gap-2 text-style-caption text-muted">
                {selectedEquipment.length > 0 ? (
                  <span className="rounded-full bg-fizruk-surface px-2 py-0.5 font-semibold text-fizruk-soft-fg">
                    {fmt(selectedEquipment.length)}
                  </span>
                ) : (
                  <span>{fmt(availableEquipment.length)} видів</span>
                )}
                <Icon name="chevron-down" size={16} aria-hidden />
              </span>
            </button>
            {selectedEquipment.length > 0 && (
              <button
                type="button"
                onClick={() => setEquipmentFilter([])}
                className="focus-ring shrink-0 rounded-md px-2 py-1 text-style-caption font-semibold text-text underline decoration-border-strong underline-offset-2 transition-colors hover:text-muted pointer-coarse:min-h-[44px]"
              >
                Скинути
              </button>
            )}
          </div>
        )}
      </div>

      <Sheet
        open={equipmentOpen}
        onClose={() => setEquipmentOpen(false)}
        title="Обладнання"
        description={`${fmt(availableEquipment.length)} з ${fmt(
          Object.keys(equipmentUk || {}).length,
        )} видів має сенс тут`}
        footer={
          <Button variant="primary" onClick={() => setEquipmentOpen(false)}>
            Готово
          </Button>
        }
      >
        <ul className="divide-y divide-line">
          {availableEquipment.map((id) => {
            const active = (equipmentFilter || []).includes(id);
            return (
              <li key={id}>
                <button
                  type="button"
                  // Функціональний апдейт: два швидкі тапи поспіль інакше
                  // рахуються від одного застарілого масиву, і перший губиться.
                  onClick={() =>
                    setEquipmentFilter((prev) => toggleArr(prev, id))
                  }
                  aria-pressed={active}
                  className="focus-ring flex min-h-[44px] w-full items-center gap-3 py-2 text-left text-sm text-text"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      active
                        ? "border-fizruk-ring bg-fizruk-surface text-fizruk-soft-fg"
                        : "border-border-strong",
                    )}
                  >
                    {active ? <Icon name="check" size={12} /> : null}
                  </span>
                  <span className="flex-1">{equipmentUk[id]}</span>
                  <span className="text-style-caption tabular-nums text-muted">
                    {fmt(equipmentCounts[id] ?? 0)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      {mode === "log" && (
        <p className="text-style-body text-muted mb-2 leading-relaxed">
          Розкрий групу й тапни по вправі, додасться в активне тренування.
          Кнопка «Інфо» праворуч: мʼязи й обладнання без додавання.
        </p>
      )}

      <Card radius="lg" padding="none" className="overflow-hidden">
        {grouped.length === 0 ? (
          /*
            Порожній каталог і порожній РЕЗУЛЬТАТ ПОШУКУ — різні стани, і
            плутати їх не можна: каталог непорожній, а на запит без збігів
            екран радив «Додай першу через кнопку «+ Додати»» (браузерне QA
            2026-08-23). Друга гілка називає причину й пропонує дію, яка
            справді допоможе, — скинути запит/фільтр.
          */
          hasQuery ? (
            <EmptyState
              illustration={<FizrukEmptyIllustration size={96} />}
              title="Нічого не знайшлось"
              description={
                q
                  ? `За запитом «${q}» вправ немає. Спробуй іншу назву, групу мʼязів або скинь пошук.`
                  : "Під вибрані фільтри вправ немає. Скинь їх або обери інші."
              }
              module="fizruk"
              action={
                <button
                  type="button"
                  onClick={resetFilters}
                  className="focus-ring min-h-[44px] rounded-xl border border-line px-4 text-style-caption text-text transition-colors hover:bg-panelHi"
                >
                  Скинути пошук
                </button>
              }
            />
          ) : (
            <EmptyState
              illustration={<FizrukEmptyIllustration size={96} />}
              title="Поки немає вправ"
              description="Додай першу через кнопку «+ Додати»."
              module="fizruk"
            />
          )
        ) : (
          grouped.map((g) => {
            const isOpen = open[g.id] ?? false;
            const panelId = `catalog-panel-${g.id}`;
            return (
              <div key={g.id} className="border-b border-line last:border-0">
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.id]: !isOpen }))}
                  className="w-full flex items-center justify-between px-4 py-3 bg-panelHi/60 hover:bg-panelHi transition-colors"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                >
                  <div className="text-style-label text-text">{g.label}</div>
                  <div className="text-style-caption text-muted flex items-center gap-2">
                    <span>{g.total}</span>
                    <MorphChevron open={isOpen} size={16} />
                  </div>
                </button>

                {isOpen && (
                  <div id={panelId}>
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
                                    <Icon
                                      name="alert-triangle"
                                      size={15}
                                      className="text-warning shrink-0"
                                      title={
                                        catCf.injury.blocked
                                          ? "Позначено біль: не радимо навантажувати"
                                          : "Мʼязи ще відновлюються"
                                      }
                                    />
                                  ) : null}
                                </div>
                                <div className="text-style-caption text-muted mt-0.5">
                                  Мʼязи:{" "}
                                  <span className="font-semibold text-muted">
                                    {(ex?.muscles?.primary || [])
                                      .map((id) => musclesUk?.[id] || id)
                                      .join(", ") || "—"}
                                  </span>
                                </div>
                              </div>
                              <div className="shrink-0 text-style-caption text-muted tabular-nums">
                                {typeof ex["rating"] === "number"
                                  ? fmt(ex["rating"], 1)
                                  : ""}
                              </div>
                            </div>
                          </button>

                          {mode === "log" && (
                            <button
                              type="button"
                              className="shrink-0 w-12 min-h-[48px] flex items-center justify-center border-l border-line text-muted hover:text-text hover:bg-panelHi transition-colors"
                              aria-label="Деталі вправи"
                              onClick={() => setSelected(ex)}
                            >
                              <Icon name="info" size="lg" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {g.total > g.items.length && (
                      <div className="px-4 py-3 text-style-caption text-muted border-t border-line">
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
