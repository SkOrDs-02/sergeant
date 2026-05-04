/**
 * Dashboard module ordering — pure helpers.
 *
 * The Hub dashboard renders one status row per module. The user can
 * reorder rows (drag-and-drop on web, long-press-and-drag on mobile)
 * and the chosen order is persisted under `STORAGE_KEYS.DASHBOARD_ORDER`.
 *
 * This module lives in `@sergeant/shared` so the web and mobile ports
 * share a single source of truth for:
 *  - which module ids exist (`DASHBOARD_MODULE_IDS`);
 *  - the default order shown to a fresh user (`DEFAULT_DASHBOARD_ORDER`);
 *  - user-facing Ukrainian labels (`DASHBOARD_MODULE_LABELS`);
 *  - normalization of an unknown persisted value into a safe order
 *    (`normalizeDashboardOrder`);
 *  - the drop-index arithmetic used by the mobile long-press drag
 *    implementation when some modules are hidden from the visible
 *    list (`reorderWithHidden`).
 *
 * The helpers are DOM-free so they can be imported from any
 * environment; storage I/O is the caller's responsibility.
 */

/* ═══════════════════════════════════════════════════════════════════════════
   Dashboard layout density — compact / comfortable / spacious.
   Affects card padding, gap sizes, and font weights in the hub grid.
   Persisted under `STORAGE_KEYS.DASHBOARD_DENSITY`.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DASHBOARD_DENSITIES = [
  "compact",
  "comfortable",
  "spacious",
] as const;

export type DashboardDensity = (typeof DASHBOARD_DENSITIES)[number];

export const DEFAULT_DASHBOARD_DENSITY: DashboardDensity = "comfortable";

export const DASHBOARD_DENSITY_LABELS: Record<DashboardDensity, string> = {
  compact: "Компактно",
  comfortable: "Комфортно",
  spacious: "Просторо",
};

export const DASHBOARD_DENSITY_DESCRIPTIONS: Record<DashboardDensity, string> =
  {
    compact: "Більше інформації, менше простору",
    comfortable: "Баланс між інформацією і повітрям",
    spacious: "Великі картки, більше повітря",
  };

/** Spacing tokens (in Tailwind units) per density level. */
export const DASHBOARD_DENSITY_SPACING: Record<
  DashboardDensity,
  {
    /** Gap between cards (Tailwind: gap-N) */
    cardGap: number;
    /** Card internal padding (Tailwind: p-N) */
    cardPadding: number;
    /** Section vertical margin (Tailwind: my-N) */
    sectionGap: number;
  }
> = {
  compact: { cardGap: 2, cardPadding: 3, sectionGap: 3 },
  comfortable: { cardGap: 3, cardPadding: 4, sectionGap: 5 },
  spacious: { cardGap: 4, cardPadding: 5, sectionGap: 6 },
};

/**
 * Custom DOM event name that the Settings → Дашборд density picker
 * dispatches on `window` so that an already-mounted Hub dashboard re-renders
 * with the new spacing without waiting for the next remount or storage event.
 *
 * Same-window `localStorage` writes do NOT fire `storage` events, so the
 * picker has to nudge listeners explicitly. Cross-tab updates are still
 * picked up via the standard `storage` event in parallel.
 */
export const DASHBOARD_DENSITY_EVENT = "sergeant:dashboard-density-changed";

export function isDashboardDensity(value: unknown): value is DashboardDensity {
  return (
    typeof value === "string" &&
    (DASHBOARD_DENSITIES as readonly string[]).includes(value)
  );
}

