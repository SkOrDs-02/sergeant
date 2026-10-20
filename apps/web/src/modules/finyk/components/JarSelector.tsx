import { Select } from "@shared/components/ui/Select";
import { memo } from "react";
import { messages } from "@shared/i18n/uk";

export interface JarOption {
  id: string;
  label: string;
}

interface JarSelectorProps {
  value: string | null | undefined;
  onChange: (id: string) => void;
  jars?: readonly JarOption[];
  className?: string;
}

// Дропдаун привʼязки цілі до банки Monobank (goal-progress-auto-sync,
// design decision #3) — той самий тонкий <select>-патерн, що й
// `CategorySelector`. Порожній вибір ("") означає «Без банки».
function JarSelectorComponent({
  value,
  onChange,
  jars = [],
  className,
}: JarSelectorProps) {
  return (
    <Select
      className={className}
      aria-label={messages.finyk.jarSelector.ariaLabel}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{messages.finyk.jarSelector.noJar}</option>
      {jars.map((j) => (
        <option key={j.id} value={j.id}>
          {j.label}
        </option>
      ))}
    </Select>
  );
}

export const JarSelector = memo(JarSelectorComponent);
