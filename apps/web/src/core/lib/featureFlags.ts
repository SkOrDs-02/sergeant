// Легкі feature flags для Hub.
//
// Мета: постачати експериментальні фічі під «тумблером», який користувач
// бачить у Settings → Експериментальне, і мати можливість вмикати/вимикати
// їх з коду без редеплою (корисно, коли експеримент ламається у прод-даних).
//
// API надихнувся vercel/flags і react-feature-flags, але без мережевого шару:
// значення живуть у localStorage (`hub_flags_v1`) поверх typedStore, тобто
// отримують ті самі бонуси — валідація, міграції, sync між tab'ами.
//
// Правила:
//  - всі флаги декларовані у одному реєстрі нижче;
//  - кожен флаг має id, default, label/description і опц. `experimental: true`;
//  - для нових флагів ДОДАЙТЕ запис у FLAG_REGISTRY, не створюйте окремі LS-ключі.

import { useSyncExternalStore } from "react";
import { z } from "zod";
import { createTypedStore } from "../../shared/lib/storage/typedStore";

export interface FlagDefinition {
  id: string;
  /** Видима назва у Settings. */
  label: string;
  /** Коротка підказка — чому це включати. */
  description: string;
  /** Значення за замовчуванням, якщо користувач ще не торкався. */
  defaultValue: boolean;
  /** Якщо true — показується у розділі «Експериментальне» з ярликом beta. */
  experimental?: boolean;
}

// ---------------------------------------------------------------------------
// Реєстр флагів. Додавайте сюди — решта екосистеми (Settings UI, `useFlag`)
// підхоплює автоматично.
// ---------------------------------------------------------------------------

export const FLAG_REGISTRY: readonly FlagDefinition[] = [
  {
    id: "app-lock-enabled",
    label: "Блокування додатку (PIN)",
    description:
      "Захищає дані PIN-кодом. При увімкненні — встановлюй PIN у Конфіденційність → Блокування. PR-1a UX-roast 2026-Q2.",
    defaultValue: false,
    experimental: true,
  },
  {
    id: "finyk_subscriptions_category",
    label: "Категорія «Підписки» у швидкому додаванні",
    description:
      "Додає окрему кнопку для підписок у ManualExpenseSheet (раніше вони потрапляли у «інше»).",
    defaultValue: false,
    experimental: true,
  },
  {
    id: "hub_command_palette",
    label: "Command Palette (Ctrl/⌘+K)",
    description:
      "Глобальний пошук і дії через клавіатуру. Ранній preview — може не працювати у деяких PWA-кейсах.",
    defaultValue: false,
    experimental: true,
  },
  {
    id: "feature.routine.sqlite_v2.read_sqlite",
    label: "Routine — read completions from SQLite",
    description:
      "Completions читаються з локальної SQLite (`routine_entries`) замість LS blob. LS-write залишається як source-of-truth для habits / tags / categories / prefs / pushups / habitOrder / completionNotes (відсутні у SQLite-схемі рутини). Stage 8 PR #055r2 storage-roadmap — default-on rollout. SQLite mirror для completions — unconditional з PR #056r. Default: on.",
    defaultValue: true,
    experimental: true,
  },
  {
    id: "feature.fizruk.sqlite_v2.read_sqlite",
    label: "Fizruk — read from SQLite",
    description:
      "Workouts / custom exercises / measurements читаються з локальної SQLite (`fizruk_*`) замість LS. LS-write залишається як source-of-truth. Stage 8 PR #055f2 storage-roadmap — default-on rollout. SQLite mirror — unconditional з PR #056f. Default: on.",
    defaultValue: true,
    experimental: true,
  },
  {
    id: "feature.nutrition.sqlite_v2.dual_write",
    label: "Nutrition — dual-write LS↔SQLite",
    description:
      "Кожен write у localStorage Харчування додатково мирорить у локальну SQLite (`nutrition_meals`, `nutrition_pantries`, `nutrition_pantry_items`, `nutrition_prefs`, `nutrition_recipes`). Reads ще беруться з LS/IDB. Stage 8 PR #055n1 storage-roadmap — default-on rollout. Best-effort: помилка SQLite-запису не ламає LS. Default: on.",
    defaultValue: true,
    experimental: true,
  },
  {
    id: "feature.nutrition.sqlite_v2.read_sqlite",
    label: "Nutrition — read from SQLite",
    description:
      "Meals / pantries / prefs / recipes читаються з локальної SQLite (`nutrition_*`) замість LS. LS-write залишається як safety net. Stage 8 PR #055n2 storage-roadmap — default-on rollout. Потребує увімкненого dual-write. Default: on.",
    defaultValue: true,
    experimental: true,
  },
  {
    id: "feature.finyk.sqlite_v2.read_sqlite",
    label: "Finyk — read from SQLite",
    description:
      "Hidden / budgets / subscriptions / assets / debts / receivables / custom categories / manual expenses / tx categories / tx splits / mono debt links / networth history / prefs читаються з локальної SQLite (`finyk_*`) замість LS. LS-write залишається як safety net. Stage 8 PR #055k2 storage-roadmap — default-on rollout. SQLite mirror — unconditional з PR #056k. Default: on.",
    defaultValue: true,
    experimental: true,
  },
  {
    id: "feature.finyk.sqlite_v2.mono_mirror",
    label: "Finyk — Mono cache mirror",
    description:
      "Mono транзакції / акаунти / balance-snapshots мирорять у локальну SQLite (`finyk_mono_transactions`, `finyk_mono_accounts`, `finyk_mono_account_snapshots`) на кожен fetch. Reads у `useMonobankWebhook` оверлеять з SQLite до прильоту мережі. LS-write (`finyk_tx_cache`, `finyk_info_cache`, `finyk_tx_cache_last_good`) залишається як safety net. Stage 8 PR #055k1 storage-roadmap — default-on rollout. Default: on.",
    defaultValue: true,
    experimental: true,
  },
] as const;

