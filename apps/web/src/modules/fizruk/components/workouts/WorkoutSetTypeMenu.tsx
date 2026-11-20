/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Тип підходу в рядку (`WorkoutSetRow.tsx`): номер підходу — тригер, тап
 * розгортає під рядком панель «Звичайний · Розминка · Дроп · До відмови»
 * (дефолт П-Фз3-6 (А) від 2026-11-19, спека
 * `docs/work/specs/fizruk-set-done-flag-and-set-type.md`). Той самий патерн,
 * що панель RPE (`WorkoutSetRpeMenu`): `basis-full order-last` у рядку з
 * `flex-wrap`, нічого не перекриває. Типізований підхід показує літеру
 * замість номера («Р», «Д», «В»), повна назва — в aria-label і `title`.
 *
 * AI-CONTEXT: тип лише позначка, крім розминки: її рахує лише відновлення
 * (рішення власника 2026-11-19, П-Фз3-1…3, `isWorkingSet` у домені). Тут
 * нічого не рахується.
 */
import { useId, useRef, useState, type KeyboardEvent } from "react";
import type { WorkoutSetType } from "@sergeant/shared";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";

/** Ширина клітинки номера: шапка колонок бере той самий клас. */
export const SET_NUMBER_CELL_CLASS = "w-6 shrink-0 pointer-coarse:w-11";

const OPTIONS: readonly (WorkoutSetType | null)[] = [
  null,
  "warmup",
  "drop",
  "failure",
];

export function setTypeName(t: WorkoutSetType | null | undefined): string {
  const c = messages.fizruk.setType;
  if (t === "warmup") return c.warmup;
  if (t === "drop") return c.drop;
  if (t === "failure") return c.failure;
  return c.normal;
}

/** Літера типу або номер підходу для звичайного. */
export function setNumberLabel(
  t: WorkoutSetType | null | undefined,
  setNumber: number,
): string {
  const c = messages.fizruk.setType;
  if (t === "warmup") return c.letterWarmup;
  if (t === "drop") return c.letterDrop;
  if (t === "failure") return c.letterFailure;
  return String(setNumber);
}

export interface WorkoutSetTypeMenuProps {
  setNumber: number;
  value: WorkoutSetType | null | undefined;
  /** Поточний рядок: жирний номер, як і до типу. */
  isCurrent: boolean;
  onChange: (value: WorkoutSetType | null) => void;
}

/** Тригер (номер чи літера) і панель вибору під рядком. */
export function WorkoutSetTypeMenu({
  setNumber,
  value,
  isCurrent,
  onChange,
}: WorkoutSetTypeMenuProps) {
  const c = messages.fizruk.setType;
  const sr = messages.fizruk.setRow;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = value ?? null;
  const name = setTypeName(current);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (t: WorkoutSetType | null) => {
    onChange(t);
    close();
  };
  const onPanelKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={c.triggerAria
          .replace("{prefix}", sr.numberAriaPrefix)
          .replace("{n}", String(setNumber))
          .replace("{type}", name.toLowerCase())}
        aria-expanded={open}
        aria-controls={panelId}
        title={current ? name : c.menuHeading}
        data-set-slot="number"
        data-set-type={current ?? undefined}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          SET_NUMBER_CELL_CLASS,
          "flex h-11 items-center justify-center rounded-lg text-style-label tabular-nums transition-colors focus-ring",
          // Розминка відрізняється пунктирною рамкою і приглушеним текстом
          // (токени `border-control`, `text-muted`), без нового кольору.
          current === "warmup"
            ? "border border-dashed border-control text-muted"
            : current
              ? "border border-line font-bold text-text"
              : isCurrent
                ? "font-bold text-text"
                : "text-subtle",
          open && "border-solid border-text",
        )}
      >
        {setNumberLabel(current, setNumber)}
      </button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={`${c.menuHeading}, ${sr.numberAriaPrefix.toLowerCase()} ${setNumber}`}
          className="order-last basis-full rounded-lg bg-panelHi px-3 pb-3 pt-2"
        >
          <p className="text-style-label font-semibold text-text">
            {c.menuHeading}
          </p>
          <p className="mb-2 text-style-caption text-subtle">{c.menuHint}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {OPTIONS.map((t) => {
              // `variant` лишається ЛІТЕРАЛОМ у кожному тегу
              // (`Button.toneRenders.test.ts`, див. `WorkoutSetRpeMenu`).
              const common = {
                type: "button" as const,
                size: "sm" as const,
                "aria-pressed": current === t,
                onClick: () => pick(t),
                onKeyDown: onPanelKeyDown,
                "data-testid": `fizruk-set-type-option-${t ?? "normal"}`,
                className: "w-full",
              };
              return current === t ? (
                <Button
                  key={t ?? "normal"}
                  {...common}
                  variant="solid"
                  tone="neutral"
                >
                  {setTypeName(t)}
                </Button>
              ) : (
                <Button
                  key={t ?? "normal"}
                  {...common}
                  variant="outline"
                  tone="neutral"
                >
                  {setTypeName(t)}
                </Button>
              );
            })}
          </div>
        </div>
      ) : null}
    </>
  );
}
