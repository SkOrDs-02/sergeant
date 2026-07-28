/**
 * Last validated: 2026-07-28
 * Status: Active
 *
 * Canonical editor for imported bank transactions. Bank facts stay read-only;
 * user-owned overlays (category, note, split and visibility flags) are edited
 * in one place instead of being spread across row-level icon actions.
 */
import { useMemo, useState } from "react";
import type {
  Transaction,
  TxSplit,
  TxSplitsMap,
} from "@sergeant/finyk-domain/domain/types";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { MaskedAmount } from "@shared/components/ui/MaskedAmount";
import { Sheet } from "@shared/components/ui/Sheet";
import { Switch } from "@shared/components/ui/Switch";
import { messages } from "@shared/i18n/uk";
import {
  CURRENCY,
  INCOME_CATEGORIES,
  INTERNAL_TRANSFER_ID,
  MCC_CATEGORIES,
  mergeExpenseCategoryDefinitions,
} from "../constants";
import { fmtAmt, getCategory, getIncomeCategory } from "../utils";
import { TxRowCategoryPicker } from "./TxRowCategoryPicker";
import { TxRowSplitEditor } from "./TxRowSplitEditor";

interface BankTransactionAccount {
  id?: string | undefined;
  type?: string | undefined;
  _source?: string | undefined;
}

export interface BankTransactionDetailsSheetProps {
  transaction: Transaction;
  accounts?: readonly BankTransactionAccount[] | undefined;
  hidden: boolean;
  excludedFromStats: boolean;
  overrideCatId?: string | null | undefined;
  note?: string | undefined;
  txSplits: TxSplitsMap;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  hideAmount?: boolean | undefined;
  onCategoryChange: (id: string, categoryId: string | null) => void;
  onNoteChange: (id: string, note: string | null) => void;
  onSplitChange: (id: string, splits: TxSplit[] | null) => void;
  onToggleHidden: (id: string) => void;
  onToggleExcludedFromStats: (id: string) => void;
  onClose: () => void;
}

const ACCOUNT_LABELS: Readonly<Record<string, string>> = {
  black: "Чорна картка",
  white: "Біла картка",
  platinum: "Platinum",
  iron: "Iron",
  fop: "ФОП",
  yellow: "Жовта картка",
};

function formatTransactionDate(transaction: Transaction): string {
  const milliseconds = Number(transaction.time) * 1000;
  if (Number.isFinite(milliseconds) && milliseconds > 0) {
    return new Intl.DateTimeFormat("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Europe/Kyiv",
    }).format(new Date(milliseconds));
  }
  return transaction.date || "Дата не вказана";
}

function getSourceLabel(source: string | undefined): string {
  if (source === "privatbank") return "ПриватБанк";
  if (source === "mono" || source === "monobank") return "Monobank";
  return "Банківська операція";
}

