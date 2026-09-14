/**
 * Aggregated state hook for the Hub Dashboard (T1 decomposition).
 *
 * Extracts all `useState` / `useEffect` / `useMemo` / `useCallback` from
 * `HubDashboard` into a single hook so the container stays under 100 LOC.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DASHBOARD_DENSITY,
  getActiveModules,
  getActiveNudge,
  getHideInactiveModules,
  getModulesWithFirstAction,
  getOnboardingGoals,
  getVibePicks,
  hasSeenCrossModulePreview,
  isActiveModule,
  isWithinChecklistWindow,
  normalizeDashboardDensity,
  pluralUa,
  recordLastActiveDate,
  setHideInactiveModules,
  shouldShowReengagement,
  type DashboardDensity,
  type DashboardModuleId,
} from "@sergeant/shared";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { useDashboardFocus } from "../insights/TodayFocusCard";
import { hasLiveWeeklyDigest } from "../insights/WeeklyDigestCard";
import { useCoachInsight } from "../insights/useCoachInsight";
import {
  countRealEntries,
  detectFirstActionCompletedPerModule,
  detectFirstRealEntry,
  getFirstRealEntryModule,
} from "../onboarding/firstRealEntry";
import {
  getSessionDays,
  isFirstRealEntryDone,
  recordSessionDay,
} from "../onboarding/vibePicks";
import { useOnboardingState } from "../onboarding/useOnboardingState";
import { useFirstEntryCelebration } from "../onboarding/useFirstEntryCelebration";
import { isDemoMode } from "../onboarding/demoMode";
import { isLocalOnlyBannerVisible } from "./localOnlyBannerVisibility";
import { hasAnyValueBar } from "./ValueProgressBar";
import { webKVStore } from "@shared/lib/storage/storage";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { useHubStorageBump } from "./useHubStorageBump";
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import {
  loadDashboardOrder,
  localStorageStore,
  saveDashboardOrder,
} from "./dashboard/dashboardStore";
import { type ModuleId } from "./dashboard/moduleConfigs";
import {
  arrayMove,
  type NativeSortableHandlers,
} from "./dashboard/nativeSortable";
import {
  applyAdaptiveLift,
  pickAdaptiveLift,
  pickStrongestSeverity,
} from "./dashboard/adaptiveSort";
import { useHubPref, HUB_PREF_DENSITY } from "../settings/hubPrefs";
import { useMondayAutoDigest } from "./dashboard/useMondayAutoDigest";
import type { User } from "./hub.types";

// ─────────────────────────────────────────────────────────────────────
// Dashboard density hook
// ─────────────────────────────────────────────────────────────────────

/**
 * Reactive read of the user's dashboard-density preference.
 *
 * Раніше тут жила власна машинерія: свій ключ `localStorage`, свій
 * `DASHBOARD_DENSITY_EVENT` (бо same-window запис не піднімає `storage`)
 * і свій слухач крос-табу. Тепер щільність — звичайний ключ мішка
 * `hub_prefs_v1`, тож усе це дає `useHubPref`: і same-window сповіщення,
 * і крос-таб, і — головне — синхронізацію між пристроями, якої в неї не
 * було (залишок PR-S13).
 */
export function useDashboardDensity(): DashboardDensity {
  const [raw] = useHubPref<string>(HUB_PREF_DENSITY, DEFAULT_DASHBOARD_DENSITY);
  return normalizeDashboardDensity(raw);
}

// ─────────────────────────────────────────────────────────────────────
// Ukrainian pluralisation
// ─────────────────────────────────────────────────────────────────────

/**
 * Позиційна обгортка над канонічним `pluralUa` з `@sergeant/shared`
 * (Intl.PluralRules, ті самі CLDR-правила, що й колишня ручна реалізація).
 * Сигнатуру збережено заради наявних call-site-ів.
 */
export function pluralize(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  return pluralUa(n, { one, few, many });
}

// ─────────────────────────────────────────────────────────────────────
// Coach insight visibility gate (аудит PR-A1)
// ─────────────────────────────────────────────────────────────────────

/**
 * Чи видно блок з AI-порадою на екрані ЗАРАЗ.
 *
 * Дзеркалить умову рендеру `HubInsightsBlock` у `HubDashboard.tsx`
 * (`s.hasRealEntry && !calmMode && showInsights`) — обидва місця мають
 * лишатись синхронними, бо саме ця умова вирішує, чи варто взагалі бити
 * запит до `useCoachInsight` (денна AI-квота Free-плану, ADR-0085).
 */
