/* eslint-disable sergeant-design/no-eyebrow-drift */
import { cn } from "@shared/lib/cn";

interface Props {
  label: string;
  value: string | number;
  accent?: boolean;
}

export function StatRow({ label, value, accent }: Props) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/10 last:border-b-0">
      <span className="text-style-label uppercase tracking-wide text-white/70">
        {label}
      </span>
      <span
        className={cn(
          "text-base font-bold tabular-nums",
          accent ? "text-white" : "text-white/95",
        )}
      >
        {value}
      </span>
    </div>
  );
}
