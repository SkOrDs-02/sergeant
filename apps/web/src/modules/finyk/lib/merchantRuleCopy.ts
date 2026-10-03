/**
 * Last validated: 2026-10-01
 * Status: Active
 *
 * Дрібні помічники тексту для правил «Завжди так для цього магазину»:
 * підстановка плейсхолдерів каталогу, скорочення назви мерчанта для кнопки й
 * підпис категорії правила. Спільні для аркуша операції, тостів і списку в
 * Налаштуваннях, щоб одна й та сама назва не форматувалась тричі по-різному.
 */
import {
  resolveMerchantRuleCategory,
  type CategoryLike,
} from "@sergeant/finyk-domain/lib/categories";
import type { MerchantRuleKind } from "@sergeant/finyk-domain/lib/merchantRules";

/** Підставляє `{name}` у шаблон каталогу копі; невідомі плейсхолдери лишає як є. */
export function fillRuleCopy(
  template: string,
  vars: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in vars ? String(vars[key]) : whole,
  );
}

/**
 * Назва мерчанта для кнопки: опис операції буває довгим, а кнопка стоїть
 * в один рядок фіксованої висоти (44 px), тож довше за `max` символів
 * обрізається з «…». Повна назва лишається в списку правил.
 */
export function shortMerchantLabel(label: string, max = 28): string {
  const clean = label.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Підпис без провідного емодзі: «🛒 Продукти» → «Продукти» (так само, як у `TxRow`). */
export function categoryNameOf(
  category: Pick<CategoryLike, "label"> | null,
): string | null {
  if (!category) return null;
  const name = category.label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  return name || category.label;
}

/** Назва категорії правила або `null`, якщо категорії вже нема. */
export function merchantRuleCategoryName(
  kind: MerchantRuleKind,
  categoryId: string,
  customCategories: readonly unknown[] = [],
): string | null {
  return categoryNameOf(
    resolveMerchantRuleCategory(kind, categoryId, customCategories),
  );
}
