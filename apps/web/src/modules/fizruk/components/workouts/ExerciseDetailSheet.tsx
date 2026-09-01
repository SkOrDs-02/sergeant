import type {
  recoveryConflictsForExercise as recoveryConflictsForExerciseFn,
  Workout,
  WorkoutItem,
} from "@sergeant/fizruk-domain";
import { FizrukData } from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { WorkoutItemTypeSwitcher } from "./WorkoutItemTypeSwitcher";

type RecExerciseFn = typeof recoveryConflictsForExerciseFn;
type RecoveryByMap = Parameters<RecExerciseFn>[1];

type ToastApi = {
  warning?: (msg: string) => void;
};

type ExerciseDetailSheetProps = {
  selected: FizrukData.RawExerciseDef | null | undefined;
  onClose: () => void;
  mode: "log" | "catalog";
  musclesUk: Record<string, string>;
  primaryGroupsUk?: Record<string, string>;
  equipmentUk?: Record<string, string>;
  rec: { by: RecoveryByMap } | null | undefined;
  recoveryConflictsForExercise: RecExerciseFn;
  activeWorkoutId: string | null | undefined;
  activeWorkout: Workout | null | undefined;
  addExerciseToActive: (ex: FizrukData.RawExerciseDef) => void;
  onDeleteRequest: () => void;
  toast?: ToastApi;
  onNavigate?: ((target: string) => void) | undefined;
  /**
   * Optional — when supplied AND `activeWorkout` already logs `selected`
   * as an item, the sheet renders the "Тип" switcher for that item
   * (moved here from `WorkoutItemCard` in the 2026-08 redesign, item 5:
   * the type control was the single biggest widget on the card despite
   * changing once per exercise or never). Same signature as the
   * `updateItem` already threaded through `WorkoutJournalSection` →
   * `WorkoutItemsList` → `WorkoutItemCard` — pass `o.updateItem` from
   * `Workouts.tsx` to wire it up; omitting it just keeps the sheet's
   * pre-redesign behaviour (no type editing here).
   */
  updateItem?:
    | ((workoutId: string, itemId: string, patch: Partial<WorkoutItem>) => void)
    | undefined;
};

