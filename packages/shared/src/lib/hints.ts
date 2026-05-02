/**
 * Hints / tips system — shared, DOM-free core.
 *
 * Goals:
 * - One cross-platform taxonomy (`HintId`) so web + RN cannot drift.
 * - Storage via KVStore (web localStorage adapter, mobile MMKV adapter).
 * - Frequency capping + cooldowns to avoid spam.
 *
 * Rendering is platform-specific (toast / coachmark / sheet). This file
 * only decides "can we show X now?" and records user interactions.
 */
import { readJSON, writeJSON, type KVStore } from "./kvStore";

export type HintId =
  | "ftux_open_search"
  | "ftux_open_chat"
  | "ftux_switch_modules"
  | "ftux_reports_unlock"
  | "ftux_quick_add"
  | "module_first_open"
  | "module_first_entry"
  | "hub_reorder_modules"
  | "settings_hints_toggle"
  | "settings_restart_onboarding"
  // Contextual onboarding hints
  | "ftux_swipe_to_delete"
  // Retention hooks — shown once on the Nth day after first real entry
  | "retention_day_1"
  | "retention_day_3"
  | "retention_day_7";

/**
 * Subset of {@link HintId} that {@link getRetentionHintId} can return.
 * Narrower than `HintId` so callers can index a 3-key message dictionary
 * (`{ retention_day_1, retention_day_3, retention_day_7 }`) without TS errors.
 */
export type RetentionHintId =
  | "retention_day_1"
  | "retention_day_3"
  | "retention_day_7";

export type HintSurface =
  | "welcome"
  | "hub"
  | "module"
  | "settings"
  | "auth"
  | "other";

export interface HintContext {
  platform: "web" | "mobile";
  surface: HintSurface;
  activeModuleId?: string | null;
  /** True when the user is between splash and first real entry (web has a first-class FTUX session). */
  inFtuxSession?: boolean;
  /** True if a first real entry exists (non-demo). */
  hasFirstRealEntry?: boolean;
}

export interface HintDefinition {
  id: HintId;
  /** Primary message — can be used as toast body. */
  title: string;
  /** Optional secondary line for richer surfaces. */
  body?: string;
  /** Hard cap across all time. */
  maxShowsTotal: number;
  /** Minimum time between shows (even if cap not reached). */
  cooldownHours: number;
  /** If user dismisses, do not show again for this many days. */
  dismissCooldownDays: number;
  /** Surfaces where this hint is eligible. */
  surfaces: readonly HintSurface[];
}

/**
 * First batch of 10 hints (8–12 target) to cover:
 * - Hybrid FTUX: 1 real action + short tour
 * - Global discoverability: search/chat/quick add/reorder
 * - Control surfaces: toggle hints + restart onboarding
 *
 * Trigger rules live in app code (context-aware). This registry is the
 * single source of truth for ids + copy + caps.
 */
