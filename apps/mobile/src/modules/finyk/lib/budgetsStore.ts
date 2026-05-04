/**
 * MMKV-backed Budgets store for Finyk (mobile).
 *
 * Owns three slices that the `BudgetsPage` reads / writes:
 *   - budgets        → finyk_budgets         (FINYK_BUDGETS)
 *   - monthlyPlan    → finyk_monthly_plan    (FINYK_MONTHLY_PLAN)
 *   - subscriptions  → finyk_subs            (FINYK_SUBS)
 *
 * Each setter persists to MMKV via `safeWriteLS` and then calls
 * `enqueueChange(KEY)` so the cloud-sync scheduler picks the change up
 * — same pattern as `assetsStore.ts` / `transactionsStore.ts`.
 *
 * Read-only deps the page also needs (real bank tx, txCategories,
 * txSplits, customCategories) live in `transactionsStore`; the page
 * composes both hooks rather than duplicating their state here.
 */
import { useCallback, useEffect, useState } from "react";

import { DEFAULT_SUBSCRIPTIONS } from "@sergeant/finyk-domain";
import type { Budget, MonthlyPlan } from "@sergeant/finyk-domain/domain";
import { STORAGE_KEYS } from "@sergeant/shared";

import { _getMMKVInstance, safeReadLS, safeWriteLS } from "@/lib/storage";
import { enqueueChange } from "@/sync/enqueue";

import { isFinykDualWriteRegistered, triggerFinykDualWrite } from "./dualWrite";
import { EMPTY_FINYK_STATE, type FinykPrefsSnapshot } from "./dualWrite/diff";
import { blobsFromArray, stateWithSlice } from "./dualWrite/extract";
import { getCachedFinykSqliteState } from "./sqliteReader";
import { useFinykSqliteReadGate } from "./sqliteReadGate";

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
  return { monthlyPlanJson, showBalance: readShowBalance() };
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

  // Flush seed values through MMKV on first mount so re-renders read
  // through the same code path as production.
  useEffect(() => {
    if (!seed) return;
    if (seed.budgets) safeWriteLS(KEY_BUDGETS, seed.budgets);
    if (seed.monthlyPlan) safeWriteLS(KEY_MONTHLY_PLAN, seed.monthlyPlan);
    if (seed.subscriptions) safeWriteLS(KEY_SUBS, seed.subscriptions);
    // Mount-only: `seed` is expected to be stable (from parent context).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pick up writes from other consumers of these keys (e.g. CloudSync).
  useEffect(() => {
    const mmkv = _getMMKVInstance();
    const sub = mmkv.addOnValueChangedListener((changedKey) => {
      switch (changedKey) {
        case KEY_BUDGETS:
          setBudgetsState(read<Budget[]>(KEY_BUDGETS, []));
          break;
        case KEY_MONTHLY_PLAN:
          setMonthlyPlanState(
            read<MonthlyPlanInput>(KEY_MONTHLY_PLAN, DEFAULT_PLAN),
          );
          break;
        case KEY_SUBS:
          setSubscriptionsState(
            read<Subscription[]>(
              KEY_SUBS,
              DEFAULT_SUBSCRIPTIONS as Subscription[],
            ),
          );
          break;
        default:
          break;
      }
    });
    return () => sub.remove();
  }, []);

  // Stage 4 PR #037 — overlay each persisted slice from the local
  // SQLite cache once it's warm and the read flag is on. MMKV
  // first-paint reads above stay as a fallback.
  const { enabled: sqliteReadEnabled, tick: sqliteCacheTick } =
    useFinykSqliteReadGate();
  useEffect(() => {
    if (!sqliteReadEnabled) return;
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
  }, [sqliteReadEnabled, sqliteCacheTick]);

  const setBudgets = useCallback<UseFinykBudgetsStoreReturn["setBudgets"]>(
    (next) => {
      setBudgetsState((prev) => {
        const value =
          typeof next === "function"
            ? (next as (p: Budget[]) => Budget[])(prev)
            : next;
        safeWriteLS(KEY_BUDGETS, value);
        enqueueChange(KEY_BUDGETS);
        if (isFinykDualWriteRegistered()) {
          triggerFinykDualWrite(
            stateWithSlice("budgets", blobsFromArray(prev)),
            stateWithSlice("budgets", blobsFromArray(value)),
          );
        }
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
      safeWriteLS(KEY_MONTHLY_PLAN, value);
      enqueueChange(KEY_MONTHLY_PLAN);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          { ...EMPTY_FINYK_STATE, prefs: prefsFrom(prev) },
          { ...EMPTY_FINYK_STATE, prefs: prefsFrom(value) },
        );
      }
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
      safeWriteLS(KEY_SUBS, value);
      enqueueChange(KEY_SUBS);
      if (isFinykDualWriteRegistered()) {
        triggerFinykDualWrite(
          stateWithSlice("subscriptions", blobsFromArray(prev)),
          stateWithSlice("subscriptions", blobsFromArray(value)),
        );
      }
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