export function shouldFetchCoachInsight(
  hasRealEntry: boolean,
  calmMode: boolean,
  showInsights: boolean,
  insightsOpen: boolean,
): boolean {
  return hasRealEntry && !calmMode && showInsights && insightsOpen;
}

// ─────────────────────────────────────────────────────────────────────
// Main aggregated state
// ─────────────────────────────────────────────────────────────────────

export interface HubDashboardState {
  // Layout
  density: DashboardDensity;

  // Onboarding / FTUX
  hasRealEntry: boolean;
  sessionDays: number;
  entryCount: number;
  celebration: ReturnType<typeof useFirstEntryCelebration>;
  onboardingState: ReturnType<typeof useOnboardingState>;

  // Re-engagement
  reengagement: { show: boolean; daysInactive: number };
  dismissReengagement: () => void;

  // Cross-module preview
  crossModulePreviewSource: DashboardModuleId | null;
  dismissCrossModulePreview: () => void;

  // Nudge
  activeNudge: ReturnType<typeof getActiveNudge>;
  dismissNudge: () => void;

  // Module grid
  activeModules: readonly string[];
  hideInactive: boolean;
  toggleHideInactive: () => void;
  hasInactive: boolean;
  editMode: boolean;
  toggleEditMode: () => void;
  displayOrder: readonly string[];
  order: readonly string[];
  sortableHandlers: NativeSortableHandlers;
  adaptive: { liftedId: ModuleId | null; reason: string | null };

  // Focus / Insights
  focus: ReturnType<typeof useDashboardFocus>["focus"];
  rest: ReturnType<typeof useDashboardFocus>["rest"];
  dismiss: ReturnType<typeof useDashboardFocus>["dismiss"];
  openInsightTarget: (module: string, hash?: string) => void;
  coachInsightText: string | null;
  /** `advice_id` поточної AI-поради (телеметрія `ai_advice_*`, Хвиля 2). */
  coachAdviceId: string | null;
  coachLoading: boolean;
  coachError: string | null;
  coachRefresh: () => void;

  // Weekly digest
  digestExpanded: boolean;
  setDigestExpanded: (v: boolean) => void;
  digestFresh: boolean;
  showDigestFooter: boolean;

  // Insights defaults
  insightsDefaultOpen: boolean;

  // Module checklist
  primaryModule: "finyk" | "fizruk" | "routine" | "nutrition" | undefined;
  showChecklist: boolean;

  // Onboarding progress
  goals: ReturnType<typeof getOnboardingGoals>;
  hasValueBar: boolean;
}