export function normalizeDashboardDensity(raw: unknown): DashboardDensity {
  return isDashboardDensity(raw) ? raw : DEFAULT_DASHBOARD_DENSITY;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Dashboard module ordering — pure helpers.
   ═══════════════════════════════════════════════════════════════════════════ */

export const DASHBOARD_MODULE_IDS = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const;

export type DashboardModuleId = (typeof DASHBOARD_MODULE_IDS)[number];

export const DEFAULT_DASHBOARD_ORDER: readonly DashboardModuleId[] = [
  ...DASHBOARD_MODULE_IDS,
];

export const DASHBOARD_MODULE_LABELS: Record<DashboardModuleId, string> = {
  finyk: "Фінік",
  fizruk: "Фізрук",
  routine: "Рутина",
  nutrition: "Харчування",
};

export function isDashboardModuleId(
  value: unknown,
): value is DashboardModuleId {
  return (
    typeof value === "string" &&
    (DASHBOARD_MODULE_IDS as readonly string[]).includes(value)
  );
}

/**
 * Accept any raw value (JSON-parsed storage payload, API response,
 * etc.) and return a well-formed dashboard order.
 *
 * Validity rules (match the pre-existing web behaviour):
 *  - must be an array;
 *  - length must equal `DEFAULT_DASHBOARD_ORDER.length`;
 *  - every id in `DEFAULT_DASHBOARD_ORDER` must appear once.
 *
 * Anything else (legacy shorter arrays, duplicates, unknown ids)
 * falls back to the default. We never return a partial order so
 * callers do not need a secondary validation pass.
 */
export function normalizeDashboardOrder(raw: unknown): DashboardModuleId[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DASHBOARD_ORDER];
  if (raw.length !== DEFAULT_DASHBOARD_ORDER.length) {
    return [...DEFAULT_DASHBOARD_ORDER];
  }
  const seen = new Set<string>();
  for (const id of raw) {
    if (!isDashboardModuleId(id)) return [...DEFAULT_DASHBOARD_ORDER];
    if (seen.has(id)) return [...DEFAULT_DASHBOARD_ORDER];
    seen.add(id);
  }
  for (const id of DEFAULT_DASHBOARD_ORDER) {
    if (!seen.has(id)) return [...DEFAULT_DASHBOARD_ORDER];
  }
  return raw as DashboardModuleId[];
}

/**
 * Move a single id within an array. Returns a fresh copy; the input
 * is never mutated. Out-of-range indices or a no-op move fall back
 * to a shallow clone of the input.
 */
export function arrayMoveImmutable<T>(
  list: readonly T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (fromIndex === toIndex) return [...list];
  if (fromIndex < 0 || fromIndex >= list.length) return [...list];
  if (toIndex < 0 || toIndex >= list.length) return [...list];
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...list];
  next.splice(toIndex, 0, moved);
  return next;
}

/**
 * Reorder the *visible* subset of a full dashboard order while
 * preserving the slot positions of hidden modules.
 *
 * Problem: on mobile we render only modules the current phase
 * supports (e.g. `["finyk", "fizruk", "routine"]` — Nutrition is
 * hidden until Phase 7). The persisted order still holds all four
 * ids so a web client opening the same account sees the full list.
 * When the user drags two visible rows, we must translate the
 * visible-index move into a full-order move without touching the
 * positions of any hidden slot.
 *
 * Algorithm:
 *  1. Extract the sub-list of ids in `full` that belong to `visible`,
 *     in their current order.
 *  2. Apply `arrayMoveImmutable` to that sub-list using the passed
 *     `fromVisibleIndex` / `toVisibleIndex`.
 *  3. Walk `full` slot by slot. At every slot that currently holds a
 *     visible id, pop the next id off the reordered sub-list; hidden
 *     slots keep their original id.
 *
 * Invariants preserved:
 *  - output has the same length and same multiset of ids as `full`;
 *  - every hidden id stays at the same index;
 *  - visible ids appear in the reordered sub-list's order.
 */
export function reorderWithHidden(
  full: readonly DashboardModuleId[],
  visibleIds: readonly DashboardModuleId[],
  fromVisibleIndex: number,
  toVisibleIndex: number,
): DashboardModuleId[] {
  const visibleSet = new Set<DashboardModuleId>(visibleIds);
  const currentVisibleOrder = full.filter((id) => visibleSet.has(id));
  const reorderedVisible = arrayMoveImmutable(
    currentVisibleOrder,
    fromVisibleIndex,
    toVisibleIndex,
  );
  const next: DashboardModuleId[] = [];
  let cursor = 0;
  for (const id of full) {
    if (visibleSet.has(id)) {
      next.push(reorderedVisible[cursor] ?? id);
      cursor += 1;
    } else {
      next.push(id);
    }
  }
  return next;
}

/**
 * Filter a full order down to the subset currently rendered on this
 * platform/phase. Preserves the relative order of visible ids.
 */
export function selectVisibleModules(
  full: readonly DashboardModuleId[],
  visibleIds: readonly DashboardModuleId[],
): DashboardModuleId[] {
  const visibleSet = new Set<DashboardModuleId>(visibleIds);
  return full.filter((id) => visibleSet.has(id));
}