export type FlagId = (typeof FLAG_REGISTRY)[number]["id"];

// ---------------------------------------------------------------------------
// Сховище
// ---------------------------------------------------------------------------

const FlagValuesSchema = z.record(z.string(), z.boolean());
type FlagValues = z.infer<typeof FlagValuesSchema>;

const flagsStore = createTypedStore<FlagValues>({
  key: "hub_flags_v1",
  version: 1,
  schema: FlagValuesSchema,
  defaultValue: {},
});

function defaults(): FlagValues {
  const out: FlagValues = {};
  for (const f of FLAG_REGISTRY) out[f.id] = f.defaultValue;
  return out;
}

export function getFlagDefinition(id: string): FlagDefinition | undefined {
  return FLAG_REGISTRY.find((f) => f.id === id);
}

export function getFlag(id: FlagId | string): boolean {
  const def = getFlagDefinition(id);
  if (!def) return false;
  const stored = flagsStore.get();
  if (Object.prototype.hasOwnProperty.call(stored, id)) {
    return Boolean(stored[id]);
  }
  return def.defaultValue;
}

export function setFlag(id: FlagId | string, value: boolean): boolean {
  const def = getFlagDefinition(id);
  if (!def) return false;
  const current = flagsStore.get();
  const next: FlagValues = { ...current, [id]: Boolean(value) };
  return flagsStore.set(next);
}

export function resetFlags(): void {
  flagsStore.reset();
}

// Кеш снапшоту всіх флагів. `useSyncExternalStore` вимагає реф-стабільний
// результат від `getSnapshot` між оновленнями store'а — інакше React
// вважає, що state змінився, і ганяє ре-рендери/лупить у concurrent mode.
let cachedAllFlagsSnapshot: Record<string, boolean> | null = null;
flagsStore.subscribe(() => {
  cachedAllFlagsSnapshot = null;
});

/** Повертає поточні значення з підставленими defaults — зручно для UI. */
export function getAllFlags(): Record<string, boolean> {
  if (cachedAllFlagsSnapshot) return cachedAllFlagsSnapshot;
  const snapshot = { ...defaults(), ...flagsStore.get() };
  cachedAllFlagsSnapshot = snapshot;
  return snapshot;
}

/**
 * React-хук: реактивно читає значення одного флагу. Оновлюється при
 * `setFlag` з будь-якого компонента, а також при зовнішніх змінах LS.
 */
export function useFlag(id: FlagId | string): boolean {
  return useSyncExternalStore(
    (onChange) => flagsStore.subscribe(onChange),
    () => getFlag(id),
    () => getFlag(id),
  );
}

/** React-хук: всі флаги одразу, для Settings-екрану. */
export function useAllFlags(): Record<string, boolean> {
  return useSyncExternalStore(
    (onChange) => flagsStore.subscribe(onChange),
    getAllFlags,
    getAllFlags,
  );
}

export { flagsStore as __flagsStoreForTests };
