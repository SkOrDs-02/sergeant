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
import type {
  Debt,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { MaskedAmount } from "@shared/components/ui/MaskedAmount";
import { Money } from "@shared/components/ui/Money";
import { Sheet } from "@shared/components/ui/Sheet";
import { Switch } from "@shared/components/ui/Switch";
import { messages } from "@shared/i18n/uk";
import {
  INCOME_CATEGORIES,
  INTERNAL_TRANSFER_ID,
  MCC_CATEGORIES,
  mergeExpenseCategoryDefinitions,
} from "../constants";
import {
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
} from "../utils";
import { DebtIncomeLinkSection } from "./DebtIncomeLinkSection";
import { SilpoReceiptSection } from "./SilpoReceiptSection";
import { TxRowCategoryPicker } from "./TxRowCategoryPicker";
import { TxRowSplitEditor } from "./TxRowSplitEditor";
import { ReceiptItemsSection } from "./ReceiptItemsSection";

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
  /** Device-local чек, привʼязаний до цієї транзакції (спека § Розгортка)
   * — `null` коли цей пристрій про чек не знає (`useFinykReceiptLinks`). */
  receiptId?: number | null | undefined;
  hideAmount?: boolean | undefined;
  /** Пасиви + мутатори для мостика «Борг → пасив» (спека finyk-observations,
   * PR-3) — потрібні лише коли категорія операції `in_debt`. */
  manualDebts: readonly Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
  ) => void;
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

/**
 * Дата операції в ISO для пікера «Прикріпити чек» — він сортує чеки за
 * близькістю до неї. `time` (epoch-секунди) точніший, `date` — запасний
 * варіант для legacy-блобів, які часу не мають.
 */
function transactionIso(transaction: Transaction): string {
  const milliseconds = Number(transaction.time) * 1000;
  if (Number.isFinite(milliseconds) && milliseconds > 0) {
    return new Date(milliseconds).toISOString();
  }
  return transaction.date || "";
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
  receiptId = null,
  hideAmount = false,
  manualDebts,
  setManualDebts,
  setLinkedTxRole,
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
    ? getIncomeCategoryForTransaction(transaction, overrideCatId)
    : getExpenseCategoryForTransaction(
        transaction,
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
        {/*
          Квитанція операції — власний матеріал (анти-слоп П3, рішення
          власника 2026-08-06). Найпряміший випадок із усіх: банківська
          операція В ЖИТТІ і є відривний талон, тож `edge-stub` тут не
          метафора, а те саме, чим річ є. Решта секцій шторки лишаються
          звичайними картками навмисно — матеріал позначає ФАКТ операції,
          а не форму редагування під ним.

          AI-DANGER: `edge-lift` мусить бути на БАТЬКУ. Маска `edge-stub`
          зрізає тінь на своєму вузлі — і `box-shadow`, і `drop-shadow`
          однаково (заміряно; див. `.edge-lift` у `tailwind-preset.js`).

          Чому не проп `Card edge="stub"` (борг 1, інвентар 2026-08-07):
          поверхня тут — `bg-panelHi` (підняте тло квитанції над
          звичайним `bg-panel` шторки), а жодна `prominence` в `Card`
          такого фону не дає — всі опираються на `bg-panel`. Переведення
          означало б або підмінити фон, або тягти новий `prominence`
          заради одного місця; клас лишається сирим (allowlisted у
          `edgeMaterial.test.ts`).
        */}
        <div className="edge-lift">
          <section className="edge-stub border border-line bg-panelHi p-4">
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
                  <Money amount={transaction.amount / 100} signed kopecks />
                </MaskedAmount>
              </p>
            </div>
          </section>
        </div>

        {receiptId != null && <ReceiptItemsSection receiptId={receiptId} />}

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

        {isIncome && category.id === "in_debt" && (
          <DebtIncomeLinkSection
            transaction={transaction}
            manualDebts={manualDebts}
            setManualDebts={setManualDebts}
            setLinkedTxRole={setLinkedTxRole}
          />
        )}

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

        {!isIncome && (
          <SilpoReceiptSection
            transactionId={transaction.id}
            transactionDescription={transaction.description}
            // `Transaction.amount` — signed копійки (ціле); сплітам потрібен
            // додатний total у копійках. `Math.round` — лише страховка від
            // не-цілого значення з legacy-блобів.
            transactionAmountKop={Math.round(Math.abs(transaction.amount))}
            transactionDateIso={transactionIso(transaction)}
            onSplitChange={onSplitChange}
            customCategories={customCategories}
            existingSplitsCount={existingSplits.length}
          />
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
