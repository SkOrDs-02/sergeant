/**
 * Last validated: 2026-08-03
 * Status: Active
 *
 * Гліф звички / категорії. Замінює сирий `{h.emoji}` у рядках списків,
 * заголовках шитів і опціях селектів.
 *
 * Приймає СИРЕ значення з даних (`habit.emoji` / `category.emoji`), бо
 * нормалізація по дорозі не гарантована: чат-тули й старі клієнти ще вміють
 * покласти туди emoji. `resolveHabitGlyph` розбирається з обома формами.
 */
import { resolveHabitGlyph, upgradeHabitGlyph } from "@sergeant/routine-domain";
import { Icon, type IconSize } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { routineGlyphLabel } from "../lib/habitGlyphs";

export interface HabitGlyphProps {
  /** Сире значення гліфа з даних (slug або легасі-emoji). */
  value: string | null | undefined;
  size?: IconSize;
  className?: string;
  /**
   * Коли `true` — гліф оголошується скрінрідеру своїм підписом. За
   * замовчуванням декоративний: поруч завжди стоїть назва звички, і
   * дублювати «Вода Пити воду» немає сенсу.
   */
  labelled?: boolean;
  /**
   * Не малювати нічого, якщо значення порожнє / невідоме. Для категорій,
   * де іконка необовʼязкова — дефолтна «пташка» там читалась би як
   * «виконано».
   */
  optional?: boolean;
}

export function HabitGlyph({
  value,
  size = "md",
  className,
  labelled = false,
  optional = false,
}: HabitGlyphProps) {
  const glyph = optional ? upgradeHabitGlyph(value) : resolveHabitGlyph(value);
  if (!glyph) return null;

  const label = routineGlyphLabel(glyph);
  return (
    <Icon
      name={glyph}
      size={size}
      className={cn("shrink-0", className)}
      {...(labelled ? { title: label } : { "aria-hidden": true })}
    />
  );
}
