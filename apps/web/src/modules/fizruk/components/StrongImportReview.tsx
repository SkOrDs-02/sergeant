import { useMemo, useState, type ChangeEvent } from "react";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/Input";
import { Modal } from "@shared/components/ui/Modal";
import { Select } from "@shared/components/ui/Select";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import type { FizrukData } from "@sergeant/fizruk-domain";
import {
  commitStrongImport,
  matchStrongExercises,
  parseStrongWeightCsv,
  parseStrongWorkoutCsv,
  type StrongExerciseMatch,
  type StrongImportSelection,
  type StrongWeightUnit,
} from "../lib/strongImport";

interface StrongImportReviewProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly exercises: readonly FizrukData.RawExerciseDef[];
}

export function StrongImportReview({
  open,
  onClose,
  exercises,
}: StrongImportReviewProps) {
  const copy = messages.fizruk.strongImport;
  const toast = useToast();
  const [workoutText, setWorkoutText] = useState("");
  const [weightText, setWeightText] = useState("");
  const [weightUnit, setWeightUnit] = useState<StrongWeightUnit>("kg");
  const [selection, setSelection] = useState<StrongImportSelection>({});

  const parsed = useMemo(() => {
    if (!workoutText.trim()) return null;
    try {
      const draft = parseStrongWorkoutCsv(workoutText, weightUnit);
      const matches = matchStrongExercises(draft, exercises);
      const weightDraft = weightText.trim()
        ? parseStrongWeightCsv(weightText)
        : undefined;
      return { draft, matches, weightDraft, error: null };
    } catch (error) {
      return {
        draft: null,
        matches: [],
        weightDraft: undefined,
        error: error instanceof Error ? error.message : copy.parseFailed,
      };
    }
  }, [copy.parseFailed, exercises, weightText, weightUnit, workoutText]);

  const unresolved =
    parsed?.matches.filter((match) => match.status !== "auto") ?? [];
  const autoMatched =
    parsed?.matches.filter((match) => match.status === "auto") ?? [];
  const canSubmit = Boolean(parsed?.draft && !parsed.error);

  // Лічильники рахуються з резолвленого вибору, а не з файлу: пропущені
  // назви забирають зі собою всі свої підходи, а тренування без жодної
  // зіставленої вправи не створюється взагалі (`buildStrongImportState`).
  // Число над кнопкою підтвердження має описувати запис, а не вхідний CSV.
  const totals = useMemo(() => {
    if (!parsed?.draft) return null;
    const auto = new Map(
      parsed.matches.map((match) => [match.strongName, match.autoExerciseId]),
    );
    let workouts = 0;
    let sets = 0;
    for (const workout of parsed.draft.workouts) {
      const kept = workout.items.filter(
        (item) => selection[item.strongName] ?? auto.get(item.strongName),
      );
      if (kept.length === 0) continue;
      workouts += 1;
      for (const item of kept) sets += item.sets.length;
    }
    return { workouts, sets };
  }, [parsed, selection]);

  const readFile = async (
    event: ChangeEvent<HTMLInputElement>,
    setter: (text: string) => void,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setter(await file.text());
  };

  const selectedExerciseId = (match: StrongExerciseMatch): string =>
    selection[match.strongName] ?? match.autoExerciseId ?? "";

  const submit = () => {
    if (!parsed?.draft || parsed.error) return;
    const result = commitStrongImport(
      parsed.draft,
      parsed.matches,
      selection,
      parsed.weightDraft,
      exercises,
    );
    toast.success(
      `${copy.savedPrefix} ${result.importedWorkoutCount} ${copy.workoutsShort}, ${result.importedSetCount} ${copy.setsShort}.`,
    );
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      size="xl"
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" className="h-11" onClick={onClose}>
            {messages.actions.cancel}
          </Button>
          <Button
            module="fizruk"
            className="h-11"
            disabled={!canSubmit}
            onClick={submit}
          >
            {copy.confirm}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1.5 text-style-caption text-text">
            <span>{copy.workoutFile}</span>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void readFile(event, setWorkoutText)}
            />
          </label>
          <label className="block space-y-1.5 text-style-caption text-text">
            <span>{copy.weightFile}</span>
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => void readFile(event, setWeightText)}
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-style-caption font-semibold text-text">
            {copy.weightUnit}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
            {(["kg", "lb"] as const).map((unit) => (
              <button
                key={unit}
                type="button"
                aria-pressed={weightUnit === unit}
                onClick={() => setWeightUnit(unit)}
                className="h-11 rounded-xl border border-line bg-bg px-3 text-style-body text-text transition-colors hover:bg-panelHi focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg aria-pressed:border-fizruk-ring aria-pressed:bg-fizruk/15 aria-pressed:text-fizruk-strong"
              >
                {unit}
              </button>
            ))}
          </div>
        </fieldset>

        {parsed?.error ? (
          <p className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-style-caption text-danger-strong">
            {parsed.error}
          </p>
        ) : null}

        {parsed?.draft ? (
          <div className="grid gap-2 sm:grid-cols-4">
            <Stat label={copy.workouts} value={totals?.workouts ?? 0} />
            <Stat label={copy.sets} value={totals?.sets ?? 0} />
            <Stat
              label={copy.restTimers}
              value={parsed.draft.skippedRestTimerRows}
            />
            <Stat
              label={copy.weightRows}
              value={parsed.weightDraft?.measurements.length ?? 0}
            />
          </div>
        ) : null}

        {unresolved.length > 0 ? (
          <MatchList
            title={copy.unresolvedTitle}
            matches={unresolved}
            exercises={exercises}
            selectedExerciseId={selectedExerciseId}
            onSelect={(name, id) =>
              setSelection((prev) => ({ ...prev, [name]: id }))
            }
          />
        ) : parsed?.draft ? (
          <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-style-caption text-success-strong">
            {copy.allMatched}
          </p>
        ) : null}

        {/* Автозбіги теж у списку: приховане зіставлення не видно і не
            виправити, а промах матчера тихо пише не ту вправу. */}
        {autoMatched.length > 0 ? (
          <MatchList
            title={copy.autoMatchedTitle}
            matches={autoMatched}
            exercises={exercises}
            selectedExerciseId={selectedExerciseId}
            onSelect={(name, id) =>
              setSelection((prev) => ({ ...prev, [name]: id }))
            }
          />
        ) : null}
      </div>
    </Modal>
  );
}

