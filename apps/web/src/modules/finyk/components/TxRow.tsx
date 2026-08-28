/**
 * Last validated: 2026-08-21
 * Status: Active
 */
import { memo, useMemo } from "react";
import {
  getExpenseCategoryForTransaction,
  getIncomeCategoryForTransaction,
} from "../utils";
import { CURRENCY, CURRENCY_SYMBOL } from "../constants";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { CategoryIconChip } from "./CategoryIconChip";
import { getAccountShortName, type TxRowTx } from "./txRowHelpers";
import { TxRowMetaChips } from "./TxRowMetaChips";
import { MaskedAmount } from "@shared/components/ui/MaskedAmount";
import { Money } from "@shared/components/ui/Money";

export type { TxRowTx };

interface TxRowProps {
  tx: TxRowTx;
  onClick?: ((() => void) | null) | undefined;
  highlighted?: boolean | undefined;
  hidden?: boolean | undefined;
  overrideCatId?: string | null | undefined;
  /** User's own free-text annotation for this transaction. */
  note?: string | undefined;
  accounts?: readonly MonoAccount[] | undefined;
  hideAmount?: boolean | undefined;
  txSplits?: TxSplitsMap | undefined;
  customCategories?: readonly CustomCategoryInput[] | undefined;
  /** Чи знає цей пристрій про привʼязаний чек — індикатор розгортки
   * (спека § Розгортка, `useFinykReceiptLinks`). */
  hasReceipt?: boolean | undefined;
  /**
   * Draw the built-in bottom hairline. Defaults to `true` for the Assets
   * pickers that stack rows directly. The transaction list (#13) sets this
   * to `false` and paints its own inset dividers at the group-card level so
   * the last row doesn't collide with the card's rounded bottom edge.
   */
  divider?: boolean | undefined;
}

function TxRowImpl({
  tx,
  onClick,
  highlighted,
  hidden,
  overrideCatId,
  note,
  accounts,
  hideAmount = false,
  txSplits,
  customCategories = [],
  hasReceipt = false,
  divider = true,
}: TxRowProps) {
  const isIncome = tx.amount > 0;
  const cat = isIncome
    ? getIncomeCategoryForTransaction(tx, overrideCatId)
    : getExpenseCategoryForTransaction(
        tx,
        overrideCatId,
        customCategories as readonly unknown[],
      );
  const catName = cat.label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  const rawDescription = tx.description?.trim() ?? "";
  // До 2026-08-13 форма підставляла підпис вибраної категорії в порожню
  // необовʼязкову назву. На старих ручних записах не дублюємо цей
  // згенерований текст над таким самим чипом категорії. Власні назви, які
  // відрізняються від підпису категорії, лишаються без змін.
  const hasLegacyGeneratedDescription =
    tx._manual === true &&
    rawDescription.localeCompare(catName, "uk-UA", {
      sensitivity: "accent",
    }) === 0;
  const displayDescription = hasLegacyGeneratedDescription
    ? ""
    : rawDescription;

  const account: MonoAccount | undefined = accounts?.find(
    (a) => a.id === tx._accountId,
  );
  const isCreditCard = (account?.creditLimit ?? 0) > 0;
  const accountName = getAccountShortName(account);

  // useMemo — стабілізуємо масив сплітів, щоб `openSplitEditor` (useCallback
  // нижче) не перестворювався, коли `txSplits` — той самий обʼєкт.
  const existingSplits = useMemo(
    () => txSplits?.[tx.id] ?? [],
    [txSplits, tx.id],
  );
  const mainRowInner = (
    <>
      {highlighted ? (
        <span className="text-success shrink-0">
          <Icon name="check-circle" size={22} title="Вибрана транзакція" />
        </span>
      ) : (
        // Спільний чип — та сама іконка й той самий відтінок, що в
        // картці ліміту й алертах бюджету (`CategoryIconChip`).
        <CategoryIconChip
          categoryId={cat.id}
          customCategories={customCategories}
        />
      )}
      <div className="min-w-0">
        <div
          className={cn(
            "text-style-label text-text truncate",
            hidden && "line-through",
          )}
        >
          {displayDescription ||
            (tx._manual
              ? isIncome
                ? "Ручне надходження"
                : "Ручна витрата"
              : "Транзакція")}
        </div>
        <TxRowMetaChips
          tx={tx}
          catId={cat.id}
          catName={catName}
          customCategories={customCategories}
          isIncome={isIncome}
          overrideCatId={overrideCatId}
          existingSplitsCount={existingSplits.length}
          isCreditCard={isCreditCard}
          account={account}
          accountName={accountName}
          hasReceipt={hasReceipt}
          note={note}
        />
      </div>
    </>
  );

  return (
    <div
      className={cn(
        divider && "border-b border-line last:border-0",
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

        <div className="shrink-0 ml-2 text-right">
          <div
            className={cn(
              "text-style-label tabular-nums",
              isIncome ? "text-success-strong dark:text-success" : "text-text",
            )}
          >
            {/* AI-CONTEXT: `fmtAmt` тут замінено на `Money` (анти-слоп П4).
                Значення те саме — обидва ділять копійки на 100 і показують
                дві дробові цифри, — але набір інший: знак, копійки й символ
                стають окремими приглушеними тирами. Заразом зникає давня
                вада `fmtAmt`: він клеїв символ до суми без пробілу
                (`1 234,56₴`), бо шаблон рядка не мав розділювача. `Money`
                ставить вузький нерозривний. `tone="inherit"` — бо колонка
                доходу забарвлена, і тири мають брати її колір, а не сірий. */}
            <MaskedAmount masked={hideAmount}>
              <Money
                amount={tx.amount / 100}
                signed
                kopecks
                tone={isIncome ? "inherit" : "muted"}
              />
            </MaskedAmount>
          </div>
          {tx.currencyCode !== CURRENCY.UAH && tx.operationAmount && (
            <div className="text-style-caption text-muted tabular-nums">
              <MaskedAmount masked={hideAmount}>
                <Money
                  amount={tx.operationAmount / 100}
                  signed
                  kopecks
                  // `?? CURRENCY.UAH` відтворює дефолт параметра `fmtAmt`,
                  // який тут був: `currencyCode` опційний у `TxRowTx`, і
                  // гілка `!== CURRENCY.UAH` не звужує `undefined`.
                  symbol={
                    CURRENCY_SYMBOL[tx.currencyCode ?? CURRENCY.UAH] ?? "₴"
                  }
                />
              </MaskedAmount>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const TxRow = memo(TxRowImpl);
