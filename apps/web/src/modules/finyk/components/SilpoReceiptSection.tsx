/**
 * Last validated: 2026-08-18
 * Status: Active — Silpo MCP integration, track B (finyk receipt
 * enrichment). See `docs/90-work/planning/specs/silpo-mcp-integration.md`
 * § Рішення дизайну «Спліт — пропозиція, не мовчазний запис».
 *
 * "Чек" section inside `BankTransactionDetailsSheet` — shows Silpo receipt
 * line items for a matched mono transaction, plus a one-tap "Розбити за
 * чеком" proposal that turns the receipt's category breakdown into
 * `TxSplit[]` via the SAME write path `TxRowSplitEditor` uses
 * (`onSplitChange` → `setSplitTx` in `useFinykStorageMutations`) — no
 * parallel split mechanism, no server-side write (`TxSplit` is a
 * client-only, dual-write entity; the server never sees it).
 *
 * Renders nothing when there's no link (no Silpo account connected, no
 * match found, or the integration is off) — this is a first-class
 * "nothing to show" case, not an error (spec § Рішення дизайну —
 * "транзакція без чека виглядає як сьогодні").
 *
 * The proposal never writes silently: tapping "Розбити за чеком" only
 * expands a preview card (categories + sums come from
 * `suggestSplitsFromReceiptItems`, `@sergeant/finyk-domain`); the split is
 * written on an explicit "Підтвердити" tap. If the transaction already has
 * a manual split, confirming overwrites it — flagged inline so that isn't
 * silent either.
 */
import { useMemo, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Money } from "@shared/components/ui/Money";
import { messages } from "@shared/i18n/uk";
import { suggestSplitsFromReceiptItems } from "@sergeant/finyk-domain/domain/receiptSplitSuggestion";
import { canonicalManualCategoryId } from "@sergeant/finyk-domain/lib/manualTaxonomy";
import { resolveExpenseCategoryMeta } from "@sergeant/finyk-domain/domain/categories";
import type { TxSplit } from "@sergeant/finyk-domain/domain/types";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { useSilpoReceiptForTransaction } from "@finyk/hooks/useSilpoReceipts";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { CATEGORY_ICON_MAP, stripLeadingEmoji } from "./txRowHelpers";

export interface SilpoReceiptSectionProps {
  transactionId: string;
  /** Той самий сетер, що `TxRowSplitEditor` (`onSplitChange` пропа
   * `BankTransactionDetailsSheet` → `setSplitTx`). */
  onSplitChange: (id: string, splits: TxSplit[] | null) => void;
  customCategories?: readonly CustomCategoryInput[];
  /** Кількість наявних часток ручного спліту — якщо >0, підтвердження
   * пропозиції його замінить, і про це варто попередити. */
  existingSplitsCount?: number;
}

function formatQty(
  qty: number | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (qty == null) return unit ?? null;
  return unit ? `${qty} ${unit}` : String(qty);
}

/**
 * Копійки чека → готовий `TxSplit[]` у гривнях.
 *
 * Канонізація id (`groceries` → `food`): мапер навмисно лягає в
 * `manualTaxonomy` (детальний ручний слаг), а категорії, якими живуть
 * банківські транзакції (пікер спліту, `calcCategorySpent`, аналітика),
 * побудовані з `MCC_CATEGORIES` — там `groceries` немає взагалі, лише
 * `food`. Без канонізації спліт писав гроші під id, якого немає в жодному
 * списку категорій витрат — сума мовчки зникала з аналітики (той самий
 * фікс, що вже стоїть у `useWeeklyDigest.ts` для агрегації категорій).
 *
 * Залишок між сумою позицій і `totalKop` чека (знижки, позиції без
 * цінника) йде в «Продукти» — той самий дефолт, що й у самого мапера для
 * нерозпізнаних позицій.
 */
