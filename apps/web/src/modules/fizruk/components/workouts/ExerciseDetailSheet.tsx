import type {
  FizrukData,
  recoveryConflictsForExercise as recoveryConflictsForExerciseFn,
  Workout,
} from "@sergeant/fizruk-domain";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { Button } from "@shared/components/ui/Button";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";

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
  rec: { by: RecoveryByMap } | null | undefined;
  recoveryConflictsForExercise: RecExerciseFn;
  activeWorkoutId: string | null | undefined;
  activeWorkout: Workout | null | undefined;
  addExerciseToActive: (ex: FizrukData.RawExerciseDef) => void;
  onDeleteRequest: () => void;
  toast?: ToastApi;
};

export function ExerciseDetailSheet({
  selected,
  onClose,
  mode,
  musclesUk,
  rec,
  recoveryConflictsForExercise,
  activeWorkoutId,
  activeWorkout,
  addExerciseToActive,
  onDeleteRequest,
  toast,
}: ExerciseDetailSheetProps) {
  if (!selected) return null;

  const cf = recoveryConflictsForExercise(selected, rec?.by);
  const isCustom =
    Boolean(selected._custom) ||
    selected.source === "manual" ||
    String(selected.id || "").startsWith("custom_");

  // Loosely-typed/legacy fields surfaced via the catalog's `[key: string]:
  // unknown` index signature. Narrow them once at the top so the JSX below
  // stays clean.
  const level = typeof selected.level === "string" ? selected.level : null;
  const images = Array.isArray(selected.images)
    ? (selected.images as string[]).filter((s) => typeof s === "string")
    : [];
  const equipmentLabels: string[] = Array.isArray(selected.equipmentUk)
    ? (selected.equipmentUk as string[]).filter((eq) => typeof eq === "string")
    : Array.isArray(selected.equipment)
      ? selected.equipment.filter((eq): eq is string => typeof eq === "string")
      : [];
  const tips: string[] = Array.isArray(selected.tips)
    ? (selected.tips as string[]).filter((t) => typeof t === "string")
    : [];

  const description = (
    <>
      Основна група:{" "}
      <span className="font-semibold text-muted">
        {selected.primaryGroupUk || selected.primaryGroup}
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
        <div className="mb-4 rounded-2xl border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs text-warning leading-snug">
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
            {images.slice(0, 8).map((src) => (
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
        <div className="text-sm text-text leading-relaxed mb-4">
          {selected.description}
        </div>
      )}

      <div className="space-y-2">
        <SectionHeading as="div" size="sm">
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
        <SectionHeading as="div" size="sm">
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

      {tips.length ? (
        <div className="mt-4">
          <SectionHeading as="div" size="sm" className="mb-2">
            Підказки
          </SectionHeading>
          <ul className="space-y-1.5">
            {tips.map((t, i) => (
              <li key={i} className="text-sm text-text leading-relaxed">
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
            addExerciseToActive(selected);
            onClose();
          }}
        >
          + Додати в активне тренування
        </Button>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Button className="h-12" onClick={onClose}>
          Закрити
        </Button>
        <Button
          variant="ghost"
          className={cn("h-12")}
          onClick={() => {
            navigator.clipboard
              ?.writeText(selected?.name?.uk || selected?.name?.en || "")
              .catch(() => {});
          }}
        >
          📋 Копіювати назву
        </Button>
      </div>
    </Sheet>
  );
}
