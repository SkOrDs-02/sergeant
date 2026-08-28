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
import { searchFieldProps } from "@shared/lib/ui/searchFieldProps";
import { useToast } from "@shared/hooks/useToast";
import { silpoConnectUrl } from "@shared/api";
import { apiUrl, getApiPrefix } from "@shared/lib/api/apiUrl";
import { billingKeys, silpoKeys } from "@shared/lib/api/queryKeys";
import { announceSettingsHashChange } from "@shared/lib/modules/hubNav";
import { useBrowserLocation } from "../hooks/useBrowserLocation";
import ChunkErrorBoundary from "./ChunkErrorBoundary";
import {
  groupForSection,
  readBillingReturnSectionId,
  readSettingsGroupParam,
} from "./hubSettingsUrlParams";
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
import { VISIBLE_SETTINGS_SECTIONS } from "./settingsSectionsCatalog";

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
   *
   * `minH` — висота секції в РОЗГОРНУТОМУ стані. Це не те саме, що
   * резервує skeleton: рішення «розгорнута чи згорнута» ухвалює
   * `lazySectionMinH()` у місці рендеру, бо лише там відоме
   * `defaultOpenForSection` (V-15, аудит 2026-08-08). До того числа тут
   * підставлялись безумовно, і секція, що монтується згорнутою, резервувала
   * втричі більше, ніж малювала.
   *
   * Проміжного стану «шапка + згорнуті SubGroup-и» більше не існує
   * (адверсарне ревʼю 2026-08-08, дефект №4): Варіант A прибрав власний
   * collapse у `SettingsSubGroup`, тож висота буває тільки двох видів —
   * закрита шапка або справжня повна.
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

// Висота згорнутої `SettingsGroup` — бейдж іконки + рядок заголовка +
// падінги (`px-4 py-4`). Те саме число, що дефолт `minH` у
// `SectionSkeleton`; тримаємо копію тут, щоб вибір нижче читався без
// стрибка у файл примітиву.
const COLLAPSED_SECTION_MIN_H = 72;

/**
 * Яку висоту резервувати під lazy-секцію, доки її чанк вантажиться.
 *
 * Експортовано заради тесту: у `HubSettingsPage.test.tsx` усі чотири
 * lazy-секції замоковані через `vi.mock`, тож `React.lazy` резолвиться
 * миттєво і skeleton у тому файлі не рендериться ЖОДНОГО разу — assert-у
 * по реальному DOM там просто нема на чому тримати. Тому пінимо саме
 * рішення, а не його наслідок.
 */
export function lazySectionMinH(
  expandedMinH: number,
  willRenderOpen: boolean,
): number {
  return willRenderOpen ? expandedMinH : COLLAPSED_SECTION_MIN_H;
}

// Suspense-fallback heights for the four module-scoped sections that are
// React.lazy() (Initiative 0017 Sprint 1.1 PR-1.2) — see
// `SettingsSection.lazy` above for what each number represents.
//
// V-15 (аудит Профілю/Налаштувань 2026-08-08): число тут — висота секції в
// РОЗГОРНУТОМУ стані, і застосовується воно лише тоді, коли секція справді
// намалюється розгорнутою. Раніше воно було безумовним, і три з чотирьох
// секцій, які монтуються ЗГОРНУТИМИ, резервували 168–280px під рядок у
// 72px: skeleton зникав — і решта списку стрибала ВГОРУ, тобто рівно той
// layout-shift, якого skeleton має уникати, тільки у зворотний бік.
//
// Розгорнутою lazy-секція буває у двох випадках, і обидва відомі в тому ж
// `map`, де рендериться `<Suspense>` (`defaultOpenForSection`): це або
// перша секція активної вкладки (Варіант A), або ціль хеш-діп-лінка
// `#settings-<id>`. Для `routine` перший випадок — типовий: він index 0
// вкладки «Розділи», тому 600 (консервативна оцінка двох `SettingsSubGroup`
// — календарні перемикачі, далі редактори тегів/категорій; не піксельний
// вимір, див. RoutineSection.tsx). Для `fizruk` / `finyk` / `nutrition`
// типовий шлях — згорнуто, а їхні числа лишаються оцінкою на рідший
// хеш-випадок.
const SECTION_LAZY: Readonly<Record<string, { minH: number }>> = {
  routine: { minH: 600 },
  fizruk: { minH: 168 },
  finyk: { minH: 248 },
  nutrition: { minH: 280 },
};

