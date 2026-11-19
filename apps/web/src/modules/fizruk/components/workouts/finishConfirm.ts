/**
 * Last validated: 2026-11-18
 * Status: Active
 *
 * Фз-2 (OD-28): підсумок у підтвердженні «Завершити зараз?» і вікно на
 * «Повернутись у сесію». Число 10 с задане рішенням власника.
 */
import { pluralUa } from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";
import { fmt } from "../../lib/numberFmt";
import { formatWorkoutItemsCount } from "../../lib/workoutItemsLabel";

/** Скільки після завершення можна повернутись у сесію (рішення OD-28). */
export const FINISH_UNDO_WINDOW_MS = 10_000;

export interface FinishConfirmFacts {
  durationSec: number;
  items: number;
  /**
   * Вправи з хоча б одним зарахованим підходом (`computeWorkoutDoneItemCount`):
   * «1 з 2 вправ», як плитка «Вправ 1 з 2» підсумку (2026-11-19).
   */
  doneItems: number;
  /** Зараховані підходи (`computeWorkoutSetCount`), не рядки. */
  sets: number;
  tonnageKg: number;
}

/** «30 хв · 1 вправа · 2 підходи · 870 кг×повт» */
export function buildFinishConfirmSummary(f: FinishConfirmFacts): string {
  const c = messages.fizruk.finishConfirm;
  const minutes = Math.floor(Math.max(0, f.durationSec) / 60);
  const parts = [
    minutes > 0
      ? c.minutes.replace("{n}", String(minutes))
      : c.seconds.replace("{n}", String(Math.max(0, f.durationSec))),
    formatWorkoutItemsCount(f.doneItems, f.items),
    `${f.sets} ${pluralUa(f.sets, { one: c.setOne, few: c.setFew, many: c.setMany })}`,
  ];
  if (f.tonnageKg > 0) {
    parts.push(
      `${fmt(Math.round(f.tonnageKg))} ${messages.fizruk.workoutSummary.kgUnit}`,
    );
  }
  return parts.join(" · ");
}

/** Друге речення підтвердження: скільки секунд буде на повернення. */
export function finishUndoHint(): string {
  return messages.fizruk.finishConfirm.undoHint.replace(
    "{sec}",
    String(FINISH_UNDO_WINDOW_MS / 1000),
  );
}