export function BankTransactionDetailsSheet({
  transaction,
  accounts = [],
  hidden,
  excludedFromStats,
  overrideCatId,
  note,
  txSplits,
  customCategories = [],
  hideAmount = false,
  onCategoryChange,
  onNoteChange,
  onSplitChange,
  onToggleHidden,
  onToggleExcludedFromStats,
  onClose,
}: BankTransactionDetailsSheetProps) {
  const copy = messages.finyk.transactionDetails;
  const isIncome = transaction.amount > 0;
  const category = isIncome
    ? getIncomeCategory(transaction.description ?? "", overrideCatId)
    : getCategory(
        transaction.description ?? "",
        transaction.mcc ?? 0,
        overrideCatId,
        customCategories as readonly unknown[],
      );
  const categoryOptions = useMemo(() => {
    if (isIncome) return INCOME_CATEGORIES;
    const merged = mergeExpenseCategoryDefinitions(
      customCategories as readonly unknown[],
    );
    const internal = MCC_CATEGORIES.find(
      (item) => item.id === INTERNAL_TRANSFER_ID,
    );
    return internal ? [...merged, internal] : merged;
  }, [customCategories, isIncome]);
  const existingSplits = txSplits[transaction.id] ?? [];
  const totalAmount = Math.abs(transaction.amount / 100);
  const [showSplitEditor, setShowSplitEditor] = useState(false);
  const [splitCategoryPicker, setSplitCategoryPicker] = useState<number | null>(
    null,
  );
  const [draftSplits, setDraftSplits] = useState<TxSplit[]>([]);
  const splitTotal = draftSplits.reduce(
    (sum, split) => sum + (Number(split.amount) || 0),
    0,
  );
  const remaining = Math.round((totalAmount - splitTotal) * 100) / 100;
  const account = accounts.find((item) => item.id === transaction._accountId);
  const accountLabel = account?.type
    ? (ACCOUNT_LABELS[account.type] ?? account.type)
    : null;

  const openSplitEditor = () => {
    setDraftSplits(
      existingSplits.length > 0
        ? existingSplits.map((split) => ({ ...split }))
        : [
            { categoryId: category.id, amount: totalAmount },
            { categoryId: INTERNAL_TRANSFER_ID, amount: 0 },
          ],
    );
    setSplitCategoryPicker(null);
    setShowSplitEditor(true);
  };

  const saveSplits = () => {
    const validSplits = draftSplits.filter(
      (split) => split.categoryId && (Number(split.amount) || 0) > 0,
    );
    onSplitChange(transaction.id, validSplits.length >= 2 ? validSplits : null);
    setShowSplitEditor(false);
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={copy.title}
      description={`${getSourceLabel(transaction._source)} · ${copy.bankFactsReadonly}`}
      panelClassName="finyk-sheet"
      bodyClassName="px-4 pb-6"
      footer={
        <Button
          variant="primary"
          module="finyk"
          onClick={onClose}
          className="w-full"
        >
          {copy.done}
        </Button>
      }
    >
      <div className="space-y-5">
        <section className="rounded-2xl border border-line bg-panelHi p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-style-label text-text break-words">
                {transaction.description || copy.bankTransactionFallback}
              </p>
              <p className="mt-1 text-style-caption text-muted">
                {formatTransactionDate(transaction)}
              </p>
              {accountLabel && (
                <p className="mt-1 text-style-caption text-subtle">
                  {accountLabel}
                </p>
              )}
            </div>
            <p className="shrink-0 text-style-title tabular-nums text-text">
              <MaskedAmount masked={hideAmount}>
                {fmtAmt(transaction.amount, CURRENCY.UAH)}
              </MaskedAmount>
            </p>
          </div>
        </section>

        <section aria-labelledby="bank-transaction-category-title">
          <h3
            id="bank-transaction-category-title"
            className="mb-2 px-2 text-style-label text-text"
          >
            {copy.categoryAndNote}
          </h3>
          <TxRowCategoryPicker
            categories={categoryOptions}
            currentCatId={category.id}
            overrideCatId={overrideCatId}
            txId={transaction.id}
            onCatChange={onCategoryChange}
            note={note}
            onNoteChange={onNoteChange}
            onClose={() => undefined}
          />
        </section>

        {!isIncome && (
          <section className="rounded-2xl border border-line bg-panel p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-style-label text-text">
                  {copy.splitTitle}
                </h3>
                <p className="mt-0.5 text-style-caption text-muted">
                  {existingSplits.length > 0
                    ? `${existingSplits.length} ${copy.splitPartsSuffix}`
                    : copy.splitHint}
                </p>
              </div>
              <Button
                variant="secondary"
                module="finyk"
                size="xs"
                onClick={openSplitEditor}
              >
                <Icon name="shuffle" size={15} aria-hidden />
                {existingSplits.length > 0
                  ? copy.changeSplit
                  : copy.createSplit}
              </Button>
            </div>
            {showSplitEditor && (
              <div className="mt-3 border-t border-line pt-3">
                <TxRowSplitEditor
                  totalAmt={totalAmount}
                  draftSplits={draftSplits}
                  setDraftSplits={setDraftSplits}
                  splitCategoryPicker={splitCategoryPicker}
                  setSplitCategoryPicker={setSplitCategoryPicker}
                  splitCategoryOptions={categoryOptions}
                  remaining={remaining}
                  existingSplitsCount={existingSplits.length}
                  onSave={saveSplits}
                  onDelete={() => {
                    onSplitChange(transaction.id, null);
                    setShowSplitEditor(false);
                  }}
                  onClose={() => setShowSplitEditor(false)}
                />
              </div>
            )}
          </section>
        )}

        <section className="space-y-2 rounded-2xl border border-line bg-panel p-3">
          <Switch
            checked={excludedFromStats}
            onChange={(next) => {
              if (next !== excludedFromStats) {
                onToggleExcludedFromStats(transaction.id);
              }
            }}
            label={copy.excludeLabel}
            description={copy.excludeDescription}
            className="w-full"
          />
          <Switch
            checked={hidden}
            onChange={(next) => {
              if (next !== hidden) onToggleHidden(transaction.id);
            }}
            label={copy.hideLabel}
            description={copy.hideDescription}
            className="w-full"
          />
        </section>
      </div>
    </Sheet>
  );
}
