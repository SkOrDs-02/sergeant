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
 * User-added "manual" asset row rendered in the Assets page.
 * The canonical persisted shape (keys match `finyk_assets` localStorage /
 * MMKV entries). `amount` is in major units (UAH, not копійки) so it
 * lines up with how the Assets UI reads it.
 */
export interface ManualAsset {
  id: string;
  name: string;
  emoji?: string;
  amount: number;
  currency: AssetCurrency;
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
  /** Assets side: mono + manual + receivables + jars. */
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
}
