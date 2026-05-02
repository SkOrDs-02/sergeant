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
 * `ExperimentalSection` renders these as toggle rows;
 * feature-specific gates (`RoutineSpikeSection`, …) consume the same
 * defaults via `useFlag()`.
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
    id: "feature.routine.sqlite_v2",
    label: "Routine SPIKE — локальна SQLite + sync v2",
    description:
      "Вмикає dev-only панель у блоці «Акаунт» для зняття замірів decision-gate. Без флагу панель не монтує SPIKE-бібліотеку (нульовий runtime-cost).",
    defaultValue: false,
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
