/**
 * Контракт сторінки «Операції»: зрізи `mono` / `storage`, які читає
 * {@link Transactions}, її пропси і мапінг стану синхронізації в пілюлю
 * {@link TransactionSyncPill}. Винесено з `Transactions.tsx` (Hard Rule #18):
 * сама сторінка лишається оболонкою, а цей файл — єдиним місцем, де
 * описано, що саме сторінка бере з `useUnifiedFinanceData` і `useStorage`.
 * `Transactions.tsx` реекспортує типи, тож старі імпорти працюють.
 */
import type { FinykTxTagsSlice } from "../../hooks/useFinykTxTags";
import type { MerchantRuleActionsDeps } from "../../hooks/useMerchantRuleActions";
import type { MerchantRuleIndex } from "@sergeant/finyk-domain/lib/merchantRules";
import type { UseFinykReceiptLinksResult } from "../../hooks/useFinykReceiptLinks";
import type { CashOnHandState } from "@sergeant/finyk-domain/domain/cashOnHand";
import type {
  Transaction,
  TxCategoriesMap,
  TxSplit,
  TxSplitsMap,
  Category,
} from "@sergeant/finyk-domain/domain/types";
import type {
  Debt,
  LinkedTxRole,
} from "@sergeant/finyk-domain/domain/debtEngine";
import type { ManualExpense } from "@sergeant/finyk-domain/domain/personalization";
import type { ManualExpenseLinkSnapshot } from "../../hooks/manualExpenseDebtLinks";
import type { ManualAsset } from "../../hooks/useStorage";

/**
 * Merged-account shape produced by `useUnifiedFinanceData` (Mono + Privat).
 * Privat entries are opaque except for the `_source` tag, so the slice
 * lists only the subset the page chain actually reads (id for the per-row
 * lookup, creditLimit for the "credit" filter chip). The `_source` tag
 * is included so the privatbank `{ _source: "privatbank" }` literal
 * isn't rejected by TS's weak-type check (all-optional target needs at
 * least one matching property).
 */
export interface TxAccount {
  id?: string | undefined;
  creditLimit?: number | undefined;
  type?: string | undefined;
  _source?: string | undefined;
  [k: string]: unknown;
}

export type PillStatus = "idle" | "loading" | "success" | "partial" | "error";

const PILL_STATUSES: readonly PillStatus[] = [
  "idle",
  "loading",
  "success",
  "partial",
  "error",
];

function isPillStatus(s: string | undefined): s is PillStatus {
  return (
    typeof s === "string" && (PILL_STATUSES as readonly string[]).includes(s)
  );
}

/**
 * Sync status surfaced by the Mono fetcher chain. Status drives the
 * coloured pill in {@link TransactionSyncPill}; `lastUpdated` is rendered
 * underneath as a relative timestamp.
 */
export interface MonoSyncState {
  // After `useUnifiedFinanceData` merges the mono + privat sync states,
  // `status` widens to `string` because the fall-through branch reads
  // `mono.syncState?.status` directly. Keep the slice in sync with that
  // wider shape; `TransactionSyncPill` discriminates on the narrow
  // values it understands and treats anything else as "idle".
  status: string;
  source?: "network" | "cache" | "none";
  accountsOk?: number;
  accountsTotal?: number;
}

/**
 * Звужує широкий `MonoSyncState` до стану пілюлі: невідомий статус → "idle".
 */
export function toSyncPillState(syncState: MonoSyncState) {
  return {
    status: isPillStatus(syncState.status) ? syncState.status : "idle",
    source: syncState.source,
    accountsOk: syncState.accountsOk,
    accountsTotal: syncState.accountsTotal,
  } as const;
}

/**
 * Slice of `useMonobank` (after `useUnifiedFinanceData` merging) that the
 * Transactions page reads. Defined inline to avoid a circular type import
 * on the lazy-loaded page module.
 */
export interface TransactionsMonoSlice {
  realTx: Transaction[];
  loadingTx: boolean;
  lastUpdated: Date | null;
  syncState: MonoSyncState;
  accounts: ReadonlyArray<TxAccount> | undefined;
  /**
   * Банки Monobank (`MonoJarDto`). Їхні id збігаються з `accountId`
   * транзакцій банки, і матчер переказів лічить таку ногу маркером
   * «картка ↔ банка» (див. `transferMatching.jarAccountIds`). У `accounts`
   * банок немає — сервер виносить їх окремим списком.
   */
  jars?: ReadonlyArray<{ monoJarId?: string | undefined }> | undefined;
  fetchMonth: (year: number, month: number) => Promise<unknown>;
  fetchRange?: (from: string, to: string) => Promise<unknown>;
  historyTx: Transaction[];
  loadingHistory: boolean;
  refresh: () => Promise<unknown>;
}

