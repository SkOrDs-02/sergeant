/**
 * Last validated: 2026-07-20
 * Status: Active
 */
import { memo, useCallback, useMemo, useState } from "react";
import { getCategory, getIncomeCategory } from "../utils";
import {
  MCC_CATEGORIES,
  INCOME_CATEGORIES,
  INTERNAL_TRANSFER_ID,
  mergeExpenseCategoryDefinitions,
} from "../constants";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/ui/cn";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import {
  CATEGORY_ICON_MAP,
  getAccountShortName,
  type TxRowTx,
} from "./txRowHelpers";
import { TxRowAmountActions } from "./TxRowAmountActions";
import { TxRowCategoryPicker } from "./TxRowCategoryPicker";
import { TxRowMetaChips } from "./TxRowMetaChips";
import { TxRowSplitEditor } from "./TxRowSplitEditor";

export type { TxRowTx };

interface TxRowProps {
  tx: TxRowTx;
  onClick?: ((() => void) | null) | undefined;
  highlighted?: boolean | undefined;
  onHide?: ((id: string) => void) | null | undefined;
  hidden?: boolean | undefined;
  overrideCatId?: string | null | undefined;
  onCatChange?: ((id: string, catId: string | null) => void) | null | undefined;
  accounts?: readonly MonoAccount[] | undefined;
  hideAmount?: boolean | undefined;
  txSplits?: TxSplitsMap | undefined;
  onSplitChange?:
    ((id: string, split: TxSplit[] | null) => void) | null | undefined;
  customCategories?: readonly CustomCategoryInput[] | undefined;
}

