/**
 * Aggregated state hook for the Hub Dashboard (T1 decomposition).
 *
 * Extracts all `useState` / `useEffect` / `useMemo` / `useCallback` from
 * `HubDashboard` into a single hook so the container stays under 100 LOC.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import {
  DASHBOARD_DENSITY_EVENT,
  DEFAULT_DASHBOARD_DENSITY,
  STORAGE_KEYS,
  countRealEntries,
  getActiveModules,
  getActiveNudge,
  getHideInactiveModules,
  getOnboardingGoals,
  getVibePicks,
  hasSeenCrossModulePreview,
  isActiveModule,
  normalizeDashboardDensity,
  recordLastActiveDate,
  setHideInactiveModules,
  shouldShowReengagement,
  type DashboardDensity,
  type DashboardModuleId,
} from "@sergeant/shared";
import {
  openHubModule,
  openHubModuleWithAction,
} from "@shared/lib/modules/hubNav";
import { getModulePrimaryAction } from "@shared/lib/modules/moduleQuickActions";
import { useDashboardFocus } from "../insights/TodayFocusCard";
import { hasLiveWeeklyDigest } from "../insights/WeeklyDigestCard";
import { useCoachInsight } from "../insights/useCoachInsight";
import {
  detectFirstRealEntry,
  getFirstRealEntryModule,
} from "../onboarding/firstRealEntry";
import { getSessionDays, recordSessionDay } from "../onboarding/vibePicks";
import { useOnboardingState } from "../onboarding/useOnboardingState";
import { useFirstEntryCelebration } from "../onboarding/useFirstEntryCelebration";
import { hasAnyValueBar } from "./ValueProgressBar";
import { webKVStore } from "@shared/lib/storage/storage";
import {
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useAnnounce } from "@shared/components/ui/ScreenReaderAnnouncer";
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import {
  loadDashboardOrder,
  localStorageStore,
  saveDashboardOrder,
} from "./dashboard/dashboardStore";
import { type ModuleId } from "./dashboard/moduleConfigs";
import {
  applyAdaptiveLift,
  pickAdaptiveLift,
  pickStrongestSeverity,
} from "./dashboard/adaptiveSort";
import { useHubPref } from "../settings/hubPrefs";
import { useMondayAutoDigest } from "./dashboard/useMondayAutoDigest";
import type { User } from "./hub.types";

// ─────────────────────────────────────────────────────────────────────
// Dashboard density hook
// ─────────────────────────────────────────────────────────────────────

/**
 * Reactive read of the user's dashboard-density preference.
 *
 * Same-window `localStorage` writes do NOT fire `storage`, so the picker in
 * Settings → Дашборд dispatches a `DASHBOARD_DENSITY_EVENT` we listen to
 * here. Cross-tab writes are still handled via the standard `storage` event.
 */
export function useDashboardDensity(): DashboardDensity {
  const [density, setDensity] = useState<DashboardDensity>(() => {
    const raw = safeReadStringLS(STORAGE_KEYS.DASHBOARD_DENSITY);
    return raw === null
      ? DEFAULT_DASHBOARD_DENSITY
      : normalizeDashboardDensity(raw);
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent<unknown>).detail;
      setDensity(normalizeDashboardDensity(detail));
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.DASHBOARD_DENSITY) {
        setDensity(normalizeDashboardDensity(e.newValue));
      }
    };
    window.addEventListener(DASHBOARD_DENSITY_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DASHBOARD_DENSITY_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return density;
}

// ─────────────────────────────────────────────────────────────────────
// Ukrainian pluralisation
// ─────────────────────────────────────────────────────────────────────

export function pluralize(
  n: number,
  one: string,
  few: string,
  many: string,
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
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
  sensors: ReturnType<typeof useSensors>;
  handleDragStart: (event: { active: { id: string | number } }) => void;
  handleDragEnd: (event: {
    active: { id: string | number };
    over: { id: string | number } | null;
  }) => void;
  quickAddByModule: Record<
    string,
    { label: string; run: () => void } | undefined
  >;
  adaptive: { liftedId: ModuleId | null; reason: string | null };

  // Focus / Insights
  focus: ReturnType<typeof useDashboardFocus>["focus"];
  rest: ReturnType<typeof useDashboardFocus>["rest"];
  dismiss: ReturnType<typeof useDashboardFocus>["dismiss"];
  openInsightTarget: (module: string, hash?: string) => void;
  coachInsightText: string | null;
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
  onShowAuth: () => void;
}): HubDashboardState {
  const { onOpenModule, user, onShowAuth } = props;

  const [order, setOrder] = useState(loadDashboardOrder);
  const density = useDashboardDensity();
  useMondayAutoDigest();

  const hasRealEntry = detectFirstRealEntry();
  const celebration = useFirstEntryCelebration(hasRealEntry);
  const [sessionDays, setSessionDays] = useState(-1);
  useEffect(() => {
    setSessionDays(recordSessionDay() || getSessionDays());
  }, []);
  const entryCount = useMemo(() => countRealEntries(localStorageStore), []);

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

  const {
    insight: coachInsightText,
    loading: coachLoading,
    error: coachError,
    refresh: coachRefresh,
  } = useCoachInsight();

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
  useEffect(() => {
    const id = setInterval(() => setAdaptiveNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const { announce } = useAnnounce();

  const quickAddByModule = useMemo(() => {
    const map: Record<string, { label: string; run: () => void } | undefined> =
      {};
    const localActiveSet = new Set<string>(activeModules);
    for (const id of modulesWithSignal) {
      if (!localActiveSet.has(id)) continue;
      const quick = getModulePrimaryAction(id);
      if (!quick) continue;
      map[id] = {
        label: quick.label,
        run: () =>
          openHubModuleWithAction(
            id as Parameters<typeof openHubModuleWithAction>[0],
            quick.action,
          ),
      };
    }
    return map;
  }, [modulesWithSignal, activeModules]);

  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const activeId = String(event.active.id) as ModuleId;
      const label = SHARED_DASHBOARD_MODULE_LABELS[activeId] ?? activeId;
      announce(
        `Підняли ${label}. Стрілками обери позицію, Enter — зафіксувати.`,
      );
    },
    [announce],
  );

  const handleDragEnd = useCallback(
    (event: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const { active, over } = event;
      if (!active) return;
      const activeId = String(active.id) as ModuleId;
      const label = SHARED_DASHBOARD_MODULE_LABELS[activeId] ?? activeId;
      if (over && active.id !== over.id) {
        const overId = String(over.id) as ModuleId;
        const oldIndex = order.indexOf(activeId);
        const newIndex = order.indexOf(overId);
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
    | "finyk"
    | "fizruk"
    | "routine"
    | "nutrition"
    | undefined;
  const showChecklist =
    primaryModule &&
    hasRealEntry &&
    !onboardingState.showFirstAction &&
    sessionDays <= 7;

  const insightsDefaultOpen = sessionDays >= 7;

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
    sensors,
    handleDragStart,
    handleDragEnd,
    quickAddByModule,
    adaptive,
    focus,
    rest,
    dismiss,
    openInsightTarget,
    coachInsightText,
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