function buildFinalSplits(
  suggestion: ReturnType<typeof suggestSplitsFromReceiptItems>,
  totalKop: number,
): TxSplit[] {
  const byCanonical = new Map<string, number>();
  for (const split of suggestion.splits) {
    const canonicalId = canonicalManualCategoryId(split.categoryId);
    byCanonical.set(
      canonicalId,
      (byCanonical.get(canonicalId) ?? 0) + split.amountKop,
    );
  }
  const splitTotalKop = [...byCanonical.values()].reduce((a, b) => a + b, 0);
  const remainderKop = totalKop - splitTotalKop;
  if (remainderKop !== 0) {
    const groceriesCanonical = canonicalManualCategoryId("groceries");
    byCanonical.set(
      groceriesCanonical,
      (byCanonical.get(groceriesCanonical) ?? 0) + remainderKop,
    );
  }
  return [...byCanonical.entries()]
    .map(([categoryId, amountKop]) => ({
      categoryId,
      amount: Math.round(amountKop) / 100,
    }))
    .filter((split) => split.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function SilpoReceiptSection({
  transactionId,
  onSplitChange,
  customCategories = [],
  existingSplitsCount = 0,
}: SilpoReceiptSectionProps) {
  const copy = messages.finyk.silpoReceipt;
  const { status } = useSilpoSyncState();
  const { summary, detail, isLoading } = useSilpoReceiptForTransaction(
    transactionId,
    { enabled: status === "connected" },
  );
  const [proposalOpen, setProposalOpen] = useState(false);

  const items = useMemo(() => detail?.items ?? [], [detail]);
  const suggestion = useMemo(
    () =>
      suggestSplitsFromReceiptItems(
        items.map((item) => ({
          name: item.name,
          categorySlug: item.categorySlug,
          priceKop: item.priceKop,
          qty: item.qty,
        })),
      ),
    [items],
  );
  const finalSplits = useMemo(
    () =>
      buildFinalSplits(suggestion, summary?.totalKop ?? suggestion.totalKop),
    [suggestion, summary],
  );
  const canPropose = items.length > 0 && !suggestion.singleCategory;

  if (status !== "connected" || isLoading || !summary) return null;

  const confirmSplit = () => {
    onSplitChange(transactionId, finalSplits.length >= 2 ? finalSplits : null);
    setProposalOpen(false);
  };

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
          disabled={!canPropose}
          aria-expanded={proposalOpen}
          onClick={() => setProposalOpen((open) => !open)}
        >
          <Icon name="shuffle" size={15} aria-hidden />
          {copy.splitCta}
        </Button>
      </div>
      {/* `title` on a disabled button is unreachable by keyboard/screen
          reader/touch (§ code review PR #819) — a visible caption next to
          the CTA carries the "чому кнопка неактивна" explanation to
          everyone. Only shown once items actually loaded — before that the
          `itemsPending` caption below already covers "чому нічого нема". */}
      {items.length > 0 && suggestion.singleCategory && (
        <p className="mt-1 text-right text-style-caption text-subtle">
          {copy.singleCategoryHint}
        </p>
      )}

      {proposalOpen && canPropose && (
        <div className="mt-3 space-y-2 rounded-xl border border-line bg-panelHi p-3">
          <p className="text-style-caption text-subtle">{copy.proposalTitle}</p>
          <ul className="space-y-1.5">
            {finalSplits.map((split) => {
              const meta = resolveExpenseCategoryMeta(
                split.categoryId,
                customCategories,
              );
              return (
                <li
                  key={split.categoryId}
                  className="flex items-center justify-between gap-2 text-style-body"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Icon
                      name={CATEGORY_ICON_MAP[split.categoryId] ?? "tag"}
                      size={15}
                      aria-hidden
                    />
                    <span className="truncate text-text">
                      {stripLeadingEmoji(meta?.label ?? split.categoryId)}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-text">
                    <Money amount={split.amount} kopecks />
                  </span>
                </li>
              );
            })}
          </ul>
          {existingSplitsCount > 0 && (
            <p className="text-style-caption text-warning-strong dark:text-warning">
              {copy.overwriteWarning}
            </p>
          )}
          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              module="finyk"
              size="xs"
              className="flex-1"
              onClick={confirmSplit}
            >
              {copy.proposalConfirm}
            </Button>
            <button
              type="button"
              onClick={() => setProposalOpen(false)}
              className="touch-target rounded-xl border border-line px-3 text-style-caption text-subtle transition-colors hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-finyk"
            >
              {copy.proposalCancel}
            </button>
          </div>
        </div>
      )}

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
