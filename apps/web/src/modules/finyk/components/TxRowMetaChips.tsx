import { messages } from "@shared/i18n";
import { cn } from "@shared/lib/ui/cn";
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

import type { MonoAccount } from "@sergeant/finyk-domain/lib/accounts";

import type { TxRowTx } from "./txRowHelpers";

interface TxRowMetaChipsProps {
  tx: TxRowTx;
  catId: string;
  catName: string;
  isIncome: boolean;
  overrideCatId?: string | null | undefined;
  /**
   * Категорію дало правило «Завжди так для цього магазину», а не здогадка за
   * MCC. Статус «за правилом» чесніше за позначку «визначив Сержант» (яку
   * тоді ховаємо): це рішення людини, яке вона ухвалила один раз.
   */
  fromMerchantRule?: boolean | undefined;
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
  /**
   * Явне «Не враховувати у статистиці» (`finyk_excluded_stat_txs`,
   * PR-F4 founder-UX audit 2026-09-13) — окремо від `isTransfer`, який
   * уже виключений неявно (перекази ніколи не рахуються витратою/доходом).
   * Доти маркер «не в статистиці» ставився ЛИШЕ для переказів, тож
   * пакетна дія «Не враховувати» міняла підсумки Огляду й Аналітики без
   * жодного видимого сліду в самому рядку.
   */
  isExcludedFromStats?: boolean | undefined;
  /**
   * Нога скасованого платежу («Uklon −189» + «Скасування. Uklon +189»,
   * `findCancellationPairs`, рішення власника 2026-10-01). Обидві ноги вже
   * виключені зі статистики, тому слово «скасовано» замінює загальне «не в
   * статистиці»: людина бачить причину, а не лише наслідок.
   */
  isCancelled?: boolean | undefined;
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
  fromMerchantRule = false,
  existingSplitsCount,
  account,
  accountName,
  showAccount = true,
  hasReceipt = false,
  note,
  isExcludedFromStats = false,
  isCancelled = false,
}: TxRowMetaChipsProps) {
  const isTransfer = catId === INTERNAL_TRANSFER_ID;
  // Порядок фіксований: рахунок → переказ → «змін.» → П24 → спліт.
  const statuses: string[] = [];
  // Переказ виключений НЕЯВНО (доменне правило), явне виключення —
  // окремою дією людини; обидва шляхи ведуть до того самого видимого
  // маркера, бо для людини наслідок однаковий: рядок не рахується в
  // підсумках.
  if (isCancelled) statuses.push("скасовано");
  else if (isTransfer || isExcludedFromStats) statuses.push("не в статистиці");
  if (overrideCatId && !isTransfer) statuses.push("змін.");
  if (fromMerchantRule && !isTransfer) statuses.push("за правилом");
  if (tx._source === "privatbank") statuses.push("П24");
  if (existingSplitsCount > 0) statuses.push("розбито");

  const showAccountName = showAccount && account && accountName;
  const showAiMark =
    !tx._manual &&
    !overrideCatId &&
    !fromMerchantRule &&
    !isIncome &&
    !isTransfer &&
    catId !== "other";
  const hasMeta = showAiMark || Boolean(showAccountName) || statuses.length > 0;

  return (
    <div className="flex items-center gap-1.5 mt-0.5 overflow-hidden">
      {/* Назва категорії — єдиний елемент рядка, що несе колір самої
          категорії (`.cat-chip` бере його з CSS-змінних), і єдина
          пігулка. Решта — приглушений текст. */}
      <span
        className={cn(
          "shrink-0 text-style-label",
          catId === "other" && !isIncome ? "text-danger-strong" : "text-muted",
        )}
      >
        {catId === "other" && !isIncome
          ? messages.finykRedesign.uncategorized
          : catName}
      </span>
      {hasMeta && (
        <span className="shrink-0 inline-flex items-center gap-1 text-style-caption text-muted">
          {/* 6.4: AI-source mark — surfaces auto-categorized expense rows
              so users can tell which categorizations are inferred (MCC +
              description match) vs explicit. Голий гліф у тому ж
              приглушеному тоні, що й решта рядка, а не Badge: пігулка в
              рядку одна — категорія (рішення власника 2026-09-03).
              Skipped on:
                – manual expenses (`_manual`): user typed the category
                – overridden rows: explicit user choice, shows "змін." instead
                – internal transfers: special routing, not categorization
                – income rows: handled by separate income flow above
                – "other" fallback: no real inference happened
          */}
          {showAiMark && (
            <span title={messages.finykRedesign.autoCategoryHint}>
              {messages.finykRedesign.autoCategorySource}
              <span className="sr-only">
                {messages.finykRedesign.autoCategoryHint}
              </span>
            </span>
          )}
          {showAccountName && (
            <span className="inline-flex items-center gap-1" data-tx-account>
              {showAiMark && <span aria-hidden>·</span>}
              {/* §2: рахунок завжди нейтральний — «кредитна» позначає
                  іконка, не колір. Червоне лишається боргам/активам. */}

              {accountName}
            </span>
          )}
          {statuses.map((label, i) => (
            <span key={label} className="inline-flex items-center gap-1">
              {(i > 0 || showAccountName || showAiMark) && (
                <span aria-hidden>·</span>
              )}
              <span>{label}</span>
            </span>
          ))}
        </span>
      )}
      {hasReceipt && (
        <span className="text-style-caption text-muted">
          {messages.finykRedesign.receipt}
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
