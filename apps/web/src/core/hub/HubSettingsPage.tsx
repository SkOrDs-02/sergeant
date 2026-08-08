import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Tabs } from "@shared/components/ui/Tabs";
import { motionScrollBehavior } from "@shared/lib/ui/motion";
import { useToast } from "@shared/hooks/useToast";
import { billingKeys } from "@shared/lib/api/queryKeys";
import { announceSettingsHashChange } from "@shared/lib/modules/hubNav";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import ChunkErrorBoundary from "./ChunkErrorBoundary";
import {
  SectionSkeleton,
  SettingsGroupDefaultOpenContext,
} from "../settings/SettingsPrimitives";
import { AIDigestSection } from "../settings/AIDigestSection";
import { CapabilitiesSection } from "../settings/CapabilitiesSection";
import { DashboardSection } from "../settings/DashboardSection";
import { DataExportSection } from "../settings/DataExportSection";
import { ExperimentalSection } from "../settings/ExperimentalSection";
import { FeedbackSection } from "../feedback/FeedbackSection";
import { NotificationsSection } from "../settings/NotificationsSection";
import { PlanSection } from "../settings/PlanSection";
import { PrivacySection } from "../settings/PrivacySection";
import { PWASection } from "../settings/PWASection";
import { SETTINGS_SECTIONS_CATALOG } from "./settingsSectionsCatalog";

// Initiative 0017 Sprint 1.1 PR-1.2 — the four module-scoped sections
// (`Finyk`/`Fizruk`/`Nutrition`/`Routine`) bootstrap heavy cross-module
// hooks (`useFinykStorage`, `useMonoBackfillProgress`, `usePlan` …) on
// mount. Lazy-loading them lets the cold open of the Settings tab paint
// the header chrome immediately and stream in the per-module section
// chunks as they resolve, instead of blocking on a single synchronous
// render burst. The other 10 sections are light and stay eager — moving
// them is the next PR after we have RUM numbers proving the win.
//
// `.then((m) => ({ default: m.X }))` is the named-export-to-default
// wrapper — the section files still export named functions so the rest
// of the codebase (and tests) can keep importing them directly.
const FinykSection = lazy(() =>
  import("../settings/FinykSection").then((m) => ({
    default: m.FinykSection,
  })),
);
const FizrukSection = lazy(() =>
  import("../settings/FizrukSection").then((m) => ({
    default: m.FizrukSection,
  })),
);
const NutritionSection = lazy(() =>
  import("../settings/NutritionSection").then((m) => ({
    default: m.NutritionSection,
  })),
);
const RoutineSection = lazy(() =>
  import("../settings/RoutineSection").then((m) => ({
    default: m.RoutineSection,
  })),
);

interface SettingsSection {
  id: string;
  title: string;
  keywords: string;
  render: () => React.JSX.Element;
  /**
   * When true, the section is React.lazy() and renders inside a
   * `<Suspense>` boundary with a `<SectionSkeleton>` fallback. Used by
   * the heavy module-scoped sections (Initiative 0017 Sprint 1.1 PR-1.2).
   * `minH` is the section's expected footprint AS IT FIRST PAINTS: the
   * closed-header height for a section that mounts collapsed, or the
   * full expanded-content height for a section that Варіант A
   * force-opens by default because it's the first section of the active
   * tab (see `SettingsGroupDefaultOpenContext` in
   * `SettingsPrimitives.tsx`). No longer "headers + collapsed SubGroups"
   * (adversarial review 2026-08-08, дефект №4) — Варіант A removed
   * `SettingsSubGroup`'s own collapse state, so there's no middle-height
   * state between "closed" and "fully open" anymore.
   */
  lazy?: { minH: number };
}

