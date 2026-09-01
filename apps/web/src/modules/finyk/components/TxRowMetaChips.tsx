/**
 * Last validated: 2026-07-26
 * Status: Active
 *
 * Single fixed-order meta row under the TxRow description: card · category ·
 * status badges (AI / transfer / override / source) · split · note. The
 * note (§3, ex-#466) is always the last element so it truncates first when
 * the row runs out of width — nothing else in the row shifts or wraps.
 * Extracted for Hard Rule #18 max-lines.
 */
import { INTERNAL_TRANSFER_ID } from "../constants";
import { Badge } from "@shared/components/ui/Badge";
import { Icon } from "@shared/components/ui/Icon";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import { catChipVars } from "../lib/categoryChip";
import type { TxRowTx } from "./txRowHelpers";

interface TxRowMetaChipsProps {
  tx: TxRowTx;
  catId: string;
  catName: string;
  isIncome: boolean;
  overrideCatId?: string | null | undefined;
  existingSplitsCount: number;
  isCreditCard: boolean;
  account: MonoAccount | undefined;
  accountName: string | null;
  /** Власні категорії — джерело стабільного відтінку для кастомних чипів. */
  customCategories?: readonly { id: string }[] | undefined;
  /** Чи знає ЦЕЙ пристрій про чек, привʼязаний до цієї транзакції
   * (`useFinykReceiptLinks`, device-local — див. `lib/receiptLinks.ts`).
   * Розгортка позицій живе в `BankTransactionDetailsSheet`/
   * `ManualExpenseSheet` (спека § Розгортка); тут — лише індикатор. */
  hasReceipt?: boolean | undefined;
  /** User's own free-text annotation — rendered last, truncates first. */
  note?: string | undefined;
}

export function TxRowMetaChips({
  tx,
  catId,
  catName,
  isIncome,
  overrideCatId,
  existingSplitsCount,
  isCreditCard,
  account,
  accountName,
  hasReceipt = false,
  note,
  customCategories = [],
}: TxRowMetaChipsProps) {
  return (
    <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
      {/* §2: card chip is always neutral — a small icon (not colour) marks
          "credit". Red stays reserved for debt/asset surfaces elsewhere. */}
      {account && (
        <span className="shrink-0 inline-flex items-center gap-1 text-style-caption bg-panelHi text-muted border border-line px-1.5 py-0.5 rounded-full font-medium">
          {isCreditCard && <Icon name="credit-card" size={12} aria-hidden />}
          {accountName}
        </span>
      )}
      {/* Назва категорії — єдиний елемент рядка, що несе колір самої
          категорії (`.cat-chip` бере його з CSS-змінних). Решта чипів
          лишається нейтральною: якби кольору набралось двоє-троє, рядок
          перестав би читатись за один погляд — а це і був запит. */}
      <span
        style={catChipVars(catId, customCategories)}
        className="cat-chip shrink-0 text-style-caption border px-1.5 py-0.5 rounded-full font-medium"
      >
        {catName}
      </span>
      {/* 6.4: AI-source tag — surfaces auto-categorized expense rows
          so users can tell which categorizations are inferred (MCC +
          description match) vs explicit (user override, manual entry,
          splits, transfers, fallback "other"). Sergeant-glyph icon-only
          keeps the row uncluttered — category label is right next to it.
          Skipped on:
            – manual expenses (`_manual`): user typed the category
            – overridden rows: explicit user choice, shows "змін." instead
            – internal transfers: special routing, not categorization
            – income rows: handled by separate income flow above
            – "other" fallback: no real inference happened
      */}
      {!tx._manual &&
        !overrideCatId &&
        !isIncome &&
        catId !== INTERNAL_TRANSFER_ID &&
        catId !== "other" && (
          <Badge
            variant="finyk"
            tone="soft"
            size="xs"
            className="shrink-0 inline-flex items-center rounded-full"
            title="Категорію визначив Сержант за описом і MCC"
            aria-label="Категорію визначив Сержант за описом і MCC"
          >
            <Icon name="sergeant" size={10} aria-hidden />
          </Badge>
        )}
      {catId === INTERNAL_TRANSFER_ID && (
        <span className="shrink-0 text-style-caption bg-muted/15 text-muted px-1.5 py-0.5 rounded-full font-semibold">
          не в статистиці
        </span>
      )}
      {overrideCatId && catId !== INTERNAL_TRANSFER_ID && (
        <span className="shrink-0 text-style-caption bg-text/8 text-muted px-1.5 py-0.5 rounded-full font-semibold">
          змін.
        </span>
      )}
      {tx._source === "privatbank" && (
        <span className="shrink-0 text-style-caption bg-success/10 text-success-strong dark:text-success px-1.5 py-0.5 rounded-full font-semibold">
          П24
        </span>
      )}
      {existingSplitsCount > 0 && (
        <span className="shrink-0 text-style-caption bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
          ⅔ спліт
        </span>
      )}
      {hasReceipt && (
        <span
          className="shrink-0 inline-flex items-center text-muted"
          title="Є прикріплений чек, відкрий транзакцію, щоб побачити позиції"
        >
          <Icon
            name="file-text"
            size={12}
            title="Є прикріплений чек, відкрий транзакцію, щоб побачити позиції"
          />
        </span>
      )}
      {note && (
        <span className="min-w-0 flex-1 truncate text-style-caption text-subtle">
          {note}
        </span>
      )}
    </div>
  );
}
