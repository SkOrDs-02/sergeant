import { memo } from "react";
import { cn } from "@shared/lib/cn";

interface CategoryOption {
  id: string;
  label?: string;
}

interface CategorySelectorProps {
  value: string | null | undefined;
  onChange: (id: string) => void;
  categories?: CategoryOption[];
  className?: string;
  placeholder?: string;
}

// Тонкий <select>-обгортач: рендер повністю залежить від пропсів,
// memo робить його дешевшим у формах з частими ре-рендерами.
function CategorySelectorComponent({
  value,
  onChange,
  categories = [],
  className,
  placeholder = "Оберіть категорію",
}: CategorySelectorProps) {
  return (
    <select
      className={cn(
        "input-focus-finyk w-full h-10 rounded-xl border border-line bg-bg px-3 text-sm text-text",
        className,
      )}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

export const CategorySelector = memo(CategorySelectorComponent);
