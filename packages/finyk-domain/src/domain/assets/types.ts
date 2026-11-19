/**
 * Strict types for the Finyk Assets page domain.
 *
 * Kept separate from {@link ./aggregates} so both the mobile/web UI and
 * the pure selectors can import the exact same shapes without a runtime
 * cycle. All types model the user-facing view of a UAH-first ledger —
 * bank accounts (Monobank), user-managed manual assets (cash, crypto,
 * brokerage…), outgoing debts (liabilities), and incoming receivables
 * (money owed to the user).
 */

import type { MonoAccount } from "../../lib/accounts.js";
import type { Debt, Receivable } from "../debtEngine.js";
import type { Transaction } from "../types.js";

export type { MonoAccount };

/** Three-letter ISO-4217 currency code. Kept open for forward-compat. */
export type AssetCurrency = "UAH" | "USD" | "EUR" | (string & {});

/**
 * Тип рахунку-активу поза Моно (спека `finyk-savings-assets.md`). Без
 * `kind` (або `other`) актив поводиться як до спеки: вартість = `amount`.
 */
export type AssetKind = "deposit" | "ovdp" | "fund" | "other";

/**
 * Подія журналу активу. `contribution` / `withdrawal` — гроші в актив і
 * назад (переказ у відкладення, не витрата й не дохід), `income` — виплачений
 * дохід (купон, відсотки), `valuation` — оцінка «коштує на дату».
 */
export type AssetEventType =
  "contribution" | "withdrawal" | "income" | "valuation";

export interface AssetEvent {
  id: string;
  type: AssetEventType;
  /** `YYYY-MM-DD` за годинником пристрою (ADR-0078). */
  date: string;
  /** Копійки/центи у валюті активу, ≥ 0. */
  amountMinor: number;
  /** Привʼязана банківська операція. */
  txId?: string | undefined;
  /** ОВДП: кількість облігацій у внеску (купівля) чи поверненні (продаж). */
  count?: number | undefined;
}

/** `monthly` — щомісячна капіталізація, `end` — у кінці строку, `payout` — виплата на картку. */
export type DepositCapitalization = "monthly" | "end" | "payout";

export interface DepositParams {
  /** Річна ставка, %. */
  ratePct: number;
  /** `YYYY-MM-DD`: з цієї дати нараховуються відсотки. */
  startDate: string;
  /** `YYYY-MM-DD` кінця строку; без неї — безстроковий. */
  endDate?: string | null | undefined;
  capitalization: DepositCapitalization;
  /** Податок на відсотки, %. */
  taxPct: number;
}

export interface OvdpParams {
  /** Номінал однієї облігації, копійки/центи. */
  nominalMinor: number;
  /** Річна купонна ставка, %. */
  couponRatePct: number;
  /** Купонних виплат на рік. */
  couponsPerYear: number;
  /** `YYYY-MM-DD` погашення. */
  maturityDate: string;
  /** Податок на купон, %. */
  taxPct: number;
}

/** Курс, який користувач вводить сам: гривень за одиницю валюти активу. */
export interface AssetFxRate {
  uahPerUnit: number;
  /** `YYYY-MM-DD`, від якої дати курс. */
  asOf: string;
}

/**
 * User-added "manual" asset row rendered in the Assets page.
 * The canonical persisted shape (keys match `finyk_assets` localStorage /
 * MMKV entries). `amount` is in major units (UAH, not копійки) so it
 * lines up with how the Assets UI reads it.
 *
 * Поля після `currency` — рахунки-активи (спека `finyk-savings-assets.md`).
 * Синкаються як частина `finyk_assets.data_json` без міграції. Для актива
 * з `kind` писач тримає в `amount` вартість на момент запису (у валюті
 * активу, основні одиниці), щоб старий клієнт показав осмислене число.
 */
export interface ManualAsset {
  id: string;
  name: string;
  emoji?: string;
  amount: number;
  currency: AssetCurrency;
  kind?: AssetKind | undefined;
  events?: readonly AssetEvent[] | undefined;
  deposit?: DepositParams | undefined;
  ovdp?: OvdpParams | undefined;
  fxRate?: AssetFxRate | null | undefined;
  /** Закритий актив не входить у капітал і «Відкладено за місяць». */
  status?: "active" | "closed" | undefined;
  closedAt?: string | null | undefined;
}

/**
 * Extension of the base `Debt` / `Receivable` domain with the optional
 * UI fields Assets edits (name, emoji, due date, note).
 */
export interface AssetsDebt extends Debt {
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  note?: string;
}

export interface AssetsReceivable extends Receivable {
  name?: string;
  emoji?: string;
  dueDate?: string | null;
  note?: string;
}

/**
 * Minimal Monobank "jar" (банка) shape consumed by
 * {@link computeAssetsSummary}. Mirrors the fields
 * `MonoJarDtoSchema`/`MonoJarDto` (`packages/shared/src/schemas/api.ts`)
 * actually needs here — kept loose/duck-typed so this package doesn't
 * pull in `@sergeant/shared`'s zod schema just for a structural shape.
 */
export interface MonoJarLike {
  id?: string | undefined;
  title?: string | null | undefined;
  /** Minor units (копійки), like `MonoAccount.balance`. */
  balance?: number | null | undefined;
  /** Minor units (копійки); `null`/`undefined` when no goal is set. */
  goal?: number | null | undefined;
  currencyCode?: number | undefined;
}

/** Aggregated totals used by the Assets page networth header. */
export interface AssetsSummary {
  /** Mono (real-bank) UAH balance sum — excludes hidden accounts. */
  monoBalance: number;
  /** Mono credit-card debt in UAH. */
  monoDebt: number;
  /** Sum of UAH-denominated manual assets. */
  manualAssetTotal: number;
  /** Sum of UAH-denominated Monobank jar ("банка") balances. */
  jarsTotal: number;
  /** Sum of manual-debt remaining amounts (≥ 0 per row). */
  manualDebtTotal: number;
  /** Sum of receivable remaining amounts (≥ 0 per row). */
  receivableTotal: number;
  /** «Готівка на руках», UAH (0, коли рахунку немає). */
  cashOnHandTotal: number;
  /** Assets side: mono + manual + receivables + jars + cash on hand. */
  totalAssets: number;
  /** Liability side: mono credit debt + manual debts. */
  totalLiabilities: number;
  /** Networth = totalAssets − totalLiabilities. */
  networth: number;
}

/** Shape consumed by {@link computeAssetsSummary}. */
export interface AssetsSummaryInput {
  accounts: MonoAccount[];
  hiddenAccounts?: readonly string[];
  manualAssets: readonly ManualAsset[];
  manualDebts: readonly AssetsDebt[];
  receivables: readonly AssetsReceivable[];
  transactions: readonly Transaction[];
  /**
   * Monobank jars ("банки"). Optional — backward compatible for callers
   * (e.g. `apps/mobile`) that don't pass jars yet. Omitted/undefined
   * behaves exactly like `[]`.
   */
  jars?: readonly MonoJarLike[] | undefined;
  /** Баланс «Готівки на руках» у копійках; `null`, коли рахунку немає. */
  cashOnHandMinor?: number | null | undefined;
  /**
   * `YYYY-MM-DD`, на яку рахується вартість активів із типом. Без неї —
   * сьогодні за годинником пристрою.
   */
  today?: string | undefined;
}
