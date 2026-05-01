import { memo, useCallback, useMemo, useState } from "react";
import { formatMoney } from "@sergeant/shared";
import { getCategory, getIncomeCategory, fmtAmt, fmtDate } from "../utils";
import {
  MCC_CATEGORIES,
  INCOME_CATEGORIES,
  INTERNAL_TRANSFER_ID,
  CURRENCY,
  mergeExpenseCategoryDefinitions,
} from "../constants";
import type { CustomCategoryInput } from "@sergeant/finyk-domain/constants";
import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";
import type { TxSplit, TxSplitsMap } from "@sergeant/finyk-domain/domain/types";
import { cn } from "@shared/lib/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";

const splitInp =
  "input-focus-finyk flex-1 text-xs h-9 rounded-xl border border-line bg-panelHi px-2 text-text";

const INCOME_ICONS: Record<string, string> = {
  in_salary: "💰",
  in_freelance: "💻",
  [INTERNAL_TRANSFER_ID]: "↔️",
  in_cashback: "🎁",
  in_pension: "🏛️",
  in_other: "📥",
};

function getAccountShortName(acc: MonoAccount | undefined): string | null {
  if (!acc) return null;
  const typeMap: Record<string, string> = {
    black: "Чорна",
    white: "Біла",
    platinum: "Platinum",
    iron: "Iron",
    fop: "ФОП",
    yellow: "Жовта",
  };
  const key = acc.type ?? "";
  return typeMap[key] || acc.type || "Рахунок";
}

/**
 * Мінімальна форма транзакції, яку рендерить рядок. Свідомо НЕ імпортуємо
 * повний `Transaction` з finyk-domain — рядок бачить і нормалізовані, і
 * сирі monobank-записи (різні точки виклику persist різні shape-и: Mono
 * statement entries, manual-expenses, merged splits), тому лишаємо тільки
 * реально читані поля. Typing-guard тут важливий не для uniqueness схеми,
 * а щоб запобігти "silent-new-field" регресіям — як тоді, коли
 * `tx._accountId` раптом перейменували у `.accountId` і рядок тихо
 * втрачав прив'язку до рахунку.
 */
export interface TxRowTx {
  id: string;
  amount: number;
  description?: string;
  mcc?: number;
  time?: number;
  currencyCode?: number;
  operationAmount?: number;
  _accountId?: string | null;
  _source?: string;
  _manual?: boolean;
  _manualId?: string;
}

interface TxRowProps {
  tx: TxRowTx;
  onClick?: (() => void) | null;
  highlighted?: boolean;
  onHide?: ((id: string) => void) | null;
  hidden?: boolean;
  overrideCatId?: string | null;
  onCatChange?: ((id: string, catId: string | null) => void) | null;
  accounts?: readonly MonoAccount[];
  hideAmount?: boolean;
  txSplits?: TxSplitsMap;
  onSplitChange?: ((id: string, split: TxSplit[] | null) => void) | null;
  customCategories?: readonly CustomCategoryInput[];
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
  const catIcon = isIncome
    ? INCOME_ICONS[cat.id] || "📥"
    : cat.label.split(" ")[0];
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

