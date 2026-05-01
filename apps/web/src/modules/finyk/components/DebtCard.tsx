import { memo } from "react";
import { cn } from "@shared/lib/cn";

function formatDueDate(dueDate: string | null | undefined) {
  if (!dueDate) return null;
  const now = new Date();
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `Прострочено на ${Math.abs(days)} дн`;
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  return `Через ${days} дн`;
}

function formatDueDateValue(dueDate: string | null | undefined) {
  if (!dueDate) return "";
  const [y, m, d] = dueDate.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("uk-UA");
}

interface DebtCardProps {
  name: string;
  emoji: string;
  remaining: number;
  paid: number;
  total: number;
  onDelete?: () => void;
  onLink?: () => void;
  linkedCount?: number;
  isReceivable?: boolean;
  dueDate?: string | null;
  showBalance?: boolean;
}

// Чиста картка боргу / заборгованості — рендер повністю керується пропсами,
// тому memo безпечно зрізає перерендери при оновленнях батька.
function DebtCardComponent({
  name,
  emoji,
  remaining,
  paid,
  total,
  onDelete,
  onLink,
  linkedCount,
  isReceivable,
  dueDate,
  showBalance = true,
}: DebtCardProps) {
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  const dueText = formatDueDate(dueDate);
  const isOverdue = dueText?.includes("Прострочено");

  return (
    <div className="bg-panel border border-line rounded-xl p-4 mb-3">
      <div className="flex items-start justify-between mb-3">
        <span className="text-sm font-semibold leading-snug">
          {emoji ? `${emoji} ` : ""}
          {name}
        </span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span
            className={cn(
              "text-sm font-bold tabular-nums",
              isReceivable ? "text-success" : "text-danger",
            )}
          >
            {showBalance
              ? `${isReceivable ? "+" : "−"}${remaining.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`
              : "••••"}
          </span>
          {onDelete && (
            <button
              onClick={onDelete}
              className="text-subtle hover:text-danger text-sm transition-colors"
            >
              🗑
            </button>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-line rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-[width,background-color] duration-500",
            isReceivable ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs text-subtle mt-2">
        {isReceivable ? "Отримано" : "Сплачено"}{" "}
        {showBalance
          ? `${paid.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} з ${total.toLocaleString("uk-UA")} ₴`
          : "••••"}
      </div>
      {dueText && (
        <div
          className={cn(
            "text-xs mt-1",
            isOverdue ? "text-danger" : "text-muted",
          )}
        >
          📅 {formatDueDateValue(dueDate)} · {dueText}
        </div>
      )}
      {onLink && (
        <button
          onClick={onLink}
          className="mt-3 w-full text-xs text-muted border border-dashed border-line rounded-xl py-2 hover:border-primary hover:text-primary transition-colors"
        >
          🔗 Прив&apos;язати транзакції ({linkedCount || 0})
        </button>
      )}
    </div>
  );
}

export const DebtCard = memo(DebtCardComponent);