// Per-id render wiring. id/title/keywords live in `SETTINGS_SECTIONS_CATALOG`
// (shared with the ⌘K palette — L-13 audit finding, 2026-08-08); the
// `render: () => <Section/>` closures stay local on purpose — importing
// component modules from the shared catalog would drag their render-time
// graph into the ⌘K search chunk (see the comment in `settingsSectionsCatalog.ts`).
const SECTION_RENDERERS: Readonly<Record<string, () => React.JSX.Element>> = {
  dashboard: () => <DashboardSection />,
  plan: () => <PlanSection />,
  notifications: () => <NotificationsSection />,
  ai: () => <AIDigestSection />,
  capabilities: () => <CapabilitiesSection />,
  feedback: () => <FeedbackSection />,
  routine: () => <RoutineSection />,
  fizruk: () => <FizrukSection />,
  finyk: () => <FinykSection />,
  nutrition: () => <NutritionSection />,
  privacy: () => <PrivacySection />,
  pwa: () => <PWASection />,
  dataExport: () => <DataExportSection />,
  experimental: () => <ExperimentalSection />,
};

// Suspense-fallback heights for the four module-scoped sections that are
// React.lazy() (Initiative 0017 Sprint 1.1 PR-1.2) — see
// `SettingsSection.lazy` above for what each number represents.
//
// `routine` is the only one of the four that can be forced open by default
// (it's index 0 of the «Розділи» tab under Варіант A): its skeleton has to
// match the FULLY EXPANDED section (two `SettingsSubGroup`s — calendar
// toggles, then tag/category editors), not a closed header, otherwise the
// lazy-chunk swap causes a large downward layout shift that pushes the
// rest of the tab's list (дефект №4, адверсарне ревʼю 2026-08-08). 600 is a
// conservative expanded-height estimate, not a pixel-perfect measurement —
// see RoutineSection.tsx for the actual content. `fizruk` / `finyk` /
// `nutrition` are never index 0 in their own tab, so they stay mounted
// collapsed and their existing (pre-Варіант-A) heights are untouched.
const SECTION_LAZY: Readonly<Record<string, { minH: number }>> = {
  routine: { minH: 600 },
  fizruk: { minH: 168 },
  finyk: { minH: 248 },
  nutrition: { minH: 280 },
};

// Zips the shared catalog with the local render wiring above. Module scope
// (not `useMemo`) — the renderer closures don't capture any component-
// instance state, so this only needs to compute once per module load.
const SECTIONS: readonly SettingsSection[] = SETTINGS_SECTIONS_CATALOG.map(
  (meta) => {
    const render = SECTION_RENDERERS[meta.id];
    if (!render) {
      // Кожен запис каталогу мусить мати рендерер — інакше секція існує в
      // пошуку/групах GROUPS, але на сторінці порожня. Audit finding #11
      // (2026-08-08) корегує попередній коментар тут: `Readonly<Record<
      // string, …>>` НЕ дає typecheck-помилки при відсутньому ключі (немає
      // exhaustiveness check по конкретних id) — це виключно runtime guard.
      // Throw виконується під час обчислення МОДУЛЯ (module scope, не
      // всередині рендер-функції), тож спрацьовує однаково в test/dev/prod
      // — у проді це валить проміс динамічного `lazy()`-імпорту цього
      // чанку, і помилка спливає до ЗОВНІШНЬОГО `ErrorBoundary` у
      // `HubMainContent.tsx`, а не до `ChunkErrorBoundary` нижче (той
      // огортає лише РЕНДЕР окремих lazy-секцій, не власне завантаження
      // цього модуля) — тобто одна відсутня секція валить всю сторінку
      // Налаштувань, а не рендериться порожньою поруч з іншими.
      throw new Error(
        `HubSettingsPage: no renderer registered for section "${meta.id}"`,
      );
    }
    // `exactOptionalPropertyTypes: true` (Hard Rule #19) treats `lazy:
    // undefined` as distinct from "no `lazy` key" — spread it in only
    // when a Suspense fallback height is actually registered, instead of
    // always assigning the (possibly-`undefined`) lookup result.
    const lazy = SECTION_LAZY[meta.id];
    return lazy ? { ...meta, render, lazy } : { ...meta, render };
  },
);

