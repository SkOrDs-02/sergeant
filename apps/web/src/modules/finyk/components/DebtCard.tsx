import { memo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";

function formatDueDate(dueDate: string | null | undefined) {
  if (!dueDate) return null;
  const parts = dueDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  // Compare against Kyiv-local today to respect Europe/Kyiv day boundaries.
  const todayParts = getKyivDateParts();
  const today = new Date(todayParts.year, todayParts.month - 1, todayParts.day);
  const days = Math.ceil((date.getTime() - today.getTime()) / 86400000);
  if (days < 0) return `Прострочено на ${Math.abs(days)} дн`;
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  return `Через ${days} дн`;
}

function formatDueDateValue(dueDate: string | null | undefined) {
  if (!dueDate) return "";
  const parts = dueDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return new Date(y, m - 1, d).toLocaleDateString("uk-UA");
}

interface DebtCardProps {
  name: string;
  emoji: string;
  remaining: number;
  paid: number;
  total: number;
  onDelete?: (() => void) | undefined;
  onEdit?: (() => void) | undefined;
  onLink?: (() => void) | undefined;
  linkedCount?: number | undefined;
  isReceivable?: boolean | undefined;
  dueDate?: string | null | undefined;
  showBalance?: boolean | undefined;
}

// Чиста картка боргу / заборгованості — рендер повністю керується пропсами,
// тому memo безпечно зрізає перерендери при оновленнях батька.
function DebtCardComponent({
  name,
  remaining,
  paid,
  total,
  onDelete,
  onEdit,
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
        <span className="text-style-label leading-snug">{name}</span>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          <span
            className={cn(
              "text-style-label tabular-nums",
              isReceivable
                ? "text-success-strong dark:text-success"
                : "text-danger-strong dark:text-danger",
            )}
          >
            {showBalance
              ? `${isReceivable ? "+" : "−"}${remaining.toLocaleString("uk-UA", { maximumFractionDigits: 0 })} ₴`
              : "••••"}
          </span>
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="text-subtle hover:text-text"
              aria-label={`Редагувати ${name}`}
            >
              <Icon name="edit" size={16} aria-hidden />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-subtle hover:text-danger text-sm transition-colors"
              aria-label={`Видалити ${name}`}
            >
              <Icon name="trash" size={16} aria-hidden />
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
            isOverdue ? "text-danger-strong dark:text-danger" : "text-muted",
          )}
        >
          <Icon name="calendar" size={13} aria-hidden />{" "}
          {formatDueDateValue(dueDate)} · {dueText}
        </div>
      )}
      {onLink && (
        <button
          onClick={onLink}
          className="mt-3 w-full text-xs text-muted border border-dashed border-line rounded-xl py-2 hover:border-primary hover:text-primary transition-colors"
        >
          <Icon name="link" size={14} aria-hidden /> Привʼязати транзакції (
          {linkedCount || 0})
        </button>
      )}
    </div>
  );
}

export const DebtCard = memo(DebtCardComponent);
