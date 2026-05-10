/**
 * Budgets store for Finyk (mobile).
 *
 * Owns three slices that the `BudgetsPage` reads / writes:
 *   - budgets        → finyk_budgets         (FINYK_BUDGETS)
 *   - monthlyPlan    → finyk_monthly_plan    (FINYK_MONTHLY_PLAN)
 *   - subscriptions  → finyk_subs            (FINYK_SUBS)
 *
 * Stage 8 PR #057k-tombstone: MMKV writes removed. Init reads MMKV as
 * a synchronous first-paint fallback; the SQLite overlay snaps in once
 * warm. Mutations flow solely through the dual-write pipeline.
 */
import { useCallback, useEffect, useState } from "react";

import { DEFAULT_SUBSCRIPTIONS } from "@sergeant/finyk-domain";
import type { Budget, MonthlyPlan } from "@sergeant/finyk-domain/domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { safeReadLS } from "@/lib/storage";

import { triggerFinykDualWrite } from "./dualWrite";
import { EMPTY_FINYK_STATE, type FinykPrefsSnapshot } from "./dualWrite/diff";
import { blobsFromArray, stateWithSlice } from "./dualWrite/extract";
import { getCachedFinykSqliteState } from "./sqliteReader";
import { useFinykSqliteReadTick } from "./sqliteReadGate";

const KEY_BUDGETS = STORAGE_KEYS.FINYK_BUDGETS;
const KEY_MONTHLY_PLAN = STORAGE_KEYS.FINYK_MONTHLY_PLAN;
const KEY_SUBS = STORAGE_KEYS.FINYK_SUBS;

const SHOW_BALANCE_KEY = STORAGE_KEYS.FINYK_SHOW_BALANCE;

function readShowBalance(): boolean {
  const v = safeReadLS<unknown>(SHOW_BALANCE_KEY, true);
  return typeof v === "boolean" ? v : true;
}

function prefsFrom(plan: MonthlyPlanInput): FinykPrefsSnapshot {
  let monthlyPlanJson = "{}";
  try {
    monthlyPlanJson = JSON.stringify(plan ?? {});
  } catch {
    monthlyPlanJson = "{}";
  }
  // Stage 13 / PR #075 — мобілка не пише в `excluded_stat_tx_ids` /
  // `dismissed_recurring`, але snapshot мусить мати поля, інакше LWW
  // на server-side затре існуючі значення нулями. Читаємо їх із
  // локальної SQLite-кеш-таблиці, щоб preserve-нути попередній стан.
  const cache = readPrefsArraysFromCache();
  return {
    monthlyPlanJson,
    showBalance: readShowBalance(),
    excludedStatTxIdsJson: cache.excludedStatTxIdsJson,
    dismissedRecurringJson: cache.dismissedRecurringJson,
  };
}

function readPrefsArraysFromCache(): {
  excludedStatTxIdsJson: string;
  dismissedRecurringJson: string;
} {
  const cache = getCachedFinykSqliteState();
  return {
    excludedStatTxIdsJson: serializeArray(cache.excludedStatTxIds),
    dismissedRecurringJson: serializeArray(cache.dismissedRecurring),
  };
}

function serializeArray(value: readonly string[] | null | undefined): string {
  if (!Array.isArray(value)) return "[]";
  try {
    return JSON.stringify(value);
  } catch {
    return "[]";
  }
}

/**
 * Subscription record persisted under FINYK_SUBS. Shape mirrors the
 * web `useStorage` hook so a backup exported from web round-trips
 * without conversion.
 */
export interface Subscription {
  id: string;
  name: string;
  emoji: string;
  /** Substring matched against tx description for auto-detection. */
  keyword: string;
  /** Day of month (1–31) the subscription typically charges. */
  billingDay: number;
  /** ISO 4217 currency. UAH or USD in practice. */
  currency: string;
  /** Optional manual hint at the monthly cost for offline display. */
  monthlyCost?: number;
  /** Optional link to a representative tx id (set by recurring-detector). */
  linkedTxId?: string;
}

/**
 * The web `useStorage` hook keeps `monthlyPlan` as a string-typed
 * record because its inputs feed straight into HTML number fields.
 * Mobile inputs use `keyboardType="numeric"`, so we keep the same
 * string type for round-trip parity with backups.
 */
export interface MonthlyPlanInput {
  income?: string | number;
  expense?: string | number;
  savings?: string | number;
}