function MatchList({
  title,
  matches,
  exercises,
  selectedExerciseId,
  onSelect,
}: {
  readonly title: string;
  readonly matches: readonly StrongExerciseMatch[];
  readonly exercises: readonly FizrukData.RawExerciseDef[];
  readonly selectedExerciseId: (match: StrongExerciseMatch) => string;
  readonly onSelect: (strongName: string, exerciseId: string | null) => void;
}) {
  const copy = messages.fizruk.strongImport;
  return (
    <div className="space-y-2">
      <h3 className="text-style-label text-text">{title}</h3>
      <ul className="divide-y divide-line rounded-2xl border border-line">
        {matches.map((match) => (
          <li key={match.strongName} className="space-y-2 p-3">
            <div className="text-style-body font-semibold text-text">
              {match.strongName}
            </div>
            <Select
              value={selectedExerciseId(match)}
              aria-label={`${copy.chooseExerciseAriaPrefix} ${match.strongName}`}
              onChange={(event) =>
                onSelect(match.strongName, event.target.value || null)
              }
            >
              <option value="">{copy.skipExercise}</option>
              {exerciseOptions(match, exercises).map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name?.uk || exercise.name?.en || exercise.id}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) {
  return (
    <div className="rounded-xl border border-line bg-panelHi/40 p-3">
      <div className="text-style-caption text-subtle">{label}</div>
      <div className="mt-1 text-style-title font-extrabold text-text tabular-nums">
        {value}
      </div>
    </div>
  );
}

function exerciseOptions(
  match: StrongExerciseMatch,
  exercises: readonly FizrukData.RawExerciseDef[],
): readonly FizrukData.RawExerciseDef[] {
  const seen = new Set<string>();
  const out: FizrukData.RawExerciseDef[] = [];
  for (const exercise of [...match.candidates, ...exercises]) {
    if (seen.has(exercise.id)) continue;
    seen.add(exercise.id);
    out.push(exercise);
  }
  return out;
}