export function ExerciseDetailSheet({
  selected,
  onClose,
  mode,
  musclesUk,
  primaryGroupsUk = {},
  equipmentUk = {},
  rec,
  recoveryConflictsForExercise,
  activeWorkoutId,
  activeWorkout,
  addExerciseToActive,
  onDeleteRequest,
  toast,
  onNavigate,
  updateItem,
}: ExerciseDetailSheetProps) {
  if (!selected) return null;

  const activeItem =
    mode === "log"
      ? (activeWorkout?.items.find((i) => i.exerciseId === selected.id) ?? null)
      : null;

  const cf = recoveryConflictsForExercise(selected, rec?.by);
  const isCustom =
    Boolean(selected["_custom"]) ||
    selected["source"] === "manual" ||
    String(selected.id || "").startsWith("custom_");

  // Loosely-typed/legacy fields surfaced via the catalog's `[key: string]:
  // unknown` index signature. Narrow them once at the top so the JSX below
  // stays clean.
  const level =
    typeof selected["level"] === "string" ? selected["level"] : null;
  const images = FizrukData.exerciseImagePaths(selected.id);
  const equipmentLabels: string[] = Array.isArray(selected["equipmentUk"])
    ? (selected["equipmentUk"] as string[]).filter(
        (eq) => typeof eq === "string",
      )
    : Array.isArray(selected.equipment)
      ? selected.equipment
          .filter((eq): eq is string => typeof eq === "string")
          .map((eq) => equipmentUk[eq] || eq)
      : [];
  const tips: string[] = Array.isArray(selected["tips"])
    ? (selected["tips"] as string[]).filter((t) => typeof t === "string")
    : [];

  const description = (
    <>
      Основна група:{" "}
      <span className="font-semibold text-muted">
        {selected.primaryGroupUk ||
          primaryGroupsUk[selected.primaryGroup] ||
          selected.primaryGroup}
      </span>
      {level ? (
        <>
          {" "}
          · рівень: <span className="font-semibold text-muted">{level}</span>
        </>
      ) : null}
    </>
  );

  return (
    <Sheet
      open={!!selected}
      onClose={onClose}
      title={selected?.name?.uk || selected?.name?.en}
      description={description}
      panelClassName="fizruk-sheet"
      zIndex={100}
    >
      {cf?.hasWarning && (
        <div className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning-strong dark:text-warning leading-snug">
          {cf.injury.blocked ? (
            <div className="font-semibold">
              Ти позначив біль. Навантажувати цю групу не раджу.
            </div>
          ) : null}
          {cf.red?.length ? (
            <div>
              <span className="font-semibold">Рано:</span>{" "}
              {cf.red.map((x) => x.label).join(", ")}
            </div>
          ) : null}
          {cf.yellow?.length ? (
            <div className="mt-1">
              <span className="font-semibold">Краще почекати:</span>{" "}
              {cf.yellow.map((x) => x.label).join(", ")}
            </div>
          ) : null}
        </div>
      )}

      {images.length > 0 && (
        <div className="mb-4 -mx-5 px-5 overflow-x-auto no-scrollbar">
          <div className="flex gap-3">
            {images.map((src) => (
              <img
                key={src}
                src={src}
                alt={selected?.name?.uk || selected?.name?.en || "exercise"}
                loading="lazy"
                decoding="async"
                width="160"
                height="160"
                className="h-40 w-40 rounded-2xl object-cover border border-line bg-bg"
              />
            ))}
          </div>
        </div>
      )}

      {selected.description && (
        <div className="mb-4 space-y-2">
          <SectionHeading as="div" size="xs" variant="fizruk">
            Техніка
          </SectionHeading>
          <p className="text-style-body text-text leading-relaxed">
            {selected.description}
          </p>
        </div>
      )}

      {images.length === 0 && !selected.description && tips.length === 0 && (
        <p className="mb-4 text-style-caption text-subtle leading-relaxed">
          Опису для цієї вправи немає, нижче тільки мʼязи й обладнання.
        </p>
      )}

      <div className="space-y-2">
        <SectionHeading as="div" size="xs" variant="fizruk">
          Мʼязи
        </SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {(selected?.muscles?.primary || []).map((m) => (
            <span
              key={m}
              className="text-xs px-3 py-1.5 rounded-full border border-line bg-bg text-muted font-semibold"
            >
              {musclesUk?.[m] || m} · основний
            </span>
          ))}
          {(selected?.muscles?.secondary || []).map((m) => (
            <span
              key={m}
              className="text-xs px-3 py-1.5 rounded-full border border-line bg-bg text-subtle font-semibold"
            >
              {musclesUk?.[m] || m}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <SectionHeading as="div" size="xs" variant="fizruk">
          Обладнання
        </SectionHeading>
        <div className="flex flex-wrap gap-1.5">
          {equipmentLabels.map((eq) => (
            <span
              key={eq}
              className="text-xs px-3 py-1.5 rounded-full border border-line bg-bg text-muted font-semibold"
            >
              {eq}
            </span>
          ))}
        </div>
      </div>

      {images.length === 0 && (
        <a
          href={`https://www.google.com/search?q=${encodeURIComponent(selected.name.uk)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-xl border border-border-strong bg-panel px-6 text-style-label-lg font-semibold text-text shadow-e1 motion-safe:transition-all motion-safe:duration-base motion-safe:ease-smooth hover:border-brand-200 hover:bg-panelHi hover:shadow-e2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.98]"
        >
          Знайти в інтернеті
        </a>
      )}

      {tips.length ? (
        <div className="mt-4">
          <SectionHeading as="div" size="xs" className="mb-2" variant="fizruk">
            Підказки
          </SectionHeading>
          <ul className="space-y-1.5">
            {tips.map((t) => (
              <li key={t} className="text-style-body text-text leading-relaxed">
                <span className="text-muted font-bold mr-2">•</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isCustom && (
        <div className="mt-4">
          <Button
            variant="danger"
            className="w-full h-12"
            onClick={onDeleteRequest}
          >
            Видалити з каталогу
          </Button>
        </div>
      )}

      {activeItem && updateItem && activeWorkout && (
        <div className="mt-4">
          <WorkoutItemTypeSwitcher
            item={activeItem}
            isReadOnly={Boolean(activeWorkout.endedAt)}
            onChange={(patch) =>
              updateItem(activeWorkout.id, activeItem.id, patch)
            }
          />
        </div>
      )}

      {mode === "log" && (
        <Button
          type="button"
          className="w-full h-12 mt-5 bg-fizruk-strong text-white border-fizruk-strong hover:bg-fizruk-strong/90"
          onClick={() => {
            if (!activeWorkoutId) {
              toast?.warning?.("Спочатку натисни «+ Нове» у блоці вище.");
              return;
            }
            if (activeWorkout?.endedAt) {
              toast?.warning?.(
                "Це тренування вже завершено. Обери чернетку або створи нове.",
              );
              return;
            }
            if (cf.injury.blocked) {
              toast?.warning?.(
                "Ти позначив біль у цій групі. Навантажувати її не раджу.",
              );
            }
            addExerciseToActive(selected);
            onClose();
          }}
        >
          + Додати в активне тренування
        </Button>
      )}

      <div
        className={`mt-5 grid gap-2 ${onNavigate ? "grid-cols-2" : "grid-cols-1"}`}
      >
        <Button variant="secondary" className="h-12" onClick={onClose}>
          Закрити
        </Button>
        {onNavigate && (
          <Button
            variant="secondary"
            className="h-12"
            onClick={() => {
              onNavigate(`exercise/${selected.id}`);
              onClose();
            }}
          >
            Детальніше
          </Button>
        )}
      </div>
    </Sheet>
  );
}
