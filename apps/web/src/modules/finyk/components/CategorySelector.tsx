import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { stripLeadingEmoji } from "./txRowHelpers";

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
  /**
   * Доступна назва селекта. За замовчуванням — `placeholder`: видимого
   * `<label>` тут немає за дизайном, а перший `<option>` НЕ стає іменем
   * поля для скрінрідера (аудит доступності 2026-08-26 — поле лишалось
   * безіменним, на відміну від сусіднього «Період» у тій самій формі).
   */
  ariaLabel?: string;
}

// Тонкий <select>-обгортач: рендер повністю залежить від пропсів,
// memo робить його дешевшим у формах з частими ре-рендерами.
function CategorySelectorComponent({
  value,
  onChange,
  categories = [],
  className,
  // PR-31 / §C6 — узгоджено з `validation.categoryRequired`.
  placeholder = "Обери категорію",
  ariaLabel,
}: CategorySelectorProps) {
  return (
    <select
      // `?? ` ловить лише null/undefined: порожній чи пробільний рядок від
      // виклику лишив би поле безіменним — тобто рівно тим дефектом, який
      // цей проп і закриває (ревʼю CodeRabbit 2026-08-26).
      aria-label={ariaLabel?.trim() || placeholder}
      className={cn(
        "input-focus-finyk w-full h-10 pointer-coarse:min-h-[44px] rounded-xl border border-line bg-bg px-3 text-sm text-text",
        className,
      )}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {/* Нативний `<option>` малює лише текст, іконку сюди не
              вставити. Вбудовані підписи чисті від емодзі з 2026-08-21;
              зріз лишається для назв кастомних категорій, щоб список не
              був наполовину з гліфами, наполовину без. */}
          {c.label ? stripLeadingEmoji(c.label) : c.label}
        </option>
      ))}
    </select>
  );
}

export const CategorySelector = memo(CategorySelectorComponent);