// Group definitions: each tab collects related sections. Search terms are
// used for fuzzy search-by-keyword; matches fall back to showing every
// section that contains the term.
//
// Exported (audit finding #7, 2026-08-08) so `HubSettingsPage.test.tsx`
// can pin real parity between this list and `SETTINGS_SECTIONS_CATALOG` —
// this is the FOURTH manual id list the L-13 audit found (alongside the
// two that got merged into the catalog and `hubNav.ts`'s
// `VALID_SETTINGS_SECTIONS`), and unlike `SECTION_RENDERERS` above (which
// throws loudly at module-load on a missing entry) a catalog id with no
// `GROUPS` membership fails SILENTLY — the section renders fine, but only
// ever reachable via search, never via the tab strip.
export const GROUPS = [
  {
    id: "general",
    label: "Загальні",
    sections: [
      "dashboard",
      "plan",
      "notifications",
      "ai",
      "capabilities",
      "feedback",
    ],
  },
  {
    id: "modules",
    label: "Розділи",
    sections: ["routine", "fizruk", "finyk", "nutrition"],
  },
  {
    id: "advanced",
    label: "Додатково",
    sections: ["privacy", "pwa", "dataExport", "experimental"],
  },
] as const;

function readSettingsSectionHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith("settings-")) return null;
  return raw.replace(/^settings-/, "");
}

/**
 * Дефект №2 (адверсарне ревʼю 2026-08-08): billing-return (`?billing=
 * portal-return|manage`) таргетить «Підписка та план» так само, як
 * `#settings-plan` — обидва мусять суплресити форсоване відкриття першої
 * секції вкладки. Для хеша це відомо СИНХРОННО (з `location.hash` на
 * mount), але billing-таргет раніше ставав відомим лише ПІЗНІШЕ, через
 * `queueMicrotask` в ефекті нижче — а на той момент «Дашборд» (перша
 * секція «Загальних») уже змонтувався й зафіксував свій `open` через
 * `useState`-ініціалізатор у `SettingsGroup`; пізніший `setHashSectionId`
 * більше не міг це скасувати. Читаючи billing-параметр тут, у тому ж
 * ініціалізаторі `hashSectionId` нижче, суплресія спрацьовує з ПЕРШОГО
 * рендеру — до того, як «Дашборд» встигає змонтуватись.
 */
function readBillingReturnSectionId(search: string): string | null {
  try {
    const billing = new URLSearchParams(search).get("billing");
    return billing === "portal-return" || billing === "manage" ? "plan" : null;
  } catch {
    return null;
  }
}

function groupForSection(sectionId: string | null) {
  if (!sectionId) return undefined;
  return GROUPS.find((group) =>
    (group.sections as readonly string[]).includes(sectionId),
  );
}

/**
 * Read the active inner-tab from `?group=…`. Returns the group id only if
 * it matches a known `GROUPS[].id`; anything else (missing / malformed /
 * unknown) returns `null` so the caller falls back to the default
 * resolution chain (hash → "general"). Kept in module scope so the SSR
 * guard and validation stay co-located with `GROUPS`.
 */
function readSettingsGroupParam(search: string): string | null {
  try {
    const raw = new URLSearchParams(search).get("group");
    if (!raw) return null;
    if (GROUPS.some((group) => group.id === raw)) return raw;
  } catch {
    /* SSR / non-browser */
  }
  return null;
}

export interface HubSettingsPageProps {
  /** The app-owned scroll host. Hash navigation must never scroll document. */
  scrollContainer?: HTMLElement | null;
}

