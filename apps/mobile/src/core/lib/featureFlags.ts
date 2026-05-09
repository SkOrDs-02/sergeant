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
    id: "feature.routine.sqlite_v2.read_sqlite",
    label: "Routine — read completions from SQLite",
    description:
      "Completions читаються з локальної SQLite (`routine_entries`) замість MMKV blob. MMKV-write залишається як source-of-truth для habits / tags / categories / prefs / pushups / habitOrder / completionNotes (відсутні у SQLite-схемі рутини). Stage 8 PR #055r2 storage-roadmap — default-on rollout. SQLite mirror для completions — unconditional з PR #056r. Default: on.",
    defaultValue: true,
  },
  {
    id: "feature.fizruk.sqlite_v2.read_sqlite",
    label: "Fizruk — read state from SQLite",
    description:
      "Workouts / measurements / custom exercises читаються з локальної SQLite (`fizruk_*` таблиці) замість MMKV blob. MMKV-write залишається як source-of-truth. Stage 8 PR #055f2 storage-roadmap — default-on rollout. SQLite mirror — unconditional з PR #056f. Default: on.",
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
