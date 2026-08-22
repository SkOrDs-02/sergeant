/**
 * Last validated: 2026-08-21
 * Status: Active
 *
 * Тонований круглий чип із іконкою категорії.
 *
 * AI-CONTEXT: до 2026-08-21 ця розмітка існувала лише всередині
 * `TxRow.tsx`. Тому рядок транзакції мав справжню SVG-іконку в кольорі
 * категорії, а картка ліміту й алерти бюджету — емодзі-префікс підпису
 * («🛒 Продукти»), який приходив із резолвера домену. Тестувальник
 * прочитав це як «у лімітах іконки є, у витратах немає». Тепер обидві
 * поверхні беруть один компонент, а підписи домену чисті від емодзі.
 *
 * Колір кола — власний колір КАТЕГОРІЇ, не акцент модуля: іконка, чип із
 * назвою і обраний чип у пікері тримають один відтінок, тож око
 * чіпляється за колір, а не перечитує підпис.
 */
import { memo } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { catChipVars } from "../lib/categoryChip";
import { CATEGORY_ICON_MAP, DEFAULT_CATEGORY_ICON_NAME } from "./txRowHelpers";

export interface CategoryIconChipProps {
  categoryId: string;
  /** Потрібен лише кастомним категоріям — з нього береться стабільний тир. */
  customCategories?: readonly { id: string }[] | undefined;
  /** Діаметр кола в px. Рядок транзакції — 28, компактні списки — 24. */
  size?: 24 | 28;
  className?: string | undefined;
}

const GLYPH_SIZE: Record<24 | 28, number> = { 24: 14, 28: 16 };

/**
 * Декоративний елемент: підпис категорії завжди стоїть поруч текстом,
 * тож чип свідомо `aria-hidden` і не дублює його для скрінрідера.
 */
function CategoryIconChipComponent({
  categoryId,
  customCategories = [],
  size = 28,
  className,
}: CategoryIconChipProps) {
  return (
    <span
      aria-hidden="true"
      style={catChipVars(categoryId, customCategories)}
      className={cn(
        "shrink-0 inline-flex items-center justify-center rounded-full cat-chip",
        size === 28 ? "w-7 h-7" : "w-6 h-6",
        className,
      )}
    >
      <Icon
        name={CATEGORY_ICON_MAP[categoryId] ?? DEFAULT_CATEGORY_ICON_NAME}
        size={GLYPH_SIZE[size]}
        strokeWidth={1.75}
      />
    </span>
  );
}

export const CategoryIconChip = memo(CategoryIconChipComponent);