// Zips the shared catalog with the local render wiring above. Module scope
// (not `useMemo`) — the renderer closures don't capture any component-
// instance state, so this only needs to compute once per module load.
const SECTIONS: readonly SettingsSection[] = VISIBLE_SETTINGS_SECTIONS.map(
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

// Human copy for `?silpo=error&reason=…` codes sent by
// `apps/server/src/routes/silpo.ts` (`redirectToSettings`). Unmapped/absent
// reasons fall back to the generic message below (do not remove that
// fallback — new server-side reasons must degrade gracefully, not dump the
// machine code into the toast).
const SILPO_ERROR_REASON_MESSAGES: Readonly<Record<string, string>> = {
  denied: "Ти відмовив у доступі до Сільпо.",
  invalid_request: "Сільпо не передав потрібні дані. Спробуй ще раз.",
  invalid_state: "Забагато часу минуло з переходу в Сільпо. Спробуй ще раз.",
  config_missing:
    "Звʼязування тимчасово недоступне на сервері. Спробуй пізніше.",
  missing_refresh_token: "Сільпо не надав потрібний доступ. Спробуй ще раз.",
  exchange_failed: "Не вдалося завершити звʼязування з Сільпо. Спробуй ще раз.",
  session_expired:
    "Сесія Sergeant завершилась, поки ти був на сторінці Сільпо. Спробуй ще раз.",
};

function readSettingsSectionHash(hash: string): string | null {
  const raw = hash.replace(/^#/, "");
  if (!raw.startsWith("settings-")) return null;
  return raw.replace(/^settings-/, "");
}

// `readBillingReturnSectionId` / `groupForSection` / `readSettingsGroupParam`
// live in `./hubSettingsUrlParams.ts` (CodeRabbit-ревʼю PR #757) — тут вони
// викликаються з `GROUPS` (вище) явним параметром, оскільки `GROUPS` —
// даність структури ЦІЄЇ сторінки (вкладки, які вона ж і рендерить), а не
// URL-хелпер.

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
    const fromQuery = readSettingsGroupParam(location.search, GROUPS);
    if (fromQuery) return fromQuery;
    const sectionId = readSettingsSectionHash(location.hash);
    return groupForSection(sectionId, GROUPS)?.id ?? "general";
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
      const group = groupForSection(sectionId, GROUPS);
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
    const group = groupForSection(targetSectionId, GROUPS);

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

  // Silpo OAuth callback (walking-skeleton experiment, track A) returns to
  // `/settings?silpo=connected|error&reason=…` — `route.tsx` forwards every
  // query param verbatim onto `/?tab=settings&silpo=…`. Mirrors the
  // billing-return effect above: land on «Фінік» (owner of the Silpo card),
  // toast the outcome, refetch `silpoKeys` so the card shows the
  // server-verified state immediately, and strip the param so a reload
  // doesn't repeat either.
  //
  // «Фінік» lives under the "modules" group, not the default "general" one
  // billing's "plan" target uses — that difference matters TWICE here:
  //
  // 1. `setTab()` (unlike the raw `setTabRaw` setter) ALSO fires its own
  //    `navigate()` via `writeSettingsGroupParam`, deferred into the
  //    microtask below so it would run AFTER this effect's synchronous
  //    cleanup `navigate()` — reading `locationRef.current` (one render
  //    behind, still carrying the un-stripped `silpo=…` search). For
  //    "general" (billing) that second navigate is a no-op (nothing to
  //    add), so the race was invisible there; for "modules" it would
  //    resurrect the stripped param. `setTabRaw` updates the same `tab`
  //    state WITHOUT the side-effecting navigate, so this effect's own
  //    `navigate()` below (which already folds in the right `group` param)
  //    stays the only word from THIS effect.
  //
  // 2. Unlike `announceSettingsHashChange()` in the billing effect, this
  //    effect must NOT call it. `PlanSection`/`PrivacySection` (billing's
  //    "general" targets) are already mounted when their effect runs —
  //    dispatching a synthetic "hashchange" reaches their `SettingsGroup`
  //    directly. «Фінік» is NOT mounted yet at this point (`tab` is still
  //    whatever it was on load, «modules» hasn't rendered) — the SAME
  //    dispatched event is instead caught by the unrelated `syncHash`
  //    listener below, which calls the side-effecting `setTab()` from
  //    point 1 and reproduces the exact corruption that switching to
  //    `setTabRaw` was meant to avoid. Once `setTabRaw("modules")` commits
  //    and `FinykSection`'s `SettingsGroup anchorId="settings-finyk"`
  //    actually mounts, its OWN mount-time `matchesHash()` check picks up
  //    `window.location.hash` (already correct from this effect's single
  //    `navigate()` call above) without needing the event at all.
  const silpoReturnHandledRef = useRef(false);
  useEffect(() => {
    if (silpoReturnHandledRef.current) return;
    const params = new URLSearchParams(location.search);
    const silpo = params.get("silpo");
    if (silpo !== "connected" && silpo !== "error") return;
    silpoReturnHandledRef.current = true;

    const targetSectionId = "finyk";
    const group = groupForSection(targetSectionId, GROUPS);

    queueMicrotask(() => {
      setQuery("");
      if (group) setTabRaw(group.id);
      setHashSectionId(targetSectionId);
    });

    void queryClient.invalidateQueries({ queryKey: silpoKeys.all });
    if (silpo === "connected") {
      toast.success(
        "Сільпо звʼязано. Натисни «Оновити чеки», щоб підтягнути покупки.",
      );
    } else {
      const reason = params.get("reason");
      toast.error(
        (reason && SILPO_ERROR_REASON_MESSAGES[reason]) ??
          "Не вдалося звʼязати Сільпо.",
        undefined,
        {
          label: "Спробувати ще раз",
          onClick: () => {
            window.location.href = silpoConnectUrl({
              baseUrl: apiUrl(""),
              apiPrefix: getApiPrefix(),
            });
          },
        },
      );
    }

    const cleanParams = new URLSearchParams(location.search);
    cleanParams.delete("silpo");
    cleanParams.delete("reason");
    cleanParams.set("tab", "settings");
    // Mirrors `writeSettingsGroupParam`'s own convention (drop `group` for
    // the default tab, set it otherwise) — this replaces that helper's
    // navigate call for this effect (see the comment above), so the
    // convention has to be re-applied here too.
    if (group && group.id !== "general") {
      cleanParams.set("group", group.id);
    } else {
      cleanParams.delete("group");
    }
    const qs = cleanParams.toString();
    navigate(
      {
        pathname: location.pathname,
        search: qs ? `?${qs}` : "",
        hash: `#settings-${targetSectionId}`,
      },
      { replace: true },
    );
  }, [location.pathname, location.search, navigate, queryClient, toast]);

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
    const stickyHeight = stickyHeaderRef.current?.offsetHeight ?? 146;
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
      {/* «Острів» (рішення власника 2026-08-28): sticky-обгортка прозора —
          суцільної плашки більше немає; пошук і вкладки живуть в одній
          піднятій картці (bg-panel + shadow-e2), а контент при скролі
          «розчиняється» позаду через градієнт-фейд нижче, замість різкого
          зрізу об border-b. Попередня плашка була `bg-surface-soft-glass`,
          який після «Чорнила» — НЕпрозорий #f6f5f2 (panel-hi): він не
          збігався ні з фоном сторінки, ні з білими картками і читався як
          чужа сіра плита, а `backdrop-blur-md` при альфі 1 не мав чого
          блюрити (скарга власника 2026-08-28).

          Safe-area відступу тут більше немає навмисно: Налаштування живуть
          рівно в одному місці — вкладці хаба під його фіксованою шапкою
          (L-1, `settings/route.tsx`: `/settings` — redirect-only), тож цей
          sticky ніколи не досягає статус-бара, і `env(safe-area-inset-top)`
          давав лише ~60px мертвої порожнечі у standalone/shell. */}
      <div
        ref={stickyHeaderRef}
        className="sticky top-0 z-10 -mx-4 -mt-3 px-4 pt-2 pb-1"
      >
        {/* Фейд позаду острова: фон сторінки → прозорий, на 32px нижче
            картки. Саме він пом'якшує зріз контенту в бокових проміжках і
            під карткою. pointer-events-none — крізь прозору частину все ще
            видно (і має клікатись) контент. */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 -bottom-8 bg-linear-to-b from-bg from-55% to-transparent pointer-events-none"
        />
        <div className="relative flex flex-col gap-2.5 rounded-2xl bg-panel border border-surface-line shadow-e2 p-3">
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
                // Chrome's password manager used to claim this box: it showed
                // the saved-account dropdown, autofilled the e-mail and refilled
                // it after every click on the clear "×", so the field could not
                // be emptied at all (tester video 2026-08-10). The field carried
                // no `name`/`autocomplete`, and its only text context is
                // Cyrillic, which Chromium's field heuristics cannot read — so
                // it stayed unclassified and got picked up as a username field.
                // `searchFieldProps` supplies both layers Chromium looks at.
                {...searchFieldProps("settings-search")}
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
                // `bg-panelHi` (не `bg-panel`): всередині білої картки-острова
                // біле поле зливалося б із власним контейнером — той самий
                // ефект «порожнього блоку», що й у звіті 2026-05-26, лише
                // навпаки. Тон panel-hi віддає поле від картки без бордера.
                className="input-focus w-full min-h-[48px] pl-11 pr-11 py-3 bg-panelHi border border-transparent rounded-xl text-style-body text-ink placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
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
                className="absolute right-2 top-1/2 -translate-y-1/2 hover:bg-panel"
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
              // Трек — panel-hi всередині білої картки (та сама логіка, що
              // в пошуку вище). На такому треці дефолтний активний піл
              // `bg-brand-soft` (stone-100) був би невідрізнюваний від
              // фону — тому активний перекрито на панельно-білий чип із
              // hairline + e1 через `aria-selected:` (cn = twMerge, і
              // `[aria-selected="true"]` специфічніший за базові класи
              // Tabs). `rounded-lg` — концентричний радіус до треку
              // `rounded-xl` з його p-1.
              className="overflow-x-auto bg-panelHi rounded-xl"
              tabsClassName="rounded-lg border-transparent aria-selected:bg-panel aria-selected:border-line aria-selected:shadow-e1"
            />
          )}
        </div>
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
                  // The Search + Tabs island above is `sticky top-0` (≈146px
                  // with the card paddings). With `scroll-mt-4` (16px) the
                  // section title landed *behind* that sticky chrome after
                  // `scrollIntoView`, so deep-links like `#settings-dashboard`
                  // from the inactive Bento card felt like they "just opened
                  // the Settings tab" (issue 2026-05-08). 10rem clears the
                  // island on every viewport while still leaving a small
                  // visual gap above the landed section.
                  className="scroll-mt-40"
                >
                  {s.lazy ? (
                    // V-15: резервуємо рівно ту висоту, якою секція
                    // намалюється — розгорнуту лише тоді, коли вона справді
                    // буде розгорнутою (див. `SECTION_LAZY` вище).
                    <ChunkErrorBoundary
                      minH={lazySectionMinH(s.lazy.minH, defaultOpenForSection)}
                    >
                      <Suspense
                        fallback={
                          <SectionSkeleton
                            minH={lazySectionMinH(
                              s.lazy.minH,
                              defaultOpenForSection,
                            )}
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