const DEFAULT_PLAN: MonthlyPlanInput = { income: "", expense: "", savings: "" };

function read<T>(key: string, fallback: T): T {
  const v = safeReadLS<T>(key, fallback);
  return v == null ? fallback : v;
}

export interface FinykBudgetsSeed {
  budgets?: Budget[];
  monthlyPlan?: MonthlyPlanInput | MonthlyPlan;
  subscriptions?: Subscription[];
}

export interface UseFinykBudgetsStoreReturn {
  budgets: Budget[];
  monthlyPlan: MonthlyPlanInput;
  subscriptions: Subscription[];
  setBudgets: (next: Budget[] | ((prev: Budget[]) => Budget[])) => void;
  setMonthlyPlan: (
    next: MonthlyPlanInput | ((prev: MonthlyPlanInput) => MonthlyPlanInput),
  ) => void;
  setSubscriptions: (
    next: Subscription[] | ((prev: Subscription[]) => Subscription[]),
  ) => void;
}

export function useFinykBudgetsStore(
  seed?: FinykBudgetsSeed,
): UseFinykBudgetsStoreReturn {
  const [budgets, setBudgetsState] = useState<Budget[]>(
    () => seed?.budgets ?? read<Budget[]>(KEY_BUDGETS, []),
  );
  const [monthlyPlan, setMonthlyPlanState] = useState<MonthlyPlanInput>(
    () =>
      (seed?.monthlyPlan as MonthlyPlanInput | undefined) ??
      read<MonthlyPlanInput>(KEY_MONTHLY_PLAN, DEFAULT_PLAN),
  );
  const [subscriptions, setSubscriptionsState] = useState<Subscription[]>(
    () =>
      seed?.subscriptions ??
      read<Subscription[]>(KEY_SUBS, DEFAULT_SUBSCRIPTIONS as Subscription[]),
  );

  // Stage 8 PR #057k-tombstone — overlay each persisted slice from
  // the local SQLite cache once it's warm. MMKV reads above stay as
  // a synchronous first-paint fallback; MMKV writes are gone.
  const sqliteCacheTick = useFinykSqliteReadTick();
  useEffect(() => {
    const cache = getCachedFinykSqliteState();
    if (cache.refreshedAt === null) return;
    setBudgetsState(cache.budgets);
    setSubscriptionsState(cache.subscriptions);
    if (cache.monthlyPlan !== null) {
      // `MonthlyPlan` (cache) is the canonical numeric/string-typed
      // shape; mobile's `MonthlyPlanInput` accepts both — every field
      // is `string | number | undefined`, so the assignment is a
      // structural widening, not a downcast.
      setMonthlyPlanState(cache.monthlyPlan);
    }
  }, [sqliteCacheTick]);

  const setBudgets = useCallback<UseFinykBudgetsStoreReturn["setBudgets"]>(
    (next) => {
      setBudgetsState((prev) => {
        const value =
          typeof next === "function"
            ? (next as (p: Budget[]) => Budget[])(prev)
            : next;
        triggerFinykDualWrite(
          stateWithSlice("budgets", blobsFromArray(prev)),
          stateWithSlice("budgets", blobsFromArray(value)),
        );
        return value;
      });
    },
    [],
  );

  const setMonthlyPlan = useCallback<
    UseFinykBudgetsStoreReturn["setMonthlyPlan"]
  >((next) => {
    setMonthlyPlanState((prev) => {
      const value =
        typeof next === "function"
          ? (next as (p: MonthlyPlanInput) => MonthlyPlanInput)(prev)
          : next;
      triggerFinykDualWrite(
        { ...EMPTY_FINYK_STATE, prefs: prefsFrom(prev) },
        { ...EMPTY_FINYK_STATE, prefs: prefsFrom(value) },
      );
      return value;
    });
  }, []);

  const setSubscriptions = useCallback<
    UseFinykBudgetsStoreReturn["setSubscriptions"]
  >((next) => {
    setSubscriptionsState((prev) => {
      const value =
        typeof next === "function"
          ? (next as (p: Subscription[]) => Subscription[])(prev)
          : next;
      triggerFinykDualWrite(
        stateWithSlice("subscriptions", blobsFromArray(prev)),
        stateWithSlice("subscriptions", blobsFromArray(value)),
      );
      return value;
    });
  }, []);

  return {
    budgets,
    monthlyPlan,
    subscriptions,
    setBudgets,
    setMonthlyPlan,
    setSubscriptions,
  };
}
