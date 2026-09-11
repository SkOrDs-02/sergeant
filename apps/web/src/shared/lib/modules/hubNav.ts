/**
 * Крос-модульна навігація всередині Hub.
 *
 * Замість прокидування `onOpenModule` через дерево кожного модуля — крихітний
 * подієвий шинний канал. Слухач встановлюється в `core/App.jsx` і викликає
 * існуючий `openModule(id, { hash })`. Будь-який глибокий компонент може
 * викликати `openHubModule("finyk", "/analytics")` без додаткових пропсів.
 *
 * Це НЕ замінює існуючі `onOpenModule` пропси (напр. у `RoutineCalendarPanel`) —
 * вони лишаються як є. Це доповнювальний, опційний канал.
 */

import type { ModuleAccent } from "@sergeant/design-tokens";
import { CHECKLIST_ACTIONS, type ChecklistAction } from "@sergeant/shared";
import { VISIBLE_SETTINGS_SECTIONS } from "../../../core/hub/settingsSectionsCatalog";
import { logger } from "../log/logger";

export const HUB_OPEN_MODULE_EVENT = "hub:open-module";

// Канонічне оголошення `HubModuleId` — `moduleLabels.ts` та
// `core/hooks/useHubNavigation.ts` реекспортують його звідси, щоб уникнути
// дубльованих декларацій (aislop `ai-slop/duplicate-type-declaration`).
export type HubModuleId = ModuleAccent;

// PWA app-shortcut / preset-sheet intents that are NOT checklist steps —
// they open a module's Add sheet directly with no matching "Перші кроки"
// row. Kept separate from `CHECKLIST_ACTIONS` (packages/shared) so that
// canonical list stays scoped to "what a checklist step may ask for".
const HUB_ONLY_ACTIONS = [
  "add_meal",
  "add_meal_photo",
  "add_habit",
] as const satisfies readonly string[];

// F3 audit (2026-09-11): `HubModuleAction` used to be a FOURTH
// hand-maintained list (independent of `MODULE_CHECKLISTS`'s own step
// actions) — it carried only the 5 PWA-shortcut ids and silently
// rejected 3 of Фінік's 4 checklist actions (`set_budget`,
// `connect_bank`, `view_analytics`). It now derives from
// `CHECKLIST_ACTIONS` (the shared package's single source of truth for
// "actions a checklist step may declare") plus the Hub-only shortcut
// ids, so a checklist step can never reference an action this gate
// doesn't already recognize — same fix pattern as `VALID_SETTINGS_
// SECTIONS` below (audit finding #5, 2026-08-08).
export type HubModuleAction =
  ChecklistAction | (typeof HUB_ONLY_ACTIONS)[number];

export interface HubOpenModuleDetail {
  module: HubModuleId;
  hash: string;
  action?: HubModuleAction;
}

export const HUB_MODULE_IDS = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
] as const satisfies readonly HubModuleId[];

const VALID_HUB_MODULES: ReadonlySet<string> = new Set(HUB_MODULE_IDS);

export function isHubModuleId(value: unknown): value is HubModuleId {
  return typeof value === "string" && VALID_HUB_MODULES.has(value);
}

/**
 * Перемкнути активний модуль Hub (з опційним hash для вкладки всередині).
 */
export function openHubModule(moduleId: HubModuleId, hash?: string): void {
  if (!VALID_HUB_MODULES.has(moduleId)) return;
  try {
    window.dispatchEvent(
      new CustomEvent<HubOpenModuleDetail>(HUB_OPEN_MODULE_EVENT, {
        detail: { module: moduleId, hash: hash || "" },
      }),
    );
  } catch {
    /* noop — SSR / disabled CustomEvent */
  }
}

const VALID_HUB_ACTIONS: ReadonlySet<HubModuleAction> = new Set([
  ...CHECKLIST_ACTIONS,
  ...HUB_ONLY_ACTIONS,
]);

/**
 * Відкрити модуль із запитом на дію (така ж семантика як у PWA shortcuts).
 * Використовується, напр., для кнопки "Додати витрату" на hub-дашборді.
 */
