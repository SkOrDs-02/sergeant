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
import { resolveCatTiers } from "@sergeant/finyk-domain/domain/categories";

/**
 * Змінні одного чипа.
 *
 * `customCategories` потрібен лише кастомним категоріям — вбудовані
 * мають власний тир і список ігнорують. Але передавати його треба
 * ЗАВЖДИ, коли він під рукою: саме з нього береться стабільний
 * fallback-відтінок. Раніше тут стояв позиційний `idx`, і кожен
 * виклик рахував його по-своєму — строка транзакції давала 0, пікер
 * номер чипа, діаграма місце в сортуванні, — тож одна кастомна
 * категорія мала три різні кольори. Розбір — `resolveCatTiers`.
 */
export function catChipVars(
  categoryId: string,
  customCategories: readonly { id: string }[] = [],
): CSSProperties {
  const t = resolveCatTiers(categoryId, customCategories);
  return {
    "--cat-tint": t.tint,
    "--cat-border": t.border,
    "--cat-ink": t.ink,
    "--cat-tint-dark": t.tintDark,
    "--cat-ink-dark": t.inkDark,
  } as CSSProperties;
}