export function useHubDashboardState(props: {
  onOpenModule: (module: string) => void;
  user: User | null;
  /**
   * `status` з `AuthContext`, прокинутий згори (`HubDashboard.tsx`).
   * Свідомо проп, а не `useAuthOptional()` тут: два юніт-тести цього модуля
   * (`*.pluralize`, `*.coachInsightEnabled`) навмисно живуть без DOM, і
   * імпорт `AuthContext` роняє їх на `window is not defined`. Навіщо статус
   * потрібен — див. `localOnlyBannerVisibility.ts`.
   */
  authStatus?: string | undefined;
  /**
   * Чи РОЗГОРНУТИЙ блок «Що зараз важливо» прямо зараз.
   *
   * Стан живе в `HubDashboard`, а не тут, бо його джерело —
   * `CollapsibleSection` усередині `HubInsightsBlock` (localStorage +
   * `onOpenChange`). Хук лише читає його, щоб не палити денну AI-квоту
   * Free-плану заради поради під закритим акордеоном (аудит PR-A1).
   */
  insightsOpen: boolean;
  onShowAuth: () => void;
}): HubDashboardState {
  const { onOpenModule, user, onShowAuth, authStatus, insightsOpen } = props;

  const [order, setOrder] = useState(loadDashboardOrder);
  const density = useDashboardDensity();
  useMondayAutoDigest();

  // AI-CONTEXT: `bump` тут не декоративний. Докази «юзер уже не новий»
  // живуть у SQLite warm-caches, які теплішають АСИНХРОННО після
  // boot-кластерів — на першому (холодному) рендері хаба їх ще нема. Без
  // ре-читання по `storageUpdated` детекція лишалася б назавжди на
  // холодному знімку: `detectFirstRealEntry` не флипнувся б, FTUX-герой
  // не зник, а `countRealEntries` показав би 0 записів активному юзеру.
  const storageBump = useHubStorageBump();
  void storageBump;
  const hasRealEntry = detectFirstRealEntry();
  // Fire `first_action_completed { module }` once per module that just got its
  // first non-demo entry — must run alongside detectFirstRealEntry on the render
  // path, else the event never emits and the activation funnel stays at 0%.
  detectFirstActionCompletedPerModule();
  // Hoisted above its original call-site (near `insightsDefaultOpen` below)
  // so `useOnboardingState` can read it too — see `localOnlyBannerVisible`.
  const inFtuxSession = !hasRealEntry && !isFirstRealEntryDone();
  // Предикат винесено в `localOnlyBannerVisibility.ts` — там і повне
  // пояснення, чому він мусить збігатися з гейтом самого банера, і чому
  // `authStatus` обовʼязковий (виправлення ревʼю #1128). Потрібен тут
  // (PR-H4, design-audit 2026-09-13), щоб soft-auth hero відступав, поки
  // банер уже ставить те саме питання «увійди» — див.
  // `computeSoftAuthEligible` в `useOnboardingState.ts`.
  const localOnlyBannerVisible = isLocalOnlyBannerVisible({
    inFtuxSession,
    hasUser: Boolean(user),
    authStatus,
    isDemo: isDemoMode(),
  });
  const entryCount = useMemo(
    () => countRealEntries(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- storage-write tick
    [storageBump],
  );
  // LOG-8: `entryCount` doubles as the celebration's "is this genuinely the
  // FIRST entry, or a returning device whose 60-day-old account just synced
  // down" guard — see the doc-comment on `useFirstEntryCelebration`.
  const celebration = useFirstEntryCelebration(hasRealEntry, entryCount);
  const [sessionDays] = useState(() => recordSessionDay() || getSessionDays());

  const [reengagement, setReengagement] = useState(() =>
    shouldShowReengagement(localStorageStore),
  );
  useEffect(() => {
    recordLastActiveDate(localStorageStore);
  }, []);

  const focusProbe = useDashboardFocus();
  const onboardingState = useOnboardingState({
    user,
    hasRealEntry,
    sessionDays,
    todayFocusAvailable: focusProbe.focus !== null,
    reengagementEligible: reengagement.show,
    onShowAuth,
    localOnlyBannerVisible,
  });

  const [crossModulePreviewSource, setCrossModulePreviewSource] =
    useState<DashboardModuleId | null>(() => {
      if (!hasRealEntry) return null;
      if (hasSeenCrossModulePreview(localStorageStore)) return null;
      return getFirstRealEntryModule();
    });
  const dismissCrossModulePreview = useCallback(
    () => setCrossModulePreviewSource(null),
    [],
  );

  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const activeNudge = useMemo(() => {
    if (nudgeDismissed || sessionDays < 2) return null;
    return getActiveNudge(localStorageStore, sessionDays, {
      picks: getVibePicks(localStorageStore),
      modulesWithEntries: new Set(getModulesWithFirstAction(localStorageStore)),
    });
  }, [sessionDays, nudgeDismissed]);

  const activeModules = useMemo(() => getActiveModules(localStorageStore), []);
  const [hideInactive, setHideInactive] = useState(() =>
    getHideInactiveModules(localStorageStore),
  );
  const toggleHideInactive = useCallback(() => {
    setHideInactive((prev) => {
      const next = !prev;
      setHideInactiveModules(localStorageStore, next);
      return next;
    });
  }, []);
  const hasInactive = useMemo(
    () => order.some((id) => !isActiveModule(activeModules, id)),
    [order, activeModules],
  );

  const [editMode, setEditMode] = useState(false);
  const toggleEditMode = useCallback(() => setEditMode((p) => !p), []);
  const visibleOrder = useMemo(
    () =>
      hideInactive
        ? order.filter((id) => isActiveModule(activeModules, id))
        : order,
    [order, activeModules, hideInactive],
  );

  const { focus, rest, dismiss } = focusProbe;

  const openInsightTarget = useCallback(
    (module: string, hash?: string) => {
      if (hash) {
        openHubModule(module as Parameters<typeof openHubModule>[0], hash);
        return;
      }
      onOpenModule(module);
    },
    [onOpenModule],
  );

  // Ті самі два прапори, які `HubDashboard.tsx` читає для видимості
  // `HubInsightsBlock` (`!calmMode && showInsights`) — читаємо тут-таки,
  // щоб не робити мережевий запит/не палити AI-квоту заради поради, якої
  // ніде не показують (аудит PR-A1, канон hub-coach §6.2).
  const [calmMode] = useHubPref<boolean>("calmMode", false);
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  // AI-DANGER: `insightsOpen` — НЕ дублікат трьох прапорців вище, і
  // прибрати його не можна.
  //
  // Три прапорці кажуть «блок змонтований», а він монтується ЗГОРНУТИМ:
  // `HubDashboard` передає `insightsDefaultOpen={false}` навмисно
  // (рішення «Тихо» — увесь розумний шум живе під згорнутим pill).
  // Тобто без цього терма порада генерувалась у КОЖНОГО, хто просто
  // відкрив хаб, і Free-користувач щодня платив частиною денної квоти
  // (5 запитів) за текст, якого на екрані немає — залишок аудиту PR-A1.
  //
  // Згорнутий підпис від цього не біднішає: він поради не показує
  // (`HubInsightsBlock.tsx` — третя гілка `collapsedSubtitle` віддає
  // `rest[0]?.title`), тож зникає лише блимання «Готую AI-пораду…».
  const coachInsightEnabled = shouldFetchCoachInsight(
    hasRealEntry,
    calmMode,
    showInsights,
    insightsOpen,
  );

  const {
    insight: coachInsightText,
    // `advice_id` поточної AI-поради — лише прокидається в UI для телеметрії
    // `ai_advice_*`; жодне продуктове рішення від нього не залежить.
    adviceId: coachAdviceId,
    loading: coachLoading,
    error: coachError,
    refresh: coachRefresh,
  } = useCoachInsight({ enabled: coachInsightEnabled });

  const modulesWithSignal = useMemo(() => {
    const all = focus ? [focus, ...rest] : rest;
    const set = new Set<string>();
    for (const r of all) {
      if (r.module && r.module !== "hub") set.add(r.module);
    }
    return set;
  }, [focus, rest]);

  const [adaptivePref] = useHubPref<boolean>("adaptiveBento", true);

  const severityByModule = useMemo(() => {
    const all = focus ? [focus, ...rest] : rest;
    const map: Partial<Record<ModuleId, "danger" | "warning" | undefined>> = {};
    for (const r of all) {
      if (!r.module || r.module === "hub") continue;
      const id = r.module as ModuleId;
      const sev =
        r.severity === "danger" || r.severity === "warning"
          ? r.severity
          : undefined;
      map[id] = pickStrongestSeverity([map[id], sev]);
    }
    return map;
  }, [focus, rest]);

  const [adaptiveNow, setAdaptiveNow] = useState(() => new Date());
  const adaptiveTickerOn = adaptivePref && !editMode;
  const [prevAdaptiveTickerOn, setPrevAdaptiveTickerOn] =
    useState(adaptiveTickerOn);
  if (adaptiveTickerOn !== prevAdaptiveTickerOn) {
    setPrevAdaptiveTickerOn(adaptiveTickerOn);
    if (adaptiveTickerOn) {
      void Promise.resolve().then(() => setAdaptiveNow(new Date()));
    }
  }
  useEffect(() => {
    if (!adaptiveTickerOn) return;
    const id = setInterval(() => setAdaptiveNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [adaptiveTickerOn]);

  const activeSet = useMemo(
    () => new Set<string>(activeModules),
    [activeModules],
  );

  const adaptive = useMemo(() => {
    if (!adaptivePref || editMode) {
      return {
        liftedId: null as ModuleId | null,
        reason: null as string | null,
      };
    }
    const result = pickAdaptiveLift({
      order: visibleOrder as ModuleId[],
      modulesWithSignal,
      severityByModule,
      activeModules: activeSet,
      now: adaptiveNow,
    });
    return { liftedId: result.liftedId, reason: result.reason };
  }, [
    adaptivePref,
    editMode,
    visibleOrder,
    modulesWithSignal,
    severityByModule,
    activeSet,
    adaptiveNow,
  ]);

  const displayOrder = useMemo(
    () => applyAdaptiveLift(visibleOrder as ModuleId[], adaptive.liftedId),
    [visibleOrder, adaptive.liftedId],
  );

  // Native pointer DnD (S10-T2): mouse activates after 8px movement;
  // touch requires a 250ms long-press (see beginNativeSortablePointerDrag).
  // Keyboard Arrow*/Home/End reorder when the grip handle is focused.
  const { announce } = useAnnounce();

  const handleDragStart = useCallback(
    ({ activeId }: { activeId: string }) => {
      const id = activeId as ModuleId;
      const label = SHARED_DASHBOARD_MODULE_LABELS[id] ?? activeId;
      announce(`Підняли ${label}. Стрілками обери позицію, Enter фіксує.`);
    },
    [announce],
  );

  const handleDragEnd = useCallback(
    ({ activeId, overId }: { activeId: string; overId: string | null }) => {
      const id = activeId as ModuleId;
      const label = SHARED_DASHBOARD_MODULE_LABELS[id] ?? activeId;
      if (overId && overId !== activeId) {
        const oldIndex = order.indexOf(id);
        const newIndex = order.indexOf(overId as ModuleId);
        if (oldIndex < 0 || newIndex < 0) {
          announce(`${label} залишилось на тому ж місці.`);
          return;
        }
        const next = arrayMove(order, oldIndex, newIndex);
        setOrder(next);
        saveDashboardOrder(next);
        announce(
          `${label} пересунуто на позицію ${newIndex + 1} з ${next.length}.`,
        );
      } else {
        announce(`${label} залишилось на тому ж місці.`);
      }
    },
    [announce, order],
  );

  const sortableHandlers = useMemo<NativeSortableHandlers>(
    () => ({
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    }),
    [handleDragEnd, handleDragStart],
  );

  const [digestExpanded, setDigestExpanded] = useState(false);
  const digestFresh = hasLiveWeeklyDigest();
  // UX-feedback 2026-05-13: користувачі питали «куди зник звіт тижня»
  // у середу/четвер коли digest не свіжий. Раніше футер показувався
  // тільки Пн/Вт або при свіжому digest (PR 553d1940). Тепер футер
  // завжди є — `WeeklyDigestCard` сам рендерить empty / generate-CTA
  // стани, тому навіть у юзера без даних завжди є очевидний вхід
  // у звіт. На сам digest-індикатор `fresh` досі впливає `digestFresh`.
  const showDigestFooter = true;

  const primaryModule = activeModules[0] as
    "finyk" | "fizruk" | "routine" | "nutrition" | undefined;
  // AI-CONTEXT: the FTUX window is anchored to the ACCOUNT, not to this
  // device. `sessionDays` comes from `recordSessionDay()` in
  // localStorage, so a reinstall / cleared storage / second browser
  // restarts it at 1 and resurrected this checklist for long-standing
  // users (their data syncs back down, so `hasRealEntry` flips true
  // again and every other term of the gate passes). Better Auth's
  // server-stamped `user.createdAt` cannot be reset that way; the device
  // counter is kept only as the pre-auth fallback, where it is also the
  // correct signal because there is no account yet.
  const showChecklist =
    primaryModule &&
    hasRealEntry &&
    !onboardingState.showFirstAction &&
    isWithinChecklistWindow({
      accountCreatedAt: user?.createdAt ?? null,
      sessionDays,
    });

  // Smart-expand: open insights on first render when the user has at least
  // one actionable rec, is past FTUX, and is on a viewport wide enough to
  // benefit from seeing expanded content (>= 390px). `inFtuxSession` is
  // computed above (near `hasRealEntry`) so `localOnlyBannerVisible` can
  // read it too.
  const hasActionableInsight = rest.length > 0;
  const insightsDefaultOpen =
    sessionDays >= 7 ||
    (hasActionableInsight &&
      !inFtuxSession &&
      typeof window !== "undefined" &&
      window.innerWidth >= 390);

  const goals = useMemo(() => getOnboardingGoals(webKVStore), []);
  const hasValueBar = useMemo(
    () => hasAnyValueBar({ activeModules, goals }),
    [activeModules, goals],
  );

  const dismissReengagement = useCallback(
    () => setReengagement({ show: false, daysInactive: 0 }),
    [],
  );
  const dismissNudge = useCallback(() => setNudgeDismissed(true), []);

  return {
    density,
    hasRealEntry,
    sessionDays,
    entryCount,
    celebration,
    onboardingState,
    reengagement,
    dismissReengagement,
    crossModulePreviewSource,
    dismissCrossModulePreview,
    activeNudge,
    dismissNudge,
    activeModules,
    hideInactive,
    toggleHideInactive,
    hasInactive,
    editMode,
    toggleEditMode,
    displayOrder,
    order,
    sortableHandlers,
    adaptive,
    focus,
    rest,
    dismiss,
    openInsightTarget,
    coachInsightText,
    coachAdviceId,
    coachLoading,
    coachError,
    coachRefresh,
    digestExpanded,
    setDigestExpanded,
    digestFresh,
    showDigestFooter,
    insightsDefaultOpen,
    primaryModule,
    showChecklist: Boolean(showChecklist),
    goals,
    hasValueBar,
  };
}
