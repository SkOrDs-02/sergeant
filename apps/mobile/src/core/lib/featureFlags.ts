/**
 * Mobile feature-flag registry — first cut.
 *
 * Mirrors the `experimental: true` subset of
 * `apps/web/src/core/lib/featureFlags.ts` until the registry + store
 * stack is lifted into `@sergeant/shared`. Flag IDs and default values
 * stay byte-identical with the web copy so a single MMKV value
 * (`@hub_flags_v1`) round-trips between platforms unchanged.
 *
 * Persistence backend: MMKV via `@/lib/storage`'s `useLocalStorage`
 * hook. The same `@hub_flags_v1` key is used by `ExperimentalSection`
 * to render toggle rows; `useFlag(id)` is the read-side helper for
 * components that want to react to an individual flag.
 */
import { useLocalStorage } from "@/lib/storage";

export interface FlagDefinition {
  /** Flag identifier — string, dotted-namespace allowed. */
  readonly id: string;
  /** Short human-readable label rendered in the settings toggle. */
  readonly label: string;
  /** One-paragraph description rendered under the label. */
  readonly description: string;
  /** Default value when the user has not toggled the flag yet. */
  readonly defaultValue: boolean;
}

/**
 * MMKV key holding the flag-values map. Mirrors the web `hub_flags_v1`
 * typedStore key (minus the shared-schema envelope) so a single
 * cross-platform persistence story is in reach.
 */
export const FLAGS_KEY = "@hub_flags_v1";

export type FlagValues = Record<string, boolean>;

/**
 * Single source of truth for experimental flag definitions on mobile.
 * `ExperimentalSection` renders these as toggle rows; feature-specific
 * gates consume the same defaults via `useFlag()`.
 */
export const EXPERIMENTAL_FLAGS: readonly FlagDefinition[] = [
  {
    id: "finyk_subscriptions_category",
    label: "Категорія «Підписки» у швидкому додаванні",
    description:
      "Додає окрему кнопку для підписок у ManualExpenseSheet (раніше вони потрапляли у «інше»).",
    defaultValue: false,
  },
  {
    id: "hub_command_palette",
    label: "Command Palette (Ctrl/⌘+K)",
    description:
      "Глобальний пошук і дії через клавіатуру. Ранній preview — може не працювати у деяких PWA-кейсах.",
    defaultValue: false,
  },
  {
    id: "feature.routine.sqlite_v2.dual_write",
    label: "Routine — dual-write MMKV↔SQLite",
    description:
      "Кожен write у MMKV Рутини додатково мирорить у локальну SQLite (`routine_entries`). Reads ще беруться з MMKV. Stage 8 PR #055r1 storage-roadmap — default-on rollout. Best-effort: помилка SQLite-запису не ламає MMKV. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.routine.sqlite_v2.read_sqlite",
    label: "Routine — read completions from SQLite",
    description:
      "Completions читаються з локальної SQLite (`routine_entries`) замість MMKV blob. MMKV-write залишається як safety net. Stage 8 PR #055r2 storage-roadmap — default-on rollout. Потребує увімкненого dual-write. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.fizruk.sqlite_v2.dual_write",
    label: "Fizruk — dual-write MMKV↔SQLite",
    description:
      "Кожен write у MMKV Фізрука додатково мирорить у локальну SQLite (`fizruk_workouts`, `fizruk_custom_exercises`, `fizruk_measurements`). Reads ще беруться з MMKV. Stage 8 PR #055f1 storage-roadmap — default-on rollout. Best-effort: помилка SQLite-запису не ламає MMKV. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.fizruk.sqlite_v2.read_sqlite",
    label: "Fizruk — read state from SQLite",
    description:
      "Workouts / measurements / custom exercises читаються з локальної SQLite (`fizruk_*` таблиці) замість MMKV blob. MMKV-write залишається як safety net. Stage 8 PR #055f2 storage-roadmap — default-on rollout. Потребує увімкненого dual-write. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.nutrition.sqlite_v2.dual_write",
    label: "Nutrition — dual-write MMKV↔SQLite",
    description:
      "Кожен write у MMKV Харчування додатково мирорить у локальну SQLite (`nutrition_meals`, `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`, `nutrition_recipes`). Reads ще беруться з MMKV. Stage 8 PR #055n1 storage-roadmap — default-on rollout. Best-effort: помилка SQLite-запису не ламає MMKV. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.nutrition.sqlite_v2.read_sqlite",
    label: "Nutrition — read state from SQLite",
    description:
      "Meals / pantries / prefs / recipes читаються з локальної SQLite (`nutrition_*` таблиці) замість MMKV blob. MMKV-write залишається як safety net. Stage 8 PR #055n2 storage-roadmap — default-on rollout. Потребує увімкненого dual-write. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.finyk.sqlite_v2.dual_write",
    label: "Finyk — dual-write MMKV↔SQLite",
    description:
      "Кожен write у MMKV Finyk-у додатково мирорить у локальну SQLite (`finyk_*` таблиці: hidden_accounts, hidden_transactions, budgets, subscriptions, assets, debts, receivables, custom_categories, manual_expenses, tx_categories, tx_splits, mono_debt_links, networth_history, prefs). Reads ще беруться з MMKV. Stage 8 PR #055k1 storage-roadmap — default-on rollout. Best-effort: помилка SQLite-запису не ламає MMKV. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.finyk.sqlite_v2.read_sqlite",
    label: "Finyk — read state from SQLite",
    description:
      "Hidden / budgets / subscriptions / assets / debts / receivables / custom_categories / manual_expenses / tx_categories / tx_splits / mono_debt_links / networth_history / prefs читаються з локальної SQLite (`finyk_*`) замість MMKV blob. MMKV-write залишається як safety net. Stage 8 PR #055k2 storage-roadmap — default-on rollout. Потребує увімкненого dual-write. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.finyk.sqlite_v2.mono_mirror",
    label: "Finyk — Mono cache mirror",
    description:
      "Mono транзакції / акаунти / balance-snapshots мирорять у локальну SQLite (`finyk_mono_transactions`, `finyk_mono_accounts`, `finyk_mono_account_snapshots`) на кожен Mono fetch. Reads у `transactionsStore.realTx` оверлеять з SQLite до прильоту наступного MMKV-снапшота. MMKV-write (`finyk_tx_cache`, `finyk_info_cache`, `finyk_tx_cache_last_good`) залишається як safety net. Stage 8 PR #055k1 storage-roadmap — default-on rollout. Default: on.",
    defaultValue: true,
  },
] as const;

const DEFAULTS: FlagValues = Object.freeze(
  Object.fromEntries(
    EXPERIMENTAL_FLAGS.map((flag) => [flag.id, flag.defaultValue]),
  ),
);

/**
 * Read a single flag value reactively. Falls back to the registry
 * default when the user has not toggled the flag yet, or when the
 * persisted map does not yet contain the key (initial state on a
 * fresh install).
 *
 * Unknown ids return `false` — same behaviour as the web `useFlag`,
 * keeping calling code from accidentally enabling features when an
 * id is mistyped.
 */
export function useFlag(id: string): boolean {
  const [flags] = useLocalStorage<FlagValues>(FLAGS_KEY, DEFAULTS);
  const stored = flags[id];
  if (typeof stored === "boolean") return stored;
  const def = EXPERIMENTAL_FLAGS.find((f) => f.id === id);
  return def ? def.defaultValue : false;
}