export function openHubModuleWithAction(
  moduleId: HubModuleId,
  action: HubModuleAction,
): void {
  if (!VALID_HUB_MODULES.has(moduleId)) return;
  if (!VALID_HUB_ACTIONS.has(action)) {
    // F3 audit (2026-09-11) — root cause of "3 з 4 пунктів чекліста не
    // працюють": this used to be a silent `return`. Every checklist
    // step's `action` is now typed against `CHECKLIST_ACTIONS`
    // (`packages/shared/src/lib/moduleChecklist.ts`), so a checklist row
    // literally cannot reach this branch — getting here means a caller
    // bypassed the type system (an unsafe cast, `any`, or a value read
    // from outside TS, e.g. a deep-link query param). Loud in dev so the
    // bypass gets caught before merge; `logger.error` (not thrown) in
    // production so a bad deploy degrades to "nothing happens" instead of
    // crashing the click handler that called this — and still surfaces in
    // Sentry, unlike a bare `console.error` (`no-console` also forbids
    // that call-site anyway).
    const message = `openHubModuleWithAction: unknown action "${String(action)}" for module "${moduleId}" (dropped)`;
    if (import.meta.env.DEV) {
      throw new Error(message);
    }
    logger.error(message);
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent<HubOpenModuleDetail>(HUB_OPEN_MODULE_EVENT, {
        detail: { module: moduleId, hash: "", action },
      }),
    );
  } catch {
    /* noop */
  }
}

export const HUB_OPEN_SETTINGS_EVENT = "hub:open-settings";

export interface HubOpenSettingsDetail {
  /**
   * Settings section id to scroll to (matches the `#settings-<id>` anchor
   * emitted by `HubSettingsPage`). Empty string opens the Settings tab
   * without scrolling to any specific section.
   */
  section: string;
}

// Audit finding #5 (2026-08-08): this used to be a FOURTH hand-maintained
// id list, independent of `SETTINGS_SECTIONS_CATALOG` — the shared source
// of truth `HubSettingsPage.tsx` and `search/searchSettings.ts` already
// derive from (L-13 fix, same audit). It had drifted the exact same way:
// carrying ghost ids ("general", "assistant") no real section uses, and
// missing three real ones ("plan", "capabilities", "feedback"), so
// `openHubSettingsSection("plan")` silently no-op'd below without even
// dispatching the event. Deriving from the catalog means it can't drift
// again; parity is pinned in `hubNav.test.ts`.
const VALID_SETTINGS_SECTIONS = new Set<string>([
  "",
  ...VISIBLE_SETTINGS_SECTIONS.map((section) => section.id),
]);

/**
 * Перемкнути Hub на вкладку «Налаштування» з опційним скролом до секції.
 *
 * Використовується, напр., у Bento-картці неактивного модуля: тап по
 * сірій картці має вести користувача в Hub Settings → Дашборд →
 * "Модулі дашборду", а не відкривати сам неактивний модуль.
 */
export function openHubSettingsSection(section: string = ""): void {
  if (!VALID_SETTINGS_SECTIONS.has(section)) return;
  try {
    window.dispatchEvent(
      new CustomEvent<HubOpenSettingsDetail>(HUB_OPEN_SETTINGS_EVENT, {
        detail: { section },
      }),
    );
  } catch {
    /* noop — SSR / disabled CustomEvent */
  }
}

/**
 * Notify `hashchange` listeners (e.g. `SettingsGroup`'s anchor auto-open in
 * `core/settings/SettingsPrimitives.tsx`) that `window.location.hash`
 * changed — WITHOUT the browser's native "scroll to fragment" navigation a
 * direct `location.hash = "…"` assignment triggers.
 *
 * Audit finding #3 (2026-08-08): that assignment did two things wrong at
 * once — (a) it walked every scrollable ancestor including the app-shell
 * viewport (the exact iOS status-bar/bottom-nav layout bug the
 * `Element.scrollIntoView()` avoidance elsewhere in `HubSettingsPage.tsx`
 * already fixed once), and (b) `location.hash = …` always PUSHES a new
 * history entry — a subsequent `navigate(…, { replace: true })` only
 * replaces *that* entry, leaving the page it should have replaced (e.g. a
 * `?billing=portal-return` return URL) reachable one Back-tap away.
 *
 * Call this AFTER the hash has already been moved some other way — e.g.
 * react-router's `navigate({ hash })`, which drives the URL through
 * `history.pushState`/`replaceState` (synchronous, no native scroll, no
 * duplicate entry) but never fires a native `hashchange` event on its own,
 * so anything that only listens for that event (like `SettingsGroup`)
 * needs an explicit nudge.
 */
export function announceSettingsHashChange(): void {
  try {
    window.dispatchEvent(new Event("hashchange"));
  } catch {
    /* noop — SSR / disabled Event */
  }
}