export const HINT_DEFINITIONS: Readonly<Record<HintId, HintDefinition>> =
  Object.freeze({
    ftux_open_search: {
      id: "ftux_open_search",
      title: "Порада: відкрий пошук (Ctrl/⌘K)",
      body: "Швидко знаходить модулі та дії.",
      maxShowsTotal: 2,
      cooldownHours: 24,
      dismissCooldownDays: 14,
      surfaces: ["hub"],
    },
    ftux_open_chat: {
      id: "ftux_open_chat",
      title: "Порада: чат допоможе з планом на день",
      body: "Спробуй: «Що мені важливо сьогодні?»",
      maxShowsTotal: 2,
      cooldownHours: 24,
      dismissCooldownDays: 14,
      surfaces: ["hub"],
    },
    ftux_switch_modules: {
      id: "ftux_switch_modules",
      title: "Перемикай модулі зверху — це один хаб",
      body: "Фінік/Фізрук/Рутина/Їжа — все в одному місці.",
      maxShowsTotal: 2,
      cooldownHours: 24,
      dismissCooldownDays: 14,
      surfaces: ["hub"],
    },
    ftux_reports_unlock: {
      id: "ftux_reports_unlock",
      title: "Звіти з’являться після першого запису",
      body: "Додай будь-що — і побачиш аналітику там, де вона доречна.",
      maxShowsTotal: 2,
      cooldownHours: 48,
      dismissCooldownDays: 30,
      surfaces: ["hub"],
    },
    ftux_quick_add: {
      id: "ftux_quick_add",
      title: "Швидке додавання — найкоротший шлях",
      body: "Після першого запису підказки зникнуть самі.",
      maxShowsTotal: 2,
      cooldownHours: 24,
      dismissCooldownDays: 14,
      surfaces: ["hub"],
    },
    module_first_open: {
      id: "module_first_open",
      title: "Порада: почни з одного простого запису",
      body: "Краще 5 секунд щодня, ніж ідеально раз на місяць.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["module"],
    },
    module_first_entry: {
      id: "module_first_entry",
      title: "Після першого запису спробуй «Звіти»",
      body: "Там найшвидше видно прогрес і закономірності.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["hub", "module"],
    },
    hub_reorder_modules: {
      id: "hub_reorder_modules",
      title: "Можна переставити модулі під себе",
      body: "Налаштування → Загальні → Упорядкувати модулі.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["hub", "settings"],
    },
    settings_hints_toggle: {
      id: "settings_hints_toggle",
      title: "Підказки можна вимкнути",
      body: "Налаштування → Загальні → Показувати підказки.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["settings"],
    },
    settings_restart_onboarding: {
      id: "settings_restart_onboarding",
      title: "Можна перезапустити онбординг",
      body: "Зручно, якщо хочеш ще раз пройти знайомство.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["settings"],
    },
    // ─── Contextual onboarding ────────────────────────────────────────────
    ftux_swipe_to_delete: {
      id: "ftux_swipe_to_delete",
      title: "Потягни вліво, щоб видалити",
      body: "Свайп вправо — для дій архівування або редагування.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["module"],
    },
    // ─── Retention hooks ─────────────────────────────────────────────────
    retention_day_1: {
      id: "retention_day_1",
      title: "Перший день — вже здобуток!",
      body: "Поверніться завтра — звичка формується з трьох повторень.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["hub"],
    },
    retention_day_3: {
      id: "retention_day_3",
      title: "3 дні поспіль — стрік почався",
      body: "Ще кілька днів і мозок зафіксує нову звичку.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["hub"],
    },
    retention_day_7: {
      id: "retention_day_7",
      title: "Тиждень — серйозна заявка!",
      body: "7 днів поспіль доведено підвищують шанс закріпити звичку.",
      maxShowsTotal: 1,
      cooldownHours: 9999,
      dismissCooldownDays: 365,
      surfaces: ["hub"],
    },
  });

const HINTS_STORE_KEY = "hub_hints_v1";

export interface HintState {
  shownCount: number;
  lastShownAt?: number;
  dismissedAt?: number;
  completedAt?: number;
  snoozedUntil?: number;
}

type HintStateMap = Partial<Record<HintId, HintState>>;

function safeNow(now?: () => number): number {
  try {
    return (now?.() ?? Date.now()) || Date.now();
  } catch {
    return Date.now();
  }
}

export function readHintsState(store: KVStore): HintStateMap {
  const raw = readJSON(store, HINTS_STORE_KEY);
  if (!raw || typeof raw !== "object") return {};
  return raw as HintStateMap;
}

export function writeHintsState(store: KVStore, next: HintStateMap): void {
  writeJSON(store, HINTS_STORE_KEY, next);
}

export function getHintState(store: KVStore, id: HintId): HintState {
  const map = readHintsState(store);
  const s = map[id];
  if (!s || typeof s !== "object") return { shownCount: 0 };
  return {
    shownCount: Number.isFinite(s.shownCount) ? s.shownCount : 0,
    lastShownAt: s.lastShownAt,
    dismissedAt: s.dismissedAt,
    completedAt: s.completedAt,
    snoozedUntil: s.snoozedUntil,
  };
}

export function setHintState(
  store: KVStore,
  id: HintId,
  patch: HintState,
): void {
  const map = readHintsState(store);
  map[id] = patch;
  writeHintsState(store, map);
}

export function clearHintState(store: KVStore, id: HintId): void {
  const map = readHintsState(store);
  delete map[id];
  writeHintsState(store, map);
}