  const mainRowInner = (
    <>
      <span className="text-xl shrink-0 leading-none">
        {highlighted ? "✅" : catIcon}
      </span>
      <div className="min-w-0">
        <div
          className={cn(
            "text-sm font-medium text-text truncate",
            hidden && "line-through",
          )}
        >
          {tx.description || "Транзакція"}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          <span className="text-xs text-subtle">{catName}</span>
          {cat.id === INTERNAL_TRANSFER_ID && (
            <span className="text-3xs bg-muted/15 text-muted px-1.5 py-0.5 rounded-full font-semibold">
              не в статистиці
            </span>
          )}
          {overrideCatId && cat.id !== INTERNAL_TRANSFER_ID && (
            <span className="text-3xs bg-text/8 text-muted px-1.5 py-0.5 rounded-full font-semibold">
              змін.
            </span>
          )}
          {existingSplits.length > 0 && (
            <span className="text-3xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              ⅔ спліт
            </span>
          )}
          {isCreditCard && (
            <span className="text-3xs bg-danger/8 text-danger px-1.5 py-0.5 rounded-full font-semibold">
              💳 {accountName}
            </span>
          )}
          {!isCreditCard && account && (
            <span className="text-3xs bg-panelHi text-muted border border-line px-1.5 py-0.5 rounded-full font-medium">
              {accountName}
            </span>
          )}
          {tx._source === "privatbank" && (
            <span className="text-3xs bg-success/10 text-success-strong dark:text-success px-1.5 py-0.5 rounded-full font-semibold shrink-0">
              П24
            </span>
          )}
          <span className="text-xs text-subtle">· {fmtDate(tx.time ?? 0)}</span>
        </div>
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

        <div className="flex items-center gap-1 shrink-0 ml-2">
          <div className="text-right">
            <div
              className={cn(
                "text-sm font-semibold tabular-nums",
                tx.amount > 0 ? "text-success" : "text-text",
              )}
            >
              {hideAmount ? "••••" : fmtAmt(tx.amount, CURRENCY.UAH)}
            </div>
            {tx.currencyCode !== CURRENCY.UAH && tx.operationAmount && (
              <div className="text-2xs text-muted tabular-nums">
                {hideAmount
                  ? "••••"
                  : fmtAmt(tx.operationAmount, tx.currencyCode)}
              </div>
            )}
          </div>
          {onSplitChange && !isIncome && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openSplitEditor();
              }}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-xl transition-colors text-sm font-bold",
                splitEditor
                  ? "text-primary bg-primary/8"
                  : existingSplits.length > 0
                    ? "text-primary/70 bg-primary/5"
                    : "text-subtle/60 hover:text-subtle hover:bg-panelHi",
              )}
              title="Розподілити транзакцію"
              aria-label="Розподілити транзакцію"
            >
              ⅔
            </button>
          )}
          {onCatChange && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCatPicker((v) => !v);
                setSplitEditor(false);
              }}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-xl transition-colors",
                catPicker
                  ? "text-primary bg-primary/8"
                  : "text-subtle/60 hover:text-subtle hover:bg-panelHi",
              )}
              title="Змінити категорію"
              aria-label="Змінити категорію"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          )}
          {onHide && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onHide(tx.id);
              }}
              className={cn(
                "w-9 h-9 flex items-center justify-center rounded-xl transition-colors",
                hidden
                  ? "text-success hover:bg-success/8"
                  : "text-subtle/60 hover:text-danger hover:bg-danger/8",
              )}
              title={hidden ? "Відновити" : "Приховати"}
              aria-label={hidden ? "Відновити" : "Приховати"}
            >
              {hidden ? (
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M3 12s4-8 9-8 9 8 9 8-4 8-9 8-9-8-9-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <Icon name="trash" size={14} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Split editor */}
      {splitEditor && onSplitChange && (
        <div className="pb-3 px-2 space-y-2">
          <div className="text-xs text-subtle font-medium">
            Розподіл · {formatMoney(totalAmt, { minFractionDigits: 2 })} всього
          </div>
          {draftSplits.map((sp, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={sp.categoryId}
                onChange={(e) =>
                  setDraftSplits((prev) =>
                    prev.map((p, j) =>
                      j === i ? { ...p, categoryId: e.target.value } : p,
                    ),
                  )
                }
                className={splitInp}
              >
                {splitCategoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={sp.amount || ""}
                onChange={(e) =>
                  setDraftSplits((prev) =>
                    prev.map((p, j) =>
                      j === i
                        ? { ...p, amount: parseFloat(e.target.value) || 0 }
                        : p,
                    ),
                  )
                }
                className="input-focus-finyk w-24 text-xs h-9 rounded-xl border border-line bg-panelHi px-2 text-right text-text"
                placeholder="₴"
              />
              {draftSplits.length > 2 && (
                <button
                  onClick={() =>
                    setDraftSplits((prev) => prev.filter((_, j) => j !== i))
                  }
                  className="text-danger/50 hover:text-danger text-sm shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <div
            className={cn(
              "text-xs px-1 tabular-nums",
              Math.abs(remaining) < 0.01 ? "text-success" : "text-warning",
            )}
          >
            {Math.abs(remaining) < 0.01
              ? "✓ Суми збігаються"
              : `Залишок: ${formatMoney(remaining, { minFractionDigits: 2 })}`}
          </div>
          <button
            onClick={() =>
              setDraftSplits((prev) => [
                ...prev,
                {
                  categoryId: "other",
                  amount: Math.max(0, Math.round(remaining * 100) / 100),
                },
              ])
            }
            className="text-xs text-primary/70 hover:text-primary transition-colors"
          >
            + Додати частину
          </button>
          <div className="flex gap-2 pt-1">
            <Button
              variant="primary"
              module="finyk"
              size="xs"
              onClick={saveSplits}
              disabled={Math.abs(remaining) >= 0.01}
              className="flex-1"
            >
              Зберегти
            </Button>
            {existingSplits.length > 0 && (
              <button
                onClick={() => {
                  onSplitChange(tx.id, null);
                  setSplitEditor(false);
                }}
                className="text-xs py-2 px-3 rounded-xl border border-danger/30 text-danger/70 hover:text-danger transition-colors"
              >
                Видалити
              </button>
            )}
            <button
              onClick={() => setSplitEditor(false)}
              className="text-xs py-2 px-3 rounded-xl border border-line text-subtle hover:text-text transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Category picker */}
      {catPicker && (
        <div className="flex flex-wrap gap-1.5 pb-3 px-2">
          {(isIncome ? INCOME_CATEGORIES : splitCategoryOptions).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onCatChange?.(
                  tx.id,
                  c.id === cat.id && overrideCatId ? null : c.id,
                );
                setCatPicker(false);
              }}
              className={cn(
                "text-xs px-3 py-2 rounded-xl border transition-colors min-h-[34px]",
                c.id === cat.id
                  ? "bg-text text-bg border-text"
                  : "border-line text-subtle hover:border-muted hover:text-text",
              )}
            >
              {isIncome
                ? `${INCOME_ICONS[c.id] || "📥"} ${c.label}`
                : `${c.label.split(" ")[0]} ${c.label.slice(c.label.indexOf(" ") + 1)}`}
            </button>
          ))}
          {overrideCatId && (
            <button
              onClick={() => {
                onCatChange?.(tx.id, null);
                setCatPicker(false);
              }}
              className="text-xs px-3 py-2 rounded-xl border border-dashed border-danger/40 text-danger/60 hover:text-danger transition-colors"
            >
              ✕ скинути
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const TxRow = memo(TxRowImpl);
