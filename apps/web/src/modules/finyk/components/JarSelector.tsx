import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
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
    <select
      className={cn(
        "input-focus-finyk w-full h-10 rounded-xl border border-line bg-bg px-3 text-sm text-text",
        className,
      )}
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
    </select>
  );
}

export const JarSelector = memo(JarSelectorComponent);
