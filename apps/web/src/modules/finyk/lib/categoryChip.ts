/**
 * Last validated: 2026-08-11
 * Status: Active
 *
 * Кольорові чипи категорій — міст між токенами `categoryColors` і CSS.
 *
 * Чому CSS-змінні, а не два набори класів. Колір категорії приходить із
 * даних (id категорії, включно з кастомними), тож Tailwind-класу під
 * нього не існує — його не можна ані згенерувати статично, ані знайти
 * сканером. Інлайн-стиль теж не рятує: у ньому немає темної теми, а пари
 * `tint/ink` і `tintDark/inkDark` різні. Тому стиль публікує чотири
 * змінні, а перемикання між ними робить `.cat-chip` у `components.css`
 * через `.dark &`. Хекси беруться з токенів — сирих значень тут немає.
 */
import type { CSSProperties } from "react";
import { getCatTiers } from "@sergeant/finyk-domain/domain/categories";

/**
 * Змінні одного чипа. `idx` потрібен лише для кастомних категорій —
 * вбудовані мають власний тир і індекс ігнорують.
 */
export function catChipVars(categoryId: string, idx = 0): CSSProperties {
  const t = getCatTiers(categoryId, idx);
  return {
    "--cat-tint": t.tint,
    "--cat-border": t.border,
    "--cat-ink": t.ink,
    "--cat-tint-dark": t.tintDark,
    "--cat-ink-dark": t.inkDark,
  } as CSSProperties;
}
