/**
 * Поля «Більше опцій» форми звички: лічильник (Р-1 (а)) і автовідмітка
 * (Р-1 (в)), міграція 170. Окремий компонент, бо `HabitForm.tsx` і так
 * великий, а ці два поля мають власну логіку чернетки.
 *
 * Лічильник: порожня ціль — звичка «так/ні» (`countTarget: null`). Одиниця
 * без цілі не зберігається (`habitDraftToPatch`).
 * Автовідмітка: одне джерело на звичку, «Ніколи» — без автовідмітки.
 */
import { useId, type Dispatch, type SetStateAction } from "react";
import {
  AUTO_MARK_SOURCES,
  type AutoMarkSource,
} from "@sergeant/routine-domain";
import { messages } from "@shared/i18n/uk";
import { FIELD_LABEL, Input } from "@shared/components/ui/Input";
import { Select } from "@shared/components/ui/Select";
import type { HabitDraft } from "../../lib/types";

const M = messages.routine;

export interface HabitCounterFieldsProps {
  habitDraft: HabitDraft;
  setHabitDraft: Dispatch<SetStateAction<HabitDraft>>;
  /** Помилка цілі з `handleSave` (не ціле ≥ 1). */
  countTargetError?: string | undefined;
}

/** Текст поля → ціль чернетки: порожньо = `null`, інакше число як є. */
export function parseCountTargetInput(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

export function HabitCounterFields({
  habitDraft,
  setHabitDraft,
  countTargetError,
}: HabitCounterFieldsProps) {
  const targetId = useId();
  const unitId = useId();
  const autoId = useId();
  const target = habitDraft.countTarget;

  return (
    <>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          id={targetId}
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          label={M.counter.targetLabel}
          className="routine-touch-field"
          value={target === null || target === undefined ? "" : String(target)}
          error={countTargetError ? true : undefined}
          helperText={countTargetError ?? M.counter.targetHint}
          onChange={(e) => {
            const countTarget = parseCountTargetInput(e.target.value);
            setHabitDraft((d) => ({ ...d, countTarget }));
          }}
        />
        <Input
          id={unitId}
          label={M.counter.unitLabel}
          className="routine-touch-field"
          placeholder={M.counter.unitPlaceholder}
          maxLength={40}
          disabled={target === null || target === undefined}
          value={habitDraft.countUnit ?? ""}
          onChange={(e) =>
            setHabitDraft((d) => ({ ...d, countUnit: e.target.value }))
          }
        />
      </div>
      <div>
        <label htmlFor={autoId} className={`${FIELD_LABEL} block`}>
          {M.autoMark.label}
        </label>
        <Select
          id={autoId}
          className="mt-1"
          value={habitDraft.autoMarkSource ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            const autoMarkSource = (
              AUTO_MARK_SOURCES as readonly string[]
            ).includes(v)
              ? (v as AutoMarkSource)
              : null;
            setHabitDraft((d) => ({ ...d, autoMarkSource }));
          }}
        >
          <option value="">{M.autoMark.none}</option>
          {AUTO_MARK_SOURCES.map((s) => (
            <option key={s} value={s}>
              {M.autoMark[s]}
            </option>
          ))}
        </Select>
        {/* AI-NOTE: caption навмисний — підказка під контролом, названий
            виняток `no-sentence-in-caption`
            (docs/design/design/density-hierarchy-spec.md §4). */}
        <span className="mt-1 block text-style-label text-subtle leading-snug">
          {M.autoMark.hint}
        </span>
      </div>
    </>
  );
}