/**
 * Slice of `useStorage` that the Transactions page reads. Defined inline
 * for the same reason as {@link TransactionsMonoSlice}.
 */
export interface TransactionsStorageSlice extends FinykTxTagsSlice {
  /** `false`, поки SQLite-кеш не прогрітий і `txCategories` ще з LS-знімка. */
  storageReady?: boolean;
  hiddenTxIds: string[];
  hideTx: (id: string) => void;
  excludedTxIds: Set<string>;
  /**
   * Обидві ноги скасованих платежів («Скасування. …»): уже в `excludedTxIds`,
   * тут окремо, щоб рядок мав своє слово («скасовано»), а не загальне
   * «не в статистиці».
   */
  cancelledTxIds?: ReadonlySet<string> | undefined;
  excludedStatTxIds: string[] | undefined;
  toggleExcludeFromStats: (id: string) => void;
  /** «Готівка на руках»: підказка й перебиття для знять (ADR-0076). */
  cashOnHand?: CashOnHandState | null | undefined;
  toggleCashCountAsExpense?: ((id: string) => void) | undefined;
  txCategories: TxCategoriesMap;
  /**
   * Правила «Завжди так для цього магазину» і їхні мутатори. Усе необовʼязкове:
   * без них список працює як раніше, а аркуш операції не пропонує правил.
   */
  merchantRuleIndex?: MerchantRuleIndex | undefined;
  upsertMerchantRule?: MerchantRuleActionsDeps["upsertMerchantRule"];
  undoMerchantRule?: MerchantRuleActionsDeps["undoMerchantRule"];
  deleteMerchantRule?: MerchantRuleActionsDeps["deleteMerchantRule"];
  restoreMerchantRules?: MerchantRuleActionsDeps["restoreMerchantRules"];
  customCategories: Category[] | undefined;
  overrideCategory: (id: string, catId: string | null) => void;
  txSplits: TxSplitsMap;
  setSplitTx: (id: string, splits: TxSplit[] | null) => void;
  /** Пасиви + мутатори для мостика «Борг → пасив» (спека finyk-observations,
   * PR-3), прокинуті в {@link BankTransactionDetailsSheet}. */
  manualDebts: Debt[];
  setManualDebts: (updater: (debts: Debt[]) => Debt[]) => void;
  setLinkedTxRole: (
    id: string,
    txId: string,
    type: "debt" | "receivable",
    role: LinkedTxRole | null,
    amountUAH?: number,
  ) => void;
  /** User's own free-text annotation per bank transaction — bank facts
   * (amount/date/merchant) stay immutable, this is the user's note. */
  txNotes: Record<string, string | undefined>;
  setTxNote: (id: string, note: string | null) => void;
  manualExpenses: ManualExpense[] | undefined;
  addManualExpense: (
    expense: Omit<ManualExpense, "id">,
    restoredLinks?: readonly ManualExpenseLinkSnapshot[],
  ) => void;
  removeManualExpense: (id: string) => ManualExpenseLinkSnapshot[] | void;
  /** Рахунки-активи для привʼязки внесків (спека finyk-savings-assets). */
  manualAssets?: ManualAsset[] | undefined;
  setManualAssets?:
    ((updater: (assets: ManualAsset[]) => ManualAsset[]) => void) | undefined;
}

export interface TransactionsProps {
  mono: TransactionsMonoSlice;
  storage: TransactionsStorageSlice;
  showBalance?: boolean;
  categoryFilter?: string | null;
  categoryMonth?: { year: number; month: number } | null;
  categoryRange?: { fromKey: string; toKey: string } | null;
  onClearCategoryFilter?: () => void;
  onEditManualExpense?: (id: string) => void;
  dayFilter?: string | null;
  onClearDayFilter?: () => void;
  /** Device-local чек↔транзакція лінки (спека § Розгортка) — optional so
   * existing test call-sites without receipt-scan context keep compiling. */
  receiptLinks?: UseFinykReceiptLinksResult;
  /**
   * Глибоке посилання `?tx=<id>` (Ф-2 а): відкрити саму операцію. Після
   * відкриття викликається `onFocusTxConsumed`, щоб власник прибрав параметр.
   */
  focusTxId?: string | null;
  onFocusTxConsumed?: () => void;
}