export function HubSettingsPage({ scrollContainer }: HubSettingsPageProps) {
  // Mirror the active inner-tab to `?group=…` so a reload / share keeps the
  // user on the same group. Strip the param for the default group (`general`)
  // to keep the canonical URL clean. `replace: true` matches the prior
  // `replaceState` semantics — clicking a tab strip shouldn't grow history.
  // MUST go through react-router `navigate` (not `window.history.replaceState`)
  // so the data-router's internal location stays in sync with the URL —
  // otherwise `useLocation()` consumers across the app start reading stale
  // pathname/search and in-app navigation silently no-ops.
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const location = useBrowserLocation(routerLocation);
  const queryClient = useQueryClient();
  const toast = useToast();
  // Audit finding #13 (2026-08-08): this used to be a hardcoded module
  // constant (`SETTINGS_GROUP_PANEL_ID`) shared by every mounted instance
  // of this component — two on screen at once would collide on `id`,
  // making `aria-controls` point at an ambiguous target. `useId()` scopes
  // the id to this component instance's position in the render tree.
  const groupPanelId = useId();
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);
  const writeSettingsGroupParam = useCallback(
    (groupId: string) => {
      const current = locationRef.current;
      const params = new URLSearchParams(current.search);
      params.set("tab", "settings");
      if (groupId === "general") {
        params.delete("group");
      } else {
        params.set("group", groupId);
      }
      const qs = params.toString();
      const nextSearch = qs ? `?${qs}` : "";
      if (nextSearch === current.search) return;
      navigate(
        {
          pathname: current.pathname,
          search: nextSearch,
          hash: current.hash,
        },
        { replace: true },
      );
    },
    [navigate],
  );

  // Resolution order on mount: explicit `?group=…` wins (shareable
  // deep-links) → hash-section's parent group (existing legacy path
  // from Bento «Налаштування» deep-links) → "general" default.
  const [tab, setTabRaw] = useState<string>(() => {
    const fromQuery = readSettingsGroupParam(location.search);
    if (fromQuery) return fromQuery;
    const sectionId = readSettingsSectionHash(location.hash);
    return groupForSection(sectionId)?.id ?? "general";
  });
  const setTab = useCallback(
    (next: string) => {
      setTabRaw(next);
      writeSettingsGroupParam(next);
    },
    [writeSettingsGroupParam],
  );
  const [query, setQuery] = useState("");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const [hashSectionId, setHashSectionId] = useState<string | null>(
    () =>
      readSettingsSectionHash(location.hash) ??
      readBillingReturnSectionId(location.search),
  );
  // Дефект №3 (адверсарне ревʼю 2026-08-08): явний вибір юзера (клік по
  // заголовку) має пережити ремаунт секції — перемикання вкладки чи
  // search ховає й показує секцію заново (`visible` фільтрує по
  // активній вкладці/запиту), і без цього форсоване "перша секція
  // вкладки відкрита" (Варіант A) щоразу перевідкривало секцію, яку юзер
  // щойно сам згорнув. Ключ — id секції (стабільний між ремаунтами),
  // значення — останній явний стан з `onUserToggle` (SettingsPrimitives.tsx).
  const [sectionOpenOverrides, setSectionOpenOverrides] = useState<
    Record<string, boolean>
  >({});

  // Sections with the keywords a user might type to find them — id/title/
  // keywords come from the module-level `SECTIONS` (zipped from the shared
  // catalog above), stable across renders.
  const sections = SECTIONS;

  const q = query.trim().toLowerCase();
  const matchesQuery = (s: SettingsSection): boolean =>
    !q ||
    s.title.toLowerCase().includes(q) ||
    s.keywords.toLowerCase().includes(q);

  const visibleSectionIds: string[] = q
    ? sections.filter(matchesQuery).map((s) => s.id)
    : [...(GROUPS.find((g) => g.id === tab)?.sections ?? [])];

  const visible = sections.filter((s) => visibleSectionIds.includes(s.id));
  const visibleSectionKey = visibleSectionIds.join("|");
  const activeGroupLabel = GROUPS.find((g) => g.id === tab)?.label;

  useEffect(() => {
    const syncHash = () => {
      const sectionId = readSettingsSectionHash(window.location.hash);
      if (!sectionId) return;
      const group = groupForSection(sectionId);
      if (!group) return;
      setQuery("");
      setTab(group.id);
      setHashSectionId(sectionId);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [setTab]);

  // L-2 / L-12 (audit 2026-08-08): billing providers return the user to
  // `/settings?billing=portal-return` (Stripe Customer Portal close) or
  // `/settings?billing=manage` (LiqPay/Plata — no external portal exists,
  // this URL *is* the "manage" destination — see `handleManage()` in
  // `PlanSection.tsx`). Before this reader, a plan change made in the
  // portal never reached the UI: cold load, «Загальні» tab, every
  // accordion collapsed by default, zero confirmation anything happened.
  const billingReturnHandledRef = useRef(false);
  useEffect(() => {
    if (billingReturnHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const billing = params.get("billing");
    if (billing !== "portal-return" && billing !== "manage") return;
    billingReturnHandledRef.current = true;

    const targetSectionId = "plan";
    const group = groupForSection(targetSectionId);

    // Усе, що торкається стану, — у мікротаску. Синхронний `setState`
    // усередині ефекту ловить `react-hooks/set-state-in-effect`, і правило
    // має рацію: три сети одразу після коміту дають зайвий каскадний
    // рендер на кадрі, коли сторінка щойно змонтувалась після повернення
    // з платіжного порталу. Ref-гард вище лишається СИНХРОННИМ — інакше
    // повторний рендер устиг би зайти в цей самий блок удруге, і тост із
    // рефетчем задвоївся б.
    queueMicrotask(() => {
      setQuery("");
      if (group) setTab(group.id);
      setHashSectionId(targetSectionId);
    });

    // Рефетч — виключно через фабрику `billingKeys` (Hard Rule #2).
    // Портал (Stripe) чи власне скасування (LiqPay/Plata, `PlanSection`
    // `handleCancel()`) могли змінити план, поки юзер був поза застосунком;
    // `usePlan()`'s 60s staleTime інакше показував би застарілий план ще
    // до хвилини після повернення.
    void queryClient.invalidateQueries({ queryKey: billingKeys.status });
    // Audit finding #4 (2026-08-08): "Статус підписки оновлено" claims a
    // CHANGE happened. For `?billing=manage` (LiqPay/Plata — no external
    // portal exists; this return URL *is* the destination `PlanSection`'s
    // `handleManage()` redirects to) nothing external ran at all — the
    // user landed right back where they started. Even for `portal-return`
    // (Stripe), simply closing the Customer Portal without changing
    // anything hits this same copy. What's actually true in BOTH cases —
    // and the only thing this effect can honestly claim — is that the
    // displayed plan was just re-synced with the server.
    toast.success("Статус підписки перевірено.");

    // Прибираємо `?billing=…`, щоб reload/поширення посилання не повторював
    // тост і рефетч. Через react-router `navigate()` (не сирий
    // `history.replaceState`) — інакше внутрішня локація data-router
    // розходиться з URL (див. коментар над `writeSettingsGroupParam`).
    const cleanParams = new URLSearchParams(location.search);
    cleanParams.delete("billing");
    const qs = cleanParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: qs ? `?${qs}` : "",
        hash: `#settings-${targetSectionId}`,
      },
      { replace: true },
    );
    // Audit finding #3 (2026-08-08): this used to ALSO assign
    // `window.location.hash = …` directly, before the `navigate()` call
    // above, purely so `SettingsGroup` (`SettingsPrimitives.tsx`,
    // read-only here) — which reacts ONLY to a native `hashchange` event —
    // would auto-expand its `anchorId="settings-plan"` accordion. That
    // direct assignment triggered the browser's own "scroll to fragment"
    // navigation (the exact iOS status-bar/app-shell scroll bug the
    // `scrollIntoView()` avoidance further down this file already fixed
    // once) AND pushed a new history entry that the subsequent
    // `navigate(…, { replace: true })` only replaced — leaving the
    // `?billing=portal-return` URL one Back-tap away with the toast/refetch
    // ready to repeat (`billingReturnHandledRef` guards the effect, but the
    // param resurrects in the address bar on reload). `navigate()` above
    // already moves the hash via `history.replaceState` (no native scroll,
    // no extra entry) — just re-announce the change for `SettingsGroup`.
    announceSettingsHashChange();
  }, [
    location.pathname,
    location.search,
    navigate,
    queryClient,
    setTab,
    toast,
  ]);

  useEffect(() => {
    if (!hashSectionId) return;
    const el = refs.current[hashSectionId];
    if (!el || !scrollContainer) return;

    // `Element.scrollIntoView()` walks every scrollable ancestor, including
    // the document viewport. On iOS that moved the entire fixed-height app
    // shell under the status bar and made the bottom nav look twice as tall.
    // Compute the target relative to the one app-owned scroller instead.
    const hostRect = scrollContainer.getBoundingClientRect();
    const targetRect = el.getBoundingClientRect();
    const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 128;
    const top = Math.max(
      0,
      scrollContainer.scrollTop +
        targetRect.top -
        hostRect.top -
        stickyHeight -
        16,
    );
    scrollContainer.scrollTo({ top, behavior: motionScrollBehavior() });
  }, [hashSectionId, scrollContainer, visibleSectionKey]);

  return (
    <div className="flex flex-col gap-4 pt-3 pb-6">
      <h1 className="sr-only">Налаштування</h1>
      {/* Search and tabs header. Container uses the soft glass tint so the
          inputs sitting on top can use a stronger surface and visually
          "lift" off the header. Previously the input + tabs used
          `bg-surface-soft-glass` (50% white) on top of `bg-surface-glass`
          (82% white) — the input read as lighter than its own container
          and the whole block felt empty in light theme (user report
          2026-05-26 / `ui-layout-styling-fixes`). */}
      <div
        ref={stickyHeaderRef}
        className="flex flex-col gap-3 sticky top-0 z-10 bg-surface-soft-glass backdrop-blur-md border-b border-surface-line -mx-4 px-4 py-2 -mt-3"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
      >
        {/* Audit finding #12 (2026-08-08): the clear <Button> used to live
            INSIDE this <label>. Per the accname algorithm, a wrapped
            <label>'s computed name folds in the text/accessible-name of
            every descendant, including embedded controls — so the input's
            own accessible name became "Пошук по налаштуваннях Очистити
            пошук" whenever `query` was non-empty, not just the intended
            "Пошук по налаштуваннях". Moving the button OUT to a sibling of
            the <label> (both inside this shared `relative` wrapper, so the
            absolute positioning still lines up) keeps the label's name
            clean. The two "clear" buttons on screen at zero results also
            now carry DISTINCT accessible names — see below. */}
        <div className="relative block">
          <label className="block">
            <span className="sr-only">Пошук по налаштуваннях</span>
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none">
              <Icon name="search" size={18} />
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук налаштувань…"
              // V-16 (audit 2026-08-08): `[&::-webkit-search-cancel-button]:
              // appearance-none` suppresses Chromium's own hard-coded "×"
              // for `type="search"` inputs. Before this, a zero-result query
              // showed the NATIVE cancel icon (our own clear <Button> below
              // was hidden by the `visible.length > 0` guard) — two visually
              // different "clear" affordances depending on result count, and
              // Firefox has no native icon at all, so the field looked
              // clear-less there. Kept `type="search"` (not `type="text"` +
              // `role="searchbox"`) — the semantic type still drives the
              // mobile-keyboard "Search" action key, and suppressing just
              // the one pseudo-element is a smaller diff than overriding
              // the input's implicit role.
              className="input-focus w-full min-h-[48px] pl-11 pr-11 py-3 bg-panel border border-line rounded-2xl text-style-body text-ink placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
            />
          </label>
          {query && (
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={() => setQuery("")}
              // Distinct from the empty-state CTA's "Очистити пошук" below
              // (audit finding #12) — before this fix both buttons shared
              // the exact same accessible name, indistinguishable to a
              // screen reader whenever both were on screen at once (zero
              // search results).
              aria-label="Очистити поле пошуку"
              className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-panelHi"
            >
              <Icon name="close" size={16} />
            </Button>
          )}
        </div>

        {!q && (
          <Tabs
            style="pill"
            variant="brand"
            fill
            ariaLabel="Групи налаштувань"
            items={GROUPS.map((g) => ({ value: g.id, label: g.label }))}
            value={tab}
            onChange={(v) => setTab(v)}
            getPanelId={() => groupPanelId}
            className="overflow-x-auto border border-line bg-panel rounded-2xl"
          />
        )}
      </div>

      {/* Settings sections. `role="tabpanel"` only while the group Tabs
          above are showing (`!q`) — in search mode the Tabs (tablist)
          itself is unmounted, so there is no tab to be "the panel of".
          V-1 (audit 2026-08-08): this landed with `role="tablist"` +
          working roving tabindex but no matching tabpanel at all —
          `aria-controls` on every tab was `null`. `aria-label` (not
          `aria-labelledby`) is deliberate: `Tabs` (Tabs.tsx, out of scope
          here) generates each tab's DOM id via internal `useId()`, so
          there is no stable id this file can point `aria-labelledby` at
          without editing that component; `getPanelId` above already gives
          AT users the tab→panel link via `aria-controls`, and `aria-label`
          gives the reverse (panel→name) link without needing that id. */}
      <div
        className="flex flex-col gap-4"
        role={!q ? "tabpanel" : undefined}
        id={!q ? groupPanelId : undefined}
        aria-label={
          !q && activeGroupLabel
            ? `Налаштування · ${activeGroupLabel}`
            : undefined
        }
      >
        {visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-soft-glass border border-surface-line flex items-center justify-center">
              <Icon name="search" size={24} className="text-muted" />
            </div>
            <p className="text-style-body text-muted text-center">
              Нічого не знайдено за запитом «{query}»
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery("")}
              className="text-brand"
            >
              Очистити пошук
            </Button>
          </div>
        ) : (
          visible.map((s, index) => {
            // Дефект №2 (адверсарне ревʼю 2026-08-08): forced-first-of-tab
            // не повинен спрацьовувати, коли хеш (чи billing-return, див.
            // `readBillingReturnSectionId` вище) уже націлений на ІНШУ
            // секцію ТІЄЇ Ж вкладки — інакше розгортаються ОБИДВІ: ціль
            // хеша і перша секція вкладки, і сторінка приземляє юзера між
            // двома розгорнутими картками замість однієї цільової.
            // `hashSectionId` перевіряється саме проти `visibleSectionIds`
            // (не голим `!!hashSectionId`): якщо юзер уже ПОКИНУВ
            // хеш-вкладку і перемкнувся на іншу вручну, залишок
            // `hashSectionId` із попередньої навігації не мусить назавжди
            // глушити forced-first у ВСІХ інших вкладках.
            const hashTargetsThisTab =
              hashSectionId != null &&
              visibleSectionIds.includes(hashSectionId);
            const isFirstOfTab =
              !q &&
              index === 0 &&
              (!hashTargetsThisTab || hashSectionId === s.id);
            // Дефект №3: явний вибір юзера (запамʼятаний per-section-id у
            // `sectionOpenOverrides`) переважає дефолт "перша секція
            // відкрита" — якщо юзер сам згорнув форсовано-відкриту секцію,
            // ремаунт (перемикання вкладки чи search, що ховає й показує
            // секцію заново) більше не повертає її в розгорнутий стан.
            // Пошук УЖЕ зберігав це випадково (та сама React-інстанція не
            // розмонтовується, доки секція лишається серед результатів) —
            // тепер це справжня, а не випадкова консистентність.
            const userOverride = sectionOpenOverrides[s.id];
            const defaultOpenForSection = userOverride ?? isFirstOfTab;

            return (
              <SettingsGroupDefaultOpenContext.Provider
                key={s.id}
                value={{
                  defaultOpen: defaultOpenForSection,
                  onUserToggle: (open) => {
                    setSectionOpenOverrides((prev) => ({
                      ...prev,
                      [s.id]: open,
                    }));
                  },
                }}
              >
                <div
                  id={`settings-${s.id}`}
                  data-search-keywords={`${s.title} ${s.keywords}`}
                  ref={(el) => {
                    refs.current[s.id] = el;
                  }}
                  // The Search + Tabs row above is `sticky top-0` (≈120-140px on
                  // mobile/desktop). With `scroll-mt-4` (16px) the section title
                  // landed *behind* that sticky chrome after `scrollIntoView`,
                  // so deep-links like `#settings-dashboard` from the inactive
                  // Bento card felt like they "just opened the Settings tab"
                  // (issue 2026-05-08). 8rem clears the sticky header on every
                  // viewport while still leaving a small visual gap above the
                  // landed section.
                  className="scroll-mt-32"
                >
                  {s.lazy ? (
                    <ChunkErrorBoundary minH={s.lazy.minH}>
                      <Suspense
                        fallback={
                          <SectionSkeleton
                            minH={s.lazy.minH}
                            ariaLabel={`Завантажую ${s.title}`}
                          />
                        }
                      >
                        {s.render()}
                      </Suspense>
                    </ChunkErrorBoundary>
                  ) : (
                    s.render()
                  )}
                </div>
              </SettingsGroupDefaultOpenContext.Provider>
            );
          })
        )}
      </div>
    </div>
  );
}
