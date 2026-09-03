/**
 * Last validated: 2026-09-03
 * Status: Active
 *
 * Meta row under the TxRow description, in fixed order: category pill ·
 * AI glyph · plain text «рахунок · статуси» · receipt glyph · note.
 *
 * AI-CONTEXT: до 2026-09-03 рахунок і кожен статус («не в статистиці»,
 * «змін.», «П24», «спліт») були ОКРЕМИМИ пігулками різної ширини й ваги
 * шрифту, тож рядок із трьома-чотирма плашками читався як хаос — навіть
 * при спокійних кольорах (звіт власника зі скриншотом Операцій). Тепер
 * пігулка в рядку рівно одна — категорія, бо лише вона несе колір. Решта
 * стає одним приглушеним текстом через « · »: довжина слів більше не
 * ламає ритм, а категорія завжди стоїть першою, тож кольорова колонка
 * вирівняна по лівому краю на всіх рядках. Note (§3, ex-#466) лишається
 * останнім і обрізається першим.
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
  /**
   * Чи показувати рахунок. `TxRow` ставить `true` лише коли рахунків
   * більше одного: з єдиною карткою підпис «Біла» на кожному рядку —
   * шум без інформації, а з кількома його поява «то є, то нема»
   * зсувала категорію між першою і другою позицією.
   */
  showAccount?: boolean | undefined;
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
  showAccount = true,
  hasReceipt = false,
  note,
  customCategories = [],
}: TxRowMetaChipsProps) {
  const isTransfer = catId === INTERNAL_TRANSFER_ID;
  // Порядок фіксований: рахунок → переказ → «змін.» → П24 → спліт.
  const statuses: string[] = [];
  if (isTransfer) statuses.push("не в статистиці");
  if (overrideCatId && !isTransfer) statuses.push("змін.");
  if (tx._source === "privatbank") statuses.push("П24");
  if (existingSplitsCount > 0) statuses.push("спліт");

  const showAccountName = showAccount && account && accountName;
  const hasMeta = Boolean(showAccountName) || statuses.length > 0;

  return (
    <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
      {/* Назва категорії — єдиний елемент рядка, що несе колір самої
          категорії (`.cat-chip` бере його з CSS-змінних), і єдина
          пігулка. Решта — приглушений текст. */}
      <span
        style={catChipVars(catId, customCategories)}
        className="cat-chip shrink-0 text-style-caption border px-1.5 py-0.5 rounded-full font-medium"
      >
        {catName}
      </span>
      {/* 6.4: AI-source tag — surfaces auto-categorized expense rows
          so users can tell which categorizations are inferred (MCC +
          description match) vs explicit (user override, manual entry,
          splits, transfers, fallback "other"). Skipped on:
            – manual expenses (`_manual`): user typed the category
            – overridden rows: explicit user choice, shows "змін." instead
            – internal transfers: special routing, not categorization
            – income rows: handled by separate income flow above
            – "other" fallback: no real inference happened
      */}
      {!tx._manual &&
        !overrideCatId &&
        !isIncome &&
        !isTransfer &&
        catId !== "other" && (
          <Badge
            variant="finyk"
            tone="soft"
            size="xs"
            className="shrink-0 inline-flex items-center rounded-full"
            title="Категорію визначив Сержант за описом і MCC"
          >
            <Icon name="sergeant" size={10} aria-hidden />
            {/* Badge — generic <span>, тож aria-label імені йому не дає;
                ім'я для скрінрідера — прихований текст. */}
            <span className="sr-only">
              Категорію визначив Сержант за описом і MCC
            </span>
          </Badge>
        )}
      {hasMeta && (
        <span className="shrink-0 inline-flex items-center gap-1 text-style-caption text-muted">
          {showAccountName && (
            <span className="inline-flex items-center gap-1" data-tx-account>
              {/* §2: рахунок завжди нейтральний — «кредитна» позначає
                  іконка, не колір. Червоне лишається боргам/активам. */}
              {isCreditCard && (
                <Icon name="credit-card" size={12} aria-hidden />
              )}
              {accountName}
            </span>
          )}
          {statuses.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1">
              {(i > 0 || showAccountName) && <span aria-hidden>·</span>}
              <span>{label}</span>
            </span>
          ))}
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
