import { cn } from "@shared/lib/ui/cn";

export const ENERGY_LABELS = [
  "",
  "Виснажений",
  "Втомлений",
  "Нормально",
  "Добре",
  "Відмінно",
];
export const MOOD_LABELS = [
  "",
  "Пригнічений",
  "Поганий",
  "Нейтральний",
  "Гарний",
  "Чудовий",
];

export interface ScoreButtonProps {
  value: number;
  selected: boolean;
  onClick: (value: number) => void;
  label: string;
}

export function ScoreButton({
  value,
  selected,
  onClick,
  label,
}: ScoreButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={cn(
        "flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border text-xs font-semibold transition-[background-color,border-color,color,opacity]",
        selected
          ? "bg-success-strong text-white border-success-strong"
          : "border-line text-subtle hover:border-success/50 hover:text-text",
      )}
      aria-pressed={selected}
      title={label}
    >
      <span className="text-base leading-none">{value}</span>
      <span
        className={cn(
          "text-xs leading-none truncate max-w-full px-1",
          selected ? "text-white/80" : "text-muted",
        )}
      >
        {label}
      </span>
    </button>
  );
}
