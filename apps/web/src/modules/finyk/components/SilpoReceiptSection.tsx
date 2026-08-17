/**
 * Last validated: 2026-08-17
 * Status: Active — walking-skeleton experiment (Silpo MCP integration,
 * track A). See `docs/90-work/planning/specs/silpo-mcp-integration.md`.
 *
 * "Чек" section inside `BankTransactionDetailsSheet` — shows Silpo receipt
 * line items for a matched mono transaction. Renders nothing when there's
 * no link (no Silpo account connected, no match found, or the integration
 * is off) — this is a first-class "nothing to show" case, not an error
 * (spec § Рішення дизайну — "транзакція без чека виглядає як сьогодні").
 *
 * "Розбити за чеком" (auto-split from receipt categories → `TxSplit[]`) is
 * intentionally disabled here — that mutation is Track B scope, out of
 * this experiment (spec § Експеримент lists only the read-only surface).
 */
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { useSilpoReceiptForTransaction } from "@finyk/hooks/useSilpoReceipts";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";

export interface SilpoReceiptSectionProps {
  transactionId: string;
}

function formatQty(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (qty == null) return unit ?? null;
  return unit ? `${qty} ${unit}` : String(qty);
}

export function SilpoReceiptSection({
  transactionId,
}: SilpoReceiptSectionProps) {
  const copy = messages.finyk.silpoReceipt;
  const { status } = useSilpoSyncState();
  const { summary, detail, isLoading } = useSilpoReceiptForTransaction(
    transactionId,
    { enabled: status === "connected" },
  );

  if (status !== "connected" || isLoading || !summary) return null;
  const items = detail?.items ?? [];

  return (
    <section className="rounded-2xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name="shopping-cart"
            size={16}
            className="text-muted shrink-0"
            aria-hidden
          />
          <h3 className="text-style-label text-text">{copy.title}</h3>
        </div>
        <Button
          variant="secondary"
          module="finyk"
          size="xs"
          disabled
          title={copy.splitComingSoon}
        >
          <Icon name="shuffle" size={15} aria-hidden />
          {copy.splitCta}
        </Button>
      </div>

      {items.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const qtyLabel = formatQty(item.qty, item.unit);
            return (
              <li
                key={item.id}
                className="flex items-start justify-between gap-3 text-style-body"
              >
                <div className="min-w-0">
                  <p className="text-text truncate">{item.name}</p>
                  {qtyLabel && (
                    <p className="text-style-caption text-subtle">{qtyLabel}</p>
                  )}
                </div>
                <p className="shrink-0 tabular-nums text-text">
                  <Money amount={item.priceKop / 100} kopecks />
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-style-caption text-subtle">
          {copy.itemsPending}
        </p>
      )}
    </section>
  );
}
