/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Правка підходів однієї вправи в підсумку ЗАВЕРШЕНОГО тренування (Фз-2 (б),
 * OD-28; спека `docs/work/specs/fizruk-edit-finished-workout.md`).
 *
 * Ті самі поля, що в активній сесії (`WorkoutSetRow` за типом виміру вправи),
 * та сама тиха дія «Видалити підхід N» з поверненням у тості і той самий
 * «+ Підхід». Чого тут свідомо немає: ✓ і відпочинку (людина вже не в залі,
 * як у ретро-сесії), перемикача типу (тип вирішується до першого підходу),
 * підказки наступного підходу й голосу.
 *
 * Явний прапорець і тип підходу (спека
 * `fizruk-set-done-flag-and-set-type.md`): правка зберігає `done` і
 * `setType` рядка (патч зливається з підходом), тип виправляється тапом по
 * номеру, а рядок `done: false` (план, незавершений «+ Підхід») стає
 * зробленим, коли людина вписує лічильну величину (`withDoneOnCountInput`).
 *
 * AI-CONTEXT: компонент нічого не рахує. Підсумок, історія, рекорди,
 * відновлення й стрік читають той самий журнал (`Workout`), тож після
 * `onUpdateSets` усі числа перераховуються з одного джерела. `endedAt` не
 * чіпається: патч стосується лише `sets` вправи.
 */
import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import type { WorkoutItem, WorkoutSet } from "@sergeant/fizruk-domain";
import { itemMeasure } from "@sergeant/fizruk-domain/domain";
import { messages } from "@shared/i18n/uk";
import { WorkoutSetColumnHeader, WorkoutSetRow } from "./WorkoutSetRow";
import { seedSetForAdd } from "./WorkoutItemCard";
import { withDoneOnCountInput } from "../../lib/setDoneFlag";

export interface WorkoutSummaryItemEditorProps {
  item: WorkoutItem;
  /** Новий масив підходів вправи; батько пише його в журнал. */
  onUpdateSets: (sets: WorkoutSet[]) => void;
  /** Знімок підходів ДО видалення: батько показує тост із поверненням. */
  onDeleteSet: (snapshot: WorkoutSet[]) => void;
}

const noop = () => {};

export function WorkoutSummaryItemEditor({
  item,
  onUpdateSets,
  onDeleteSet,
}: WorkoutSummaryItemEditorProps) {
  const sr = messages.fizruk.setRow;
  const copy = messages.fizruk.editFinishedSets;
  const measure = itemMeasure(item);
  const sets = item.sets || [];
  // Стабільні ключі рядків, як у `WorkoutItemCard`: підхід не має id, а
  // `key={idx}` після видалення переставив би дані між вузлами.
  const [setIds, setSetIds] = useState<string[]>(() =>
    sets.map(() => crypto.randomUUID()),
  );
  const keys = sets.map((_s, idx) => setIds[idx] ?? `set-fallback-${idx}`);

  const updateSet = (idx: number, patch: Partial<WorkoutSet>) => {
    const current = sets[idx];
    if (!current) return;
    const next = [...sets];
    next[idx] = {
      ...current,
      ...withDoneOnCountInput(current, patch, measure),
    };
    onUpdateSets(next);
  };

  return (
    <div className="mt-2 space-y-1">
      {sets.length > 0 && (
        <WorkoutSetColumnHeader measure={measure} showCheck={false} />
      )}
      {sets.map((s, idx) => (
        <WorkoutSetRow
          key={keys[idx]}
          index={idx}
          set={s}
          ghost={null}
          measure={measure}
          item={item}
          isReadOnly={false}
          isCurrent={false}
          showCheck={false}
          onChangeWeight={(weightKg) => updateSet(idx, { weightKg })}
          onChangeReps={(reps) => updateSet(idx, { reps })}
          onChangeDuration={(durationSec) => updateSet(idx, { durationSec })}
          onChangeDistance={(distanceM) => updateSet(idx, { distanceM })}
          rpe={typeof s["rpe"] === "number" ? (s["rpe"] as number) : null}
          onChangeRpe={(rpe) => updateSet(idx, { rpe })}
          onApplyGhost={noop}
          onCheckTap={noop}
          onChangeSetType={(setType) => updateSet(idx, { setType })}
        />
      ))}
      {sets.length > 0 && (
        <Button
          variant="text"
          className="-ml-2"
          aria-label={`${sr.deleteLast.replace("{n}", String(sets.length))}: ${item.nameUk}`}
          onClick={() => {
            const idx = sets.length - 1;
            if (idx < 0) return;
            const snapshot = [...sets];
            setSetIds((prev) => prev.filter((_id, i) => i !== idx));
            onUpdateSets(sets.slice(0, idx));
            onDeleteSet(snapshot);
          }}
        >
          <Icon name="trash" size="md" aria-hidden />
          {sr.deleteLast.replace("{n}", String(sets.length))}
        </Button>
      )}
      <Button
        variant="outline"
        tone="neutral"
        className="w-full h-11 min-h-[44px]"
        type="button"
        onClick={() => {
          // ✓ тут немає, тож новий рядок несе останній зарахований підхід
          // (правило ретро без ✓, рішення власника 2026-11-19); немає
          // такого — порожній рядок, який не рахується, поки немає значень.
          setSetIds((prev) => [...prev, crypto.randomUUID()]);
          onUpdateSets([...sets, seedSetForAdd(sets, item, measure, true)]);
        }}
      >
        {copy.addSet}
      </Button>
    </div>
  );
}
