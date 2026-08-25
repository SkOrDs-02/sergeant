/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, track B (spec § Рішення дизайну
 * «Unmatched-чеки — першокласний стан»).
 *
 * "Чеки без транзакції" — receipts the deterministic matcher
 * (`@sergeant/finyk-domain` matcher, server-side) couldn't attach to a
 * mono transaction: family loyalty card / cash / another bank / "Власний
 * Рахунок". This is a normal, expected outcome (платник ≠ покупець), not
 * an error — the section proposes a manual expense per receipt, it never
 * creates one silently. Lives under the Silpo settings card because that's
 * where the user already expects Silpo-sourced surfaces to live; it's
 * gated by the SAME "connected" status as the rest of the card.
 */
import { useState } from "react";
import { toKyivISODate } from "@sergeant/shared";
import type { ManualExpenseKind } from "@sergeant/finyk-domain/domain/transactions";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { useSilpoReceipts } from "@finyk/hooks/useSilpoReceipts";
import { ManualExpenseSheet } from "@finyk/components/ManualExpenseSheet";

export interface ManualExpenseDraft {
  id?: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  kind: ManualExpenseKind;
}

export interface SilpoUnmatchedReceiptsProps {
  /** Same gate as the rest of the card — only fetch once actually
   * `"connected"` (no point querying receipts otherwise). */
  enabled: boolean;
  addManualExpense: (expense: ManualExpenseDraft) => void;
}

function formatReceiptDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    timeZone: "Europe/Kyiv",
  });
}

export function SilpoUnmatchedReceipts({
  enabled,
  addManualExpense,
}: SilpoUnmatchedReceiptsProps) {
  const copy = messages.finyk.silpoUnmatchedReceipts;
  const { receipts } = useSilpoReceipts({ limit: 100 }, { enabled });
  const unmatched = receipts.filter(
    (receipt) => receipt.transactionId === null,
  );
  const [openReceiptId, setOpenReceiptId] = useState<string | null>(null);
  const openReceipt =
    unmatched.find((receipt) => receipt.receiptId === openReceiptId) ?? null;

  if (!enabled || unmatched.length === 0) return null;

  return (
    <>
      <details className="rounded-xl border border-line bg-panel p-3">
        <summary className="touch-target flex cursor-pointer items-center justify-between gap-2 text-style-label text-text marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk">
          <span className="flex min-w-0 items-center gap-2">
            <Icon
              name="file-text"
              size={16}
              className="text-muted shrink-0"
              aria-hidden
            />
            {copy.title}
          </span>
          <span className="shrink-0 text-style-caption text-subtle">
            {unmatched.length} {copy.countSuffix}
          </span>
        </summary>
        <p className="mt-2 text-style-caption text-subtle leading-snug">
          {copy.hint}
        </p>
        <ul className="mt-3 space-y-2">
          {unmatched.map((receipt) => (
            <li
              key={receipt.receiptId}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panelHi p-2"
            >
              <div className="min-w-0">
                <p className="text-style-body tabular-nums text-text">
                  <Money amount={receipt.totalKop / 100} kopecks />
                </p>
                <p className="text-style-caption text-subtle">
                  {formatReceiptDate(receipt.purchasedAt)}
                </p>
              </div>
              <Button
                variant="secondary"
                module="finyk"
                size="xs"
                className="shrink-0"
                onClick={() => setOpenReceiptId(receipt.receiptId)}
              >
                {copy.createExpense}
              </Button>
            </li>
          ))}
        </ul>
      </details>

      {openReceipt && (
        <ManualExpenseSheet
          open
          onClose={() => setOpenReceiptId(null)}
          onSave={(expense) => {
            addManualExpense(expense);
            setOpenReceiptId(null);
          }}
          // "food" (не «groceries» — той самий кошик, але legacy-слаг, якого
          // немає в опціях пікера; вибраний у `<select>` він показав би
          // порожній стан замість «Продукти», хоча стан форми був би
          // правильним. Див. `manualExpenseCategories.ts` § CATEGORY_SLUGS).
          initialCategory="food"
          initialDescription={`${copy.manualExpenseDescriptionPrefix} ${openReceipt.receiptId}`}
          initialAmount={openReceipt.totalKop / 100}
          initialDate={toKyivISODate(openReceipt.purchasedAt)}
        />
      )}
    </>
  );
}
