/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Розгортка транзакції у список позицій чека (спека § Розгортка):
 * `GET /api/finyk/receipts/:id` за `receiptId`, показаний у
 * `BankTransactionDetailsSheet` / `ManualExpenseSheet` коли транзакція
 * має привʼязаний чек (`useFinykReceiptLinks`, device-local — див. цей
 * хук для того, чому індикатор бачить лише те, що зіскановано НА ЦЬОМУ
 * пристрої).
 */
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@shared/api";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { formatReceiptError } from "../lib/receiptErrors";
import { Icon } from "@shared/components/ui/Icon";
import { Spinner } from "@shared/components/ui/Spinner";
import { Badge } from "@shared/components/ui/Badge";
import { Money } from "@shared/components/ui/Money";

export interface ReceiptItemsSectionProps {
  receiptId: number;
}

export function ReceiptItemsSection({ receiptId }: ReceiptItemsSectionProps) {
  const query = useQuery({
    queryKey: finykKeys.receipt(receiptId),
    queryFn: ({ signal }) => apiClient.finyk.getReceipt(receiptId, { signal }),
    staleTime: 5 * 60_000,
  });

  return (
    <section
      aria-labelledby="receipt-items-title"
      className="rounded-2xl border border-line bg-panel p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <h3
          id="receipt-items-title"
          className="flex items-center gap-1.5 text-style-label text-text"
        >
          <Icon name="file-text" size={15} aria-hidden />
          Позиції чека
        </h3>
        {query.data?.receipt.source === "vision" && (
          <Badge variant="warning" tone="soft" size="xs">
            з фото, перевір суми
          </Badge>
        )}
      </div>

      {query.isLoading ? (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 py-3 text-style-caption text-muted"
        >
          <Spinner size="xs" />
          <span>Завантажую позиції…</span>
        </div>
      ) : query.isError ? (
        <div className="py-2">
          <p className="text-style-caption text-danger-strong dark:text-danger">
            {formatReceiptError(query.error, "Не вдалось завантажити чек.")}
          </p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-1 touch-target text-style-caption text-primary hover:underline"
          >
            Спробуй ще раз
          </button>
        </div>
      ) : query.data && query.data.receipt.items.length > 0 ? (
        <ul className="mt-2 divide-y divide-line/60">
          {query.data.receipt.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-style-body text-text">
                  {item.name}
                </p>
                <p className="text-style-caption text-subtle tabular-nums">
                  {formatQty(item.qty)} ×{" "}
                  <Money amount={item.priceKopiykas / 100} kopecks />
                </p>
              </div>
              <p className="shrink-0 text-style-body tabular-nums text-text">
                <Money amount={item.sumKopiykas / 100} kopecks />
              </p>
            </li>
          ))}
        </ul>
      ) : query.data ? (
        <p className="py-2 text-style-caption text-muted">
          Позиції не розпізнано, лише сума й магазин.
        </p>
      ) : null}
    </section>
  );
}

/** Ціле — без дробової частини (штучні одиниці); дробове — до 3 знаків
 * (вагові товари, напр. 0.345 кг), без хвостових нулів. */
function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return qty.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}
