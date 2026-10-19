import { memo } from "react";
import { pluralDays } from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { FinanceItemHeading } from "./FinanceItemHeading";
import { Money } from "@shared/components/ui/Money";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { formatDateShort } from "@shared/lib/time/formatDate";

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
  if (days < 0)
    return `Прострочено на ${Math.abs(days)} ${pluralDays(Math.abs(days))}`;
  if (days === 0) return "Сьогодні";
  if (days === 1) return "Завтра";
  return `Через ${days} ${pluralDays(days)}`;
}

function formatDueDateValue(dueDate: string | null | undefined) {
  if (!dueDate) return "";
  const parts = dueDate.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  return formatDateShort(new Date(y, m - 1, d), { withYear: true });
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
  const showKopecks = [remaining, paid, total].some(
    (amount) => !Number.isInteger(amount),
  );
  const dueText = formatDueDate(dueDate);
  const isOverdue = dueText?.includes("Прострочено");

  return (
    <article
      aria-label={name}
      className="border-t border-line py-4 first:border-t-0 first:pt-0 last:pb-0"
    >
      <FinanceItemHeading
        title={name}
        value={
          showBalance ? (
            <Money
              amount={isReceivable ? remaining : -remaining}
              signed
              kopecks={showKopecks}
              tone="inherit"
            />
          ) : (
            "••••"
          )
        }
        actions={
          <>
            {onEdit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconOnly
                onClick={onEdit}
                aria-label={`Редагувати ${name}`}
              >
                <Icon name="edit" size="md" aria-hidden />
              </Button>
            )}
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                className="text-subtle hover:text-danger"
                size="sm"
                iconOnly
                onClick={onDelete}
                aria-label={`Видалити ${name}`}
              >
                <Icon name="trash" size="md" aria-hidden />
              </Button>
            )}
          </>
        }
      />
      <div className="h-1.5 bg-line rounded-[3px] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-[3px] transition-[width,background-color] duration-slower",
            isReceivable ? "bg-success" : "bg-chart-finyk",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-style-caption text-subtle mt-2">
        {isReceivable ? "Отримано" : "Сплачено"}{" "}
        {showBalance ? (
          <>
            <Money amount={paid} symbol="" kopecks={showKopecks} /> з{" "}
            <Money amount={total} kopecks={showKopecks} />
          </>
        ) : (
          "••••"
        )}
      </div>
      {dueText && (
        <div
          className={cn(
            "text-style-caption mt-1",
            isOverdue ? "text-danger-strong dark:text-danger" : "text-muted",
          )}
        >
          {formatDueDateValue(dueDate)} · {dueText}
        </div>
      )}
      {onLink && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onLink}
          className="mt-3 w-full"
        >
          Привʼязати операції ({linkedCount || 0})
        </Button>
      )}
    </article>
  );
}

export const DebtCard = memo(DebtCardComponent);
