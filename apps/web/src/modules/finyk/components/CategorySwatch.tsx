import { cn } from "@shared/lib/ui/cn";
import { catChipVars } from "../lib/categoryChip";

/**
 * Свотч категорії 10 px перед її назвою (redesign v3.1 § Кольори категорій):
 * рядок операції, поле «Категорія», бари Аналізу, ліміти Плану. Колір іде
 * з `categoryColors` через `.cat-dot`, тож темна тема перемикається сама.
 * Назва поруч лишається чорнилом або другим сірим, без плашок.
 */
export function CategorySwatch({
  categoryId,
  customCategories,
  className,
}: {
  categoryId: string;
  /** Джерело стабільного відтінку кастомних категорій (див. `catChipVars`). */
  customCategories?: readonly { id: string }[] | undefined;
  className?: string | undefined;
}) {
  return (
    <span
      aria-hidden
      data-testid="category-swatch"
      style={catChipVars(categoryId, customCategories)}
      className={cn("cat-dot h-2.5 w-2.5 shrink-0 rounded-mark", className)}
    />
  );
}