function TxRowImpl({
  tx,
  onClick,
  highlighted,
  onHide,
  hidden,
  overrideCatId,
  onCatChange,
  accounts,
  hideAmount = false,
  txSplits,
  onSplitChange,
  customCategories = [],
}: TxRowProps) {
  const [catPicker, setCatPicker] = useState(false);
  const [splitEditor, setSplitEditor] = useState(false);
  const [splitCategoryPicker, setSplitCategoryPicker] = useState<number | null>(
    null,
  );
  // Драфт-стан редактора сплітів. Типізуємо явно — раніше `useState([])`
  // звужувався до `never[]` під `noImplicitAny: false`, і будь-яка помилка
  // у shape-і елемента ловилась лише рантаймом.
  const [draftSplits, setDraftSplits] = useState<TxSplit[]>([]);
  const splitCategoryOptions = useMemo(() => {
    const merged = mergeExpenseCategoryDefinitions(
      customCategories as readonly unknown[],
    );
    const internal = MCC_CATEGORIES.find((c) => c.id === INTERNAL_TRANSFER_ID);
    return internal ? [...merged, internal] : merged;
  }, [customCategories]);
  const isIncome = tx.amount > 0;
  const cat = isIncome
    ? getIncomeCategory(tx.description ?? "", overrideCatId)
    : getCategory(
        tx.description ?? "",
        tx.mcc ?? 0,
        overrideCatId,
        customCategories as readonly unknown[],
      );
  const catName = isIncome
    ? cat.label
    : cat.label.slice(cat.label.indexOf(" ") + 1);

  const account: MonoAccount | undefined = accounts?.find(
    (a) => a.id === tx._accountId,
  );
  const isCreditCard = (account?.creditLimit ?? 0) > 0;
  const accountName = getAccountShortName(account);

  // useMemo — стабілізуємо масив сплітів, щоб `openSplitEditor` (useCallback
  // нижче) не перестворювався, коли `txSplits` — той самий об'єкт.
  const existingSplits = useMemo<TxSplit[]>(
    () => txSplits?.[tx.id] ?? [],
    [txSplits, tx.id],
  );
  const totalAmt = Math.abs(tx.amount / 100);

  // useCallback — стабільне посилання зменшує кількість замикань на рендер
  // і робить можливі майбутні onClick-обробники стабільними для dom/handler-деталей.
  const openSplitEditor = useCallback(() => {
    setDraftSplits(
      existingSplits.length > 0
        ? existingSplits.map((s) => ({ ...s }))
        : [
            { categoryId: cat.id, amount: totalAmt },
            { categoryId: INTERNAL_TRANSFER_ID, amount: 0 },
          ],
    );
    setSplitEditor(true);
    setCatPicker(false);
  }, [existingSplits, cat.id, totalAmt]);

  const splitsTotal = draftSplits.reduce(
    (s, p) => s + (Number(p.amount) || 0),
    0,
  );
  const remaining = Math.round((totalAmt - splitsTotal) * 100) / 100;

  // useCallback — зберігає сталий handler для JSX нижче; уникаємо нової
  // функції на кожен символ у полі редагування суми.
  const saveSplits = useCallback(() => {
    const valid = draftSplits.filter(
      (s) => s.categoryId && (Number(s.amount) || 0) > 0,
    );
    onSplitChange?.(tx.id, valid.length >= 2 ? valid : null);
    setSplitEditor(false);
  }, [draftSplits, onSplitChange, tx.id]);

  const toggleCatPicker = useCallback(() => {
    setCatPicker((v) => !v);
    setSplitEditor(false);
  }, []);

  // Resolve the icon name for the category pill (Phase 6.1).
  const pillIconName: IconName = CATEGORY_ICON_MAP[cat.id] ?? "tag";

  const mainRowInner = (
    <>
      {highlighted ? (
        <span className="text-success shrink-0">
          <Icon name="check-circle" size={22} title="Вибрана транзакція" />
        </span>
      ) : (
        // 28px tinted circle — decorative, non-interactive (aria-hidden).
        // bg-finyk/10 gives a soft emerald wash; text-finyk-strong
        // ensures ≥4.5:1 contrast on the bg-panel surface in light mode.
        // dark:bg-finyk/15 lifts the wash slightly for dark-surface parity.
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 inline-flex items-center justify-center rounded-full",
            "w-7 h-7",
            "bg-finyk/10 dark:bg-finyk/15",
            "text-finyk-strong dark:text-finyk",
          )}
        >
          <Icon name={pillIconName} size={16} strokeWidth={1.75} />
        </span>
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "text-style-label text-text truncate",
            hidden && "line-through",
          )}
        >
          {tx.description || "Транзакція"}
        </div>
        <TxRowMetaChips
          tx={tx}
          catId={cat.id}
          catName={catName}
          isIncome={isIncome}
          overrideCatId={overrideCatId}
          existingSplitsCount={existingSplits.length}
          isCreditCard={isCreditCard}
          account={account}
          accountName={accountName}
        />
      </div>
    </>
  );

  return (
    <div
      className={cn(
        "border-b border-line last:border-0",
        highlighted && "bg-primary/5 rounded-xl border-0 my-0.5",
      )}
    >
      {/* Main row */}
      <div
        className={cn(
          "flex items-center justify-between py-3",
          highlighted && "px-2",
          hidden && "opacity-35",
        )}
      >
        {onClick ? (
          <button
            type="button"
            onClick={onClick}
            className={cn(
              "flex items-center gap-3 flex-1 min-w-0 cursor-pointer text-left",
              "border-0 bg-transparent p-0 font-inherit",
            )}
          >
            {mainRowInner}
          </button>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {mainRowInner}
          </div>
        )}

        <TxRowAmountActions
          tx={tx}
          hideAmount={hideAmount}
          isIncome={isIncome}
          splitEditor={splitEditor}
          catPicker={catPicker}
          hidden={hidden}
          existingSplitsCount={existingSplits.length}
          onSplitChange={onSplitChange}
          onCatChange={onCatChange}
          onHide={onHide}
          onOpenSplitEditor={openSplitEditor}
          onToggleCatPicker={toggleCatPicker}
        />
      </div>

      {splitEditor && onSplitChange && (
        <TxRowSplitEditor
          totalAmt={totalAmt}
          draftSplits={draftSplits}
          setDraftSplits={setDraftSplits}
          splitCategoryPicker={splitCategoryPicker}
          setSplitCategoryPicker={setSplitCategoryPicker}
          splitCategoryOptions={splitCategoryOptions}
          remaining={remaining}
          existingSplitsCount={existingSplits.length}
          onSave={saveSplits}
          onDelete={() => {
            onSplitChange(tx.id, null);
            setSplitEditor(false);
          }}
          onClose={() => setSplitEditor(false)}
        />
      )}

      {catPicker && (
        <TxRowCategoryPicker
          categories={isIncome ? INCOME_CATEGORIES : splitCategoryOptions}
          currentCatId={cat.id}
          overrideCatId={overrideCatId}
          txId={tx.id}
          onCatChange={onCatChange}
          onClose={() => setCatPicker(false)}
        />
      )}
    </div>
  );
}

export const TxRow = memo(TxRowImpl);
