/**
 * Last validated: 2026-08-25
 * Status: Active
 *
 * «Прикріпити чек» — ручне привʼязування чека Сільпо до банківської
 * операції.
 *
 * Навіщо. Детермінований matcher свідомо не вгадує: збіг суми до копійки
 * у вікні ±1 доба або нічого (спека § «Ніколи не force-match»). Усе, що
 * він чесно пропустив, досі не мало виходу — родинна карта, готівка,
 * покупка, старіша за завантажену історію банку, або пара, яку людина
 * сама зняла кнопкою «Це не той чек». Тут людина робить те, чого
 * алгоритм не має права робити за неї.
 *
 * Той самий ендпоїнт, що й «Повернути» (`POST /receipts/link/:txId`), тож
 * привʼязка ЗНІМАЄ і попереднє відхилення пари — інакше найближчий sync
 * прибрав би щойно поставлений лінк.
 *
 * Порядок у списку — за близькістю дати до операції, а не хронологічний:
 * шукають майже завжди чек «десь тоді», і сортування за |Δднів| ставить
 * потрібний на перший екран. Точний збіг суми додатково підсвічений — це
 * рівно той сигнал, за яким matcher і працює, просто тепер рішення за
 * людиною.
 */
import { useMemo } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useSilpoReceipts } from "@finyk/hooks/useSilpoReceipts";
import { useSilpoRelinkReceipt } from "@finyk/hooks/useSilpoMutations";

const COPY = messages.finyk.silpoReceiptPicker;

/** Скільки чеків тягнемо на вибір. Той самий ліміт, що й картка
 * «Чеки без транзакції» в налаштуваннях, тож запит спільний і кеш RQ
 * перевикористовується замість другого мережевого виклику. */
const RECEIPTS_LIMIT = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SilpoReceiptPickerSheetProps {
  open: boolean;
  onClose: () => void;
  transactionId: string;
  /** Сума операції в копійках, ЗАВЖДИ додатна (виклик бере `Math.abs`). */
  transactionAmountKop: number;
  /** Дата операції, ISO. Використовується лише для сортування списку. */
  transactionDateIso: string;
}

function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Europe/Kyiv",
  });
}

export function SilpoReceiptPickerSheet({
  open,
  onClose,
  transactionId,
  transactionAmountKop,
  transactionDateIso,
}: SilpoReceiptPickerSheetProps) {
  const { receipts, isLoading } = useSilpoReceipts(
    { limit: RECEIPTS_LIMIT },
    { enabled: open },
  );
  const relink = useSilpoRelinkReceipt();

  const candidates = useMemo(() => {
    const txMs = new Date(transactionDateIso).getTime();
    return receipts
      .filter((receipt) => receipt.transactionId === null)
      .map((receipt) => ({
        receipt,
        dayGap: Number.isFinite(txMs)
          ? Math.abs(new Date(receipt.purchasedAt).getTime() - txMs) / DAY_MS
          : Number.POSITIVE_INFINITY,
        exactAmount: receipt.totalKop === transactionAmountKop,
      }))
      .sort((a, b) => a.dayGap - b.dayGap);
  }, [receipts, transactionAmountKop, transactionDateIso]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={COPY.description}
    >
      <div className="p-4">
        {isLoading && (
          <p className="text-style-caption text-subtle">{COPY.loading}</p>
        )}

        {!isLoading && candidates.length === 0 && (
          <EmptyState
            size="sm"
            module="finyk"
            icon={<Icon name="file-text" size={20} />}
            title={COPY.emptyTitle}
            description={COPY.emptyHint}
          />
        )}

        {relink.isError && (
          <p role="alert" className="mb-2 text-style-caption text-danger">
            {COPY.failed}
          </p>
        )}

        <ul className="space-y-2">
          {candidates.map(({ receipt, exactAmount }) => (
            <li key={receipt.receiptId}>
              <button
                type="button"
                disabled={relink.isPending}
                onClick={() =>
                  relink.mutate(
                    { transactionId, receiptId: receipt.receiptId },
                    { onSuccess: onClose },
                  )
                }
                className={cn(
                  "touch-target flex w-full items-center justify-between gap-3 rounded-xl border p-2 text-left transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk",
                  // Точний збіг суми виділяємо рамкою модуля, а не заливкою:
                  // це підказка, а не вибір — рішення лишається за людиною.
                  exactAmount
                    ? "border-finyk bg-panelHi"
                    : "border-line bg-panelHi hover:bg-panel",
                )}
              >
                <span className="min-w-0">
                  <span className="block text-style-body tabular-nums text-text">
                    <Money amount={receipt.totalKop / 100} kopecks />
                  </span>
                  <span className="block text-style-caption text-subtle">
                    {formatReceiptDate(receipt.purchasedAt)}
                    {exactAmount ? ` · ${COPY.exactAmount}` : ""}
                  </span>
                </span>
                <Icon
                  name="chevron-right"
                  size={16}
                  className="shrink-0 text-muted"
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