export function clearAllHintsState(store: KVStore): void {
  store.remove(HINTS_STORE_KEY);
}

export interface CanShowHintResult {
  ok: boolean;
  reason?:
    | "unknown_hint"
    | "wrong_surface"
    | "max_shows_reached"
    | "cooldown_active"
    | "dismiss_cooldown_active"
    | "completed"
    | "snoozed";
}

export function canShowHint(
  store: KVStore,
  id: HintId,
  ctx: HintContext,
  now?: () => number,
): CanShowHintResult {
  const def = HINT_DEFINITIONS[id];
  if (!def) return { ok: false, reason: "unknown_hint" };
  if (!def.surfaces.includes(ctx.surface))
    return { ok: false, reason: "wrong_surface" };

  const t = safeNow(now);
  const s = getHintState(store, id);
  if (s.completedAt) return { ok: false, reason: "completed" };
  if (s.snoozedUntil && s.snoozedUntil > t)
    return { ok: false, reason: "snoozed" };
  if (s.shownCount >= def.maxShowsTotal)
    return { ok: false, reason: "max_shows_reached" };

  if (s.lastShownAt) {
    const minMs = def.cooldownHours * 60 * 60 * 1000;
    if (t - s.lastShownAt < minMs)
      return { ok: false, reason: "cooldown_active" };
  }
  if (s.dismissedAt) {
    const minMs = def.dismissCooldownDays * 24 * 60 * 60 * 1000;
    if (t - s.dismissedAt < minMs)
      return { ok: false, reason: "dismiss_cooldown_active" };
  }
  return { ok: true };
}

export function recordHintShown(
  store: KVStore,
  id: HintId,
  now?: () => number,
): HintState {
  const t = safeNow(now);
  const prev = getHintState(store, id);
  const next: HintState = {
    ...prev,
    shownCount: Math.max(0, prev.shownCount || 0) + 1,
    lastShownAt: t,
  };
  setHintState(store, id, next);
  return next;
}

export function recordHintDismissed(
  store: KVStore,
  id: HintId,
  now?: () => number,
): HintState {
  const t = safeNow(now);
  const prev = getHintState(store, id);
  const next: HintState = { ...prev, dismissedAt: t };
  setHintState(store, id, next);
  return next;
}

export function recordHintCompleted(
  store: KVStore,
  id: HintId,
  now?: () => number,
): HintState {
  const t = safeNow(now);
  const prev = getHintState(store, id);
  const next: HintState = { ...prev, completedAt: t };
  setHintState(store, id, next);
  return next;
}

export function snoozeHint(
  store: KVStore,
  id: HintId,
  untilMs: number,
): HintState {
  const prev = getHintState(store, id);
  const next: HintState = {
    ...prev,
    snoozedUntil: Number.isFinite(untilMs) ? untilMs : prev.snoozedUntil,
  };
  setHintState(store, id, next);
  return next;
}

const MS_PER_DAY = 86_400_000;

/**
 * Returns the retention HintId to show based on how many days have passed
 * since `firstEntryAt` (unix timestamp ms). Returns `null` when none is due.
 *
 * Rules:
 *  - Day 1 (same calendar day as first entry)
 *  - Day 3 (3 calendar days after first entry)
 *  - Day 7 (7 calendar days after first entry)
 *
 * The caller is responsible for checking `canShowHint` before rendering.
 */
export function getRetentionHintId(
  firstEntryAt: number,
  now = Date.now(),
): RetentionHintId | null {
  const daysSince = Math.floor((now - firstEntryAt) / MS_PER_DAY);
  if (daysSince === 0) return "retention_day_1";
  if (daysSince === 3) return "retention_day_3";
  if (daysSince === 7) return "retention_day_7";
  return null;
}

/**
 * Utility: pick the first eligible hint from a prioritized list.
 * Callers decide the candidate order based on their UX.
 */
export function pickNextHint(
  store: KVStore,
  candidates: readonly HintId[],
  ctx: HintContext,
  now?: () => number,
): HintId | null {
  for (const id of candidates) {
    const res = canShowHint(store, id, ctx, now);
    if (res.ok) return id;
  }
  return null;
}
