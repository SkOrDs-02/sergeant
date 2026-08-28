/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Пікер гліфа для звички та категорії — заміна emoji-пікера (звичка) і
 * вільного emoji-`<Input>` (категорія).
 *
 * Чому не текстове поле: воно приймало БУДЬ-ЩО. Користувач міг вписати
 * «домашні справи» у поле шириною 4rem, і рядок категорії ламався. Закритий
 * набір іконок робить некоректний стан неможливим, а не валідованим.
 *
 * Розкладка й поведінка (non-modal `role="dialog"`, Escape, focus-trap,
 * клік поза межами) успадковані від колишнього emoji-пікера в `HabitForm`,
 * щоб клавіатурний досвід не змінився.
 */
import { useRef, useState } from "react";
import { ROUTINE_GLYPHS, type RoutineGlyph } from "@sergeant/routine-domain";
import { Icon } from "@shared/components/ui/Icon";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { useOutsideClick } from "@shared/hooks/useOutsideClick";
import { cn } from "@shared/lib/ui/cn";
import { routineGlyphLabel } from "../lib/habitGlyphs";
import { HabitGlyph } from "./HabitGlyph";

export interface HabitGlyphPickerProps {
  /** Сире значення з даних (slug або легасі-emoji). */
  value: string | null | undefined;
  onChange: (glyph: RoutineGlyph) => void;
  /** Підпис кнопки-тригера для скрінрідера. */
  label?: string;
  /** Коли `true`, порожнє значення малює нейтральний плейсхолдер. */
  optional?: boolean;
  className?: string;
}

export function HabitGlyphPicker({
  value,
  onChange,
  label = "Обрати іконку",
  optional = false,
  className,
}: HabitGlyphPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useDialogFocusTrap(open, panelRef, {
    onEscape: () => {
      setOpen(false);
      triggerRef.current?.focus();
    },
  });

  useOutsideClick(wrapRef, () => setOpen(false), { enabled: open });

  return (
    <div className={cn("relative shrink-0", className)} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className={cn(
          "routine-touch-field flex w-12 shrink-0 items-center justify-center",
          "rounded-2xl border border-line bg-panelHi text-text",
          "transition-colors hover:bg-panel",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
        )}
      >
        {optional && !value ? (
          <Icon name="plus" size={18} className="text-muted" aria-hidden />
        ) : (
          <HabitGlyph value={value} size={20} />
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={label}
          className={cn(
            "absolute left-0 z-30 mt-2 w-[17rem]",
            "grid grid-cols-6 gap-1 rounded-2xl border border-line bg-panel p-2 shadow-float",
          )}
        >
          {ROUTINE_GLYPHS.map((glyph) => (
            <button
              key={glyph}
              type="button"
              onClick={() => {
                onChange(glyph);
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label={routineGlyphLabel(glyph)}
              aria-pressed={value === glyph}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl text-text",
                "transition-colors hover:bg-panelHi",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
                value === glyph && "bg-panelHi ring-1 ring-line",
              )}
            >
              <Icon name={glyph} size={18} aria-hidden />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
