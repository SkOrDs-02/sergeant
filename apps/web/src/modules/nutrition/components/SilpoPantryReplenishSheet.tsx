/**
 * Last validated: 2026-08-18
 * Status: Active
 *
 * «Поповнити комору з покупок Сільпо» — екран підтвердження (Silpo
 * integration трек C, спека
 * `docs/90-work/planning/specs/silpo-mcp-integration.md` §
 * «Комора — через готовий ledger»).
 *
 * Флоу: список останніх чеків (дефолт — найсвіжіший) → позиції обраного
 * чека з чекбоксами (їстівне — увімкнено, побутова хімія/аптека —
 * вимкнено; `mapReceiptItemToCategory`, `@sergeant/finyk-domain`) →
 * підтвердження одним тапом пише `replenish`-події через ІСНУЮЧИЙ
 * `pantry.upsertItem` (нічого не пишеться мовчки — див.
 * `useSilpoPantryReplenish.ts`).
 */
import { useState } from "react";
import { Sheet } from "@shared/components/ui/Sheet";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import {
  useSilpoPantryReplenish,
  type SilpoReplenishRow,
} from "../hooks/useSilpoPantryReplenish";
import type { PantryItem } from "../lib/pantryTextParser";

export interface SilpoPantryReplenishSheetProps {
  open: boolean;
  onClose: () => void;
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
}

function formatQty(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (qty == null) return unit ?? null;
  return unit ? `${qty} ${unit}` : String(qty);
}

const COPY = messages.nutrition.pantryReplenish;

function ReceiptItemRow({
  row,
  onToggle,
}: {
  row: SilpoReplenishRow;
  onToggle: (itemId: number) => void;
}) {
  const qtyLabel = formatQty(row.item.qty, row.item.unit);
  return (
    <li>
      {/* Native label+checkbox — той самий touch-target-патерн, що вже
          несе `PantryParsePreview` (input min 20px усередині 44px label). */}
      <label className="flex items-center gap-2.5 px-1 touch-target rounded-xl hover:bg-panelHi/50 transition-colors cursor-pointer">
        <input
          type="checkbox"
          checked={row.checked}
          onChange={() => onToggle(row.item.id)}
          className="shrink-0 w-5 h-5 accent-nutrition"
        />
        <span className="min-w-0 flex-1 grid">
          <span
            className={cn(
              "text-style-label text-text truncate",
              !row.checked && "opacity-50",
            )}
          >
            {row.item.name}
          </span>
          <span className="text-style-caption text-subtle truncate">
            {row.matchedName
              ? `${COPY.matchedPrefix} ${row.matchedName}`
              : COPY.newPosition}
          </span>
        </span>
        {qtyLabel && (
          <span className="text-style-caption text-subtle shrink-0">
            {qtyLabel}
          </span>
        )}
      </label>
    </li>
  );
}

export function SilpoPantryReplenishSheet({
  open,
  onClose,
  pantryItems,
  upsertItem,
  busy,
}: SilpoPantryReplenishSheetProps) {
  const {
    receipts,
    receiptsLoading,
    selectedReceiptId,
    selectReceipt,
    detailLoading,
    rows,
    checkedCount,
    toggleItem,
    confirm,
    reset,
  } = useSilpoPantryReplenish({ enabled: open, pantryItems, upsertItem });

  // Sheet закрився → локальний вибір скидається, наступне відкриття
  // стартує з чистого стану (той самий render-phase-reset idiom, що
  // `PantryManagerSheet.tsx`).
  const [prevOpen, setPrevOpen] = useState(open);
  if (!open && prevOpen) {
    setPrevOpen(false);
    reset();
  } else if (open && !prevOpen) {
    setPrevOpen(true);
  }

  function handleConfirm() {
    const added = confirm();
    if (added > 0) onClose();
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.sheetTitle}
      description={COPY.sheetDescription}
      panelClassName="nutrition-sheet"
      zIndex={100}
      footer={
        <div className="flex gap-2 p-4">
          <Button
            type="button"
            variant="secondary"
            className="flex-1 h-12"
            onClick={onClose}
            disabled={busy}
          >
            {COPY.cancelCta}
          </Button>
          <Button
            type="button"
            variant="nutrition"
            className="flex-1 h-12 shadow-none hover:shadow-none dark:shadow-none"
            disabled={busy || checkedCount === 0}
            onClick={handleConfirm}
          >
            {COPY.confirmCta}
            {checkedCount > 0 ? ` (${checkedCount})` : ""}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <section>
          <h3 className="text-style-caption text-subtle mb-2">
            {COPY.receiptsHeading}
          </h3>
          {receiptsLoading ? (
            <p className="text-style-caption text-subtle">{COPY.loading}</p>
          ) : receipts.length === 0 ? (
            <EmptyState
              size="sm"
              module="nutrition"
              icon={<Icon name="shopping-cart" size={20} />}
              title={COPY.receiptsEmptyTitle}
              description={COPY.receiptsEmptyHint}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-bg overflow-hidden">
              {receipts.map((r) => {
                const active = r.receiptId === selectedReceiptId;
                return (
                  <button
                    key={r.receiptId}
                    type="button"
                    onClick={() => selectReceipt(r.receiptId)}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-4 touch-target py-2.5 border-b border-line last:border-0 hover:bg-panelHi focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-nutrition/60 transition-colors text-left",
                      active && "bg-nutrition/10",
                    )}
                    aria-pressed={active}
                  >
                    <span className="min-w-0 text-style-label text-text truncate">
                      {/* Фінансовий запис → Kyiv-час (domain invariants):
                          день чека не має плавати за TZ пристрою. */}
                      {new Date(r.purchasedAt).toLocaleDateString("uk-UA", {
                        timeZone: "Europe/Kyiv",
                      })}
                    </span>
                    <span className="shrink-0 tabular-nums text-style-caption text-subtle">
                      <Money amount={r.totalKop / 100} kopecks />
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {selectedReceiptId && (
          <section>
            <h3 className="text-style-caption text-subtle mb-2">
              {COPY.itemsHeading}
            </h3>
            {detailLoading ? (
              <p className="text-style-caption text-subtle">{COPY.loading}</p>
            ) : rows.length === 0 ? (
              <p className="text-style-caption text-subtle">
                {COPY.itemsEmpty}
              </p>
            ) : (
              <ul className="grid gap-0.5">
                {rows.map((row) => (
                  <ReceiptItemRow
                    key={row.item.id}
                    row={row}
                    onToggle={toggleItem}
                  />
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}
