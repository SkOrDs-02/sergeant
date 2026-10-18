/**
 * Last validated: 2026-10-10
 * Status: Active
 */
import { Segmented } from "@shared/components/ui/Segmented";

interface SubTab {
  id: string;
  label: string;
}

interface SubTabsProps {
  value: string;
  onChange: (id: string) => void;
  tabs: SubTab[];
  className?: string;
  ariaLabel?: string;
}

/**
 * Вкладки сторінки Їжі (`Комора` / `Покупки`, `План на день` / `Рецепти`):
 * тонка обгортка над `Segmented`, який несе і вигляд мови H, і стрілки.
 */
export function SubTabs({
  value,
  onChange,
  tabs,
  className,
  ariaLabel,
}: SubTabsProps) {
  return (
    <Segmented
      layout="bar"
      size="md"
      {...(ariaLabel !== undefined && { ariaLabel })}
      {...(className !== undefined && { className })}
      value={value}
      onChange={onChange}
      items={tabs.map((t) => ({ value: t.id, label: t.label }))}
    />
  );
}
