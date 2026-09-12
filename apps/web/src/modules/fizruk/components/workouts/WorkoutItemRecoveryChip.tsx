/**
 * Last validated: 2026-09-11
 * Status: Active
 */
import {
  recoveryConflictsForWorkoutItem,
  type WorkoutItem,
} from "@sergeant/fizruk-domain";
import { Icon } from "@shared/components/ui/Icon";
import { Popover } from "@shared/components/ui/Popover";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

export interface WorkoutItemRecoveryChipProps {
  it: WorkoutItem;
  recBy: Record<string, unknown>;
}

export interface RecoveryChipSummary {
  /** `red` — біль або «ще рано»; `yellow` — «краще почекати». */
  tone: "red" | "yellow";
  /** Короткий текст чипа: «Позначено біль», «Ще рано: Груди», … */
  label: string;
}

/**
 * Один короткий рядок для чипа та для рядка списку вправ. Жовтий
 * трикутник без слів не пояснював себе (звіт founder-а 2026-09-03), тож
 * чип тепер називає причину: біль, «ще рано» з мʼязами або «відновлюються».
 * Логіка конфліктів не змінюється — лише подача.
 */
export function summarizeRecoveryChip(
  it: WorkoutItem,
  recBy: Record<string, unknown>,
): RecoveryChipSummary | null {
  const cf = recoveryConflictsForWorkoutItem(
    it,
    recBy as Parameters<typeof recoveryConflictsForWorkoutItem>[1],
  );
  if (!cf.hasWarning) return null;
  const ss = messages.fizruk.session;
  if (cf.injury.blocked) return { tone: "red", label: ss.injuryPrefix };
  if (cf.red.length > 0) {
    return {
      tone: "red",
      label: `${ss.tooEarlyPrefix} ${cf.red.map((x) => x.label).join(", ")}`,
    };
  }
  return {
    tone: "yellow",
    label: `${ss.recoveringPrefix} ${cf.yellow.map((x) => x.label).join(", ")}`,
  };
}

/**
 * Labeled recovery-warning chip rendered under the exercise title inside
 * the session exercise screen. Canon `fizruk.md` §4 — recovery is advice,
 * not a gate — so it stays a chip, not a banner; the full muscle
 * breakdown lives behind a tap.
 */
export function WorkoutItemRecoveryChip({
  it,
  recBy,
}: WorkoutItemRecoveryChipProps) {
  const cf = recoveryConflictsForWorkoutItem(
    it,
    recBy as Parameters<typeof recoveryConflictsForWorkoutItem>[1],
  );
  const summary = summarizeRecoveryChip(it, recBy);
  if (!cf.hasWarning || !summary) return null;

  const rc = messages.fizruk.recoveryChip;
  const isRed = summary.tone === "red";
  const redLabel = cf.red.map((x) => x.label).join(", ");
  const yellowLabel = cf.yellow.map((x) => x.label).join(", ");

  return (
    <Popover
      placement="bottom-start"
      role="dialog"
      label={rc.detailAriaLabel}
      wrapperClassName="inline-flex max-w-full"
      trigger={
        <span
          // `aria-label` ЗАМІНЮЄ внутрішній текст для скрінрідера, тож без
          // причини в ньому озвучувалось лише загальне «попередження» —
          // тобто рівно те, що ця зміна й мала прибрати.
          aria-label={`${rc.triggerAriaLabel}: ${summary.label}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 min-h-[28px] cursor-pointer select-none text-style-caption font-semibold",
            isRed
              ? "border-danger/40 bg-danger/10 text-danger-strong dark:text-danger"
              : "border-warning/40 bg-warning/10 text-warning-strong dark:text-warning",
          )}
        >
          <Icon name="alert-triangle" size={12} aria-hidden />
          <span className="truncate">{summary.label}</span>
        </span>
      }
    >
      <div className="max-w-[260px] px-3.5 py-2.5 text-style-caption leading-snug text-text">
        {cf.injury.blocked ? (
          <div className="font-semibold text-danger-strong dark:text-danger">
            {rc.injuryLine}
          </div>
        ) : null}
        {cf.red.length ? (
          <div className={cf.injury.blocked ? "mt-1.5" : ""}>
            <span className="font-semibold">{rc.redPrefix}</span> {redLabel}
          </div>
        ) : null}
        {cf.yellow.length ? (
          <div className="mt-1.5">
            <span className="font-semibold">{rc.yellowPrefix}</span>{" "}
            {yellowLabel}
          </div>
        ) : null}
      </div>
    </Popover>
  );
}
