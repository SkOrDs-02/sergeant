import { useCallback, useEffect, useMemo, useState } from "react";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import {
  DASHBOARD_DENSITY_EVENT,
  DEFAULT_DASHBOARD_DENSITY,
  STORAGE_KEYS,
  countRealEntries,
  getActiveModules,
  getActiveNudge,
  getHideInactiveModules,
  getVibePicks,
  isActiveModule,
  normalizeDashboardDensity,
  recordLastActiveDate,
  setHideInactiveModules,
  shouldShowReengagement,
  type DashboardDensity,
  type User,
} from "@sergeant/shared";
import {
  openHubModule,
  openHubModuleWithAction,
} from "@shared/lib/modules/hubNav";
import { getModulePrimaryAction } from "@shared/lib/modules/moduleQuickActions";
import { TodayFocusCard, useDashboardFocus } from "../insights/TodayFocusCard";
import { HubInsightsPanel } from "./HubInsightsPanel";
import {
  WeeklyDigestCard,
  hasLiveWeeklyDigest,
} from "../insights/WeeklyDigestCard";
import { useCoachInsight } from "../insights/useCoachInsight";
import { AssistantAdviceCard } from "../insights/AssistantAdviceCard";
import { SoftAuthPromptCard } from "../onboarding/SoftAuthPromptCard";
import { FirstActionHeroCard } from "../onboarding/FirstActionSheet";
import { detectFirstRealEntry } from "../onboarding/firstRealEntry";
import {
  getSessionDays,
  isFirstActionPending,
  isSoftAuthDismissed,
  recordSessionDay,
} from "../onboarding/vibePicks";
import { useFirstEntryCelebration } from "../onboarding/useFirstEntryCelebration";
import { CelebrationModal } from "../onboarding/CelebrationModal";
import { DailyNudge } from "../onboarding/DailyNudge";
import { ReEngagementCard } from "../onboarding/ReEngagementCard";
import { ModuleChecklist } from "../onboarding/ModuleChecklist";
import { OnboardingProgress } from "../onboarding/OnboardingProgress";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import {
  loadDashboardOrder,
  localStorageStore,
  saveDashboardOrder,
} from "./dashboard/dashboardStore";
import { type ModuleId } from "./dashboard/moduleConfigs";
import { SortableCard } from "./dashboard/BentoCard";
import {
  applyAdaptiveLift,
  pickAdaptiveLift,
  pickStrongestSeverity,
} from "./dashboard/adaptiveSort";
import { useHubPref } from "../settings/hubPrefs";
import {
  MotivationalFooter,
  StaggerChild,
  StreakIndicator,
  WeeklyDigestFooter,
} from "./dashboard/dashboardCards";
import { useMondayAutoDigest } from "./dashboard/useMondayAutoDigest";

export const DASHBOARD_MODULE_LABELS = SHARED_DASHBOARD_MODULE_LABELS;
export {
  loadDashboardOrder,
  saveDashboardOrder,
  resetDashboardOrder,
} from "./dashboard/dashboardStore";

/**
 * Tailwind class lookup for dashboard density. Static literals (not template
 * strings) so the JIT picks them up at build time.
 *
 * Spacing comes from `DASHBOARD_DENSITY_SPACING` in `@sergeant/shared`; the
 * values are mirrored here (compact: 2/3, comfortable: 3/4, spacious: 4/5)
 * because Tailwind cannot consume runtime numbers — only literal class names.
 */
const DENSITY_OUTER_SPACE: Record<DashboardDensity, string> = {
  compact: "space-y-3",
  comfortable: "space-y-4",
  spacious: "space-y-5",
};
const DENSITY_BENTO_GAP: Record<DashboardDensity, string> = {
  compact: "gap-2",
  comfortable: "gap-3",
  spacious: "gap-4",
};

/**
 * Reactive read of the user's dashboard-density preference.
 *
 * Same-window `localStorage` writes do NOT fire `storage`, so the picker in
 * Settings → Дашборд dispatches a `DASHBOARD_DENSITY_EVENT` we listen to
 * here. Cross-tab writes are still handled via the standard `storage` event.
 */
function useDashboardDensity(): DashboardDensity {
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

// Ukrainian 1 / 2-4 / 5+ plural. Inline because this file is the only
// current consumer; `AssistantCataloguePage` has its own copy with a
// slightly different (tuple-based) signature. Kept intentionally small;
// if a third call-site appears, promote to `@shared/lib/pluralize`.
function pluralize(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

interface HubDashboardProps {
  onOpenModule: (module: string) => void;
  user: User | null;
  onShowAuth: () => void;
}

export function HubDashboard({
  onOpenModule,
  user,
  onShowAuth,
}: HubDashboardProps) {
  const [order, setOrder] = useState(loadDashboardOrder);
  const density = useDashboardDensity();
  useMondayAutoDigest();

  const [firstActionVisible, setFirstActionVisible] = useState(() =>
    isFirstActionPending(),
  );

  const hasRealEntry = detectFirstRealEntry();
  const celebration = useFirstEntryCelebration(hasRealEntry);
  const [sessionDays, setSessionDays] = useState(-1);
  // `recordSessionDay()` has a side effect (writes today into the
  // session-day ledger) — must run in effect, not render. The `-1`
  // sentinel keeps FTUX gates closed during the first render so we
  // don't flash post-FTUX surfaces before the value resolves.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionDays(recordSessionDay() || getSessionDays());
  }, []);
  const SOFT_AUTH_SESSION_DAYS_THRESHOLD = 3;
  // Скільки сеансів-днів має минути після першого реального запису, перш
  // ніж показати SoftAuth. `1` означає «не на тому ж дні»: користувач,
  // що щойно завершив `FirstActionHeroCard` → `CelebrationModal`, не
  // отримує одразу прохання створити акаунт. Картка чекає наступного
  // повернення (sessionDays ≥ 2). Це зберігає «win-момент» цілим, а
  // самій картці дає вищий signal-to-noise: якщо юзер повернувся —
  // він уже залучений.
  const SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS = 2;
  const [softAuthDismissed, setSoftAuthDismissed] = useState(() =>
    isSoftAuthDismissed(),
  );
  const entryCount = useMemo(() => countRealEntries(localStorageStore), []);
  const showSoftAuth =
    !user &&
    !softAuthDismissed &&
    typeof onShowAuth === "function" &&
    ((hasRealEntry && sessionDays >= SOFT_AUTH_AFTER_ENTRY_MIN_SESSION_DAYS) ||
      sessionDays >= SOFT_AUTH_SESSION_DAYS_THRESHOLD);

  const [reengagement, setReengagement] = useState(() =>
    shouldShowReengagement(localStorageStore),
  );
  useEffect(() => {
    recordLastActiveDate(localStorageStore);
  }, []);

  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const activeNudge = useMemo(() => {
    if (nudgeDismissed || sessionDays < 2) return null;
    return getActiveNudge(localStorageStore, sessionDays, {
      picks: getVibePicks(localStorageStore),
    });
  }, [sessionDays, nudgeDismissed]);

  // Active vs. inactive modules — driven by the user's onboarding
  // "vibe picks". Inactive modules render greyed-out (or hidden when
  // the user has flipped the `hideInactive` toggle below).
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
  // Bento "edit mode" — toggled by the explicit "Налаштувати" button next
  // to the Modules heading. Drives the wiggle animation, the visible drag
  // handle on each card, and gates dnd-kit listeners to the handle so the
  // card body can keep navigating to the module on tap.
  const [editMode, setEditMode] = useState(false);
  const toggleEditMode = useCallback(() => setEditMode((p) => !p), []);
  const visibleOrder = useMemo(
    () =>
      hideInactive
        ? order.filter((id) => isActiveModule(activeModules, id))
        : order,
    [order, activeModules, hideInactive],
  );

  const { focus, rest, dismiss } = useDashboardFocus();

  // Insights з deep-link (`actionHash`) повинні відкрити модуль рівно
  // на потрібній вкладці/елементі — не на дефолтному Огляді. Якщо
  // hash немає, лишаємо стару поведінку (просто перейти на модуль).
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

  // Adaptive bento — soft re-ordering of the 2x2 grid based on context
  // (active rec signals × time of day). Off in editMode and when the
  // user has flipped the `adaptiveBento` pref off (default ON).
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

  // Re-evaluate every minute so time-of-day windows (breakfast / lunch /
  // evening close-out) flip on the right side of their boundaries without
  // a manual reload.
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
  );

  const quickAddByModule = useMemo(() => {
    const map: Record<string, { label: string; run: () => void } | undefined> =
      {};
    const activeSet = new Set<string>(activeModules);
    for (const id of modulesWithSignal) {
      // Suppress quick-add for inactive modules — the BentoCard
      // already hides the affordance, but skipping here keeps the
      // registry tidy and avoids accidental wiring downstream.
      if (!activeSet.has(id)) continue;
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

  const handleDragEnd = useCallback(
    (event: {
      active: { id: string | number };
      over: { id: string | number } | null;
    }) => {
      const { active, over } = event;
      if (active && over && active.id !== over.id) {
        setOrder((prev) => {
          const activeId = String(active.id) as ModuleId;
          const overId = String(over.id) as ModuleId;
          const oldIndex = prev.indexOf(activeId);
          const newIndex = prev.indexOf(overId);
          const next = arrayMove(prev, oldIndex, newIndex);
          saveDashboardOrder(next);
          return next;
        });
      }
    },
    [],
  );

  const [digestExpanded, setDigestExpanded] = useState(false);
  const digestFresh = hasLiveWeeklyDigest();
  const now = new Date();
  const isMondayOrTuesday = now.getDay() === 1 || now.getDay() === 2;
  const showDigestFooter = digestFresh || isMondayOrTuesday;

  // Show checklist for first active module (only if user has no real entry yet).
  // Suppressed while `FirstActionHeroCard` is the hero — both surfaces enumerate
  // module-specific next steps, so stacking them split user attention 1:1 and
  // the FTUX hero already covers the same ground with a single primary CTA.
  const primaryModule = activeModules[0] as
    | "finyk"
    | "fizruk"
    | "routine"
    | "nutrition"
    | undefined;
  const showChecklist =
    primaryModule && !hasRealEntry && !firstActionVisible && sessionDays <= 7;

  // ONE-HERO RULE
  let hero: React.ReactNode;
  if (firstActionVisible) {
    hero = (
      <FirstActionHeroCard onDismiss={() => setFirstActionVisible(false)} />
    );
  } else if (showSoftAuth) {
    hero = (
      <SoftAuthPromptCard
        onOpenAuth={onShowAuth}
        onDismiss={() => setSoftAuthDismissed(true)}
        entryCount={entryCount}
        sessionDays={sessionDays}
      />
    );
  } else {
    hero = (
      <TodayFocusCard
        focus={focus}
        onAction={onOpenModule}
        onDismiss={dismiss}
      />
    );
  }

  // ONE-HERO + ONE-SECONDARY RULE:
  // • Returning user (7+ days inactive) → ReEngagementCard acts as the
  //   hero, suppressing the regular TodayFocus / FirstAction / SoftAuth
  //   candidates so we never stack two "primary" cards.
  // • DailyNudge is the optional secondary nudge; it already hides when
  //   re-engagement is showing (see below), and now supports a 7-day
  //   snooze via `snoozeNudge()` on top of permanent dismiss.
  const reengagementIsHero = reengagement.show;

  // Insights block defaults to collapsed for the first week so new users
  // are not greeted by a wall of empty advice / analytics panels. After
  // 7+ session days the section opens by default; per-user toggles still
  // win because `CollapsibleSection` persists state via `storageKey`.
  const insightsDefaultOpen = sessionDays >= 7;

  // STAGGER GROUPS — three fixed delays (0 / 80ms / 160ms) instead of
  // a per-element ramp. The hub composes ~8 cards once all FTUX gates
  // open; staggering each one individually produced a long staircase
  // of fades on slower devices and shifted whenever a section toggled.
  // Stable group indices keep the reveal under ~250ms and predictable.
  return (
    <div className={DENSITY_OUTER_SPACE[density]}>
      {/* GROUP 0 — Hero block (re-engagement OR streak + hero + checklist) */}
      <StaggerChild index={0}>
        <div className="space-y-4">
          {reengagementIsHero ? (
            <ReEngagementCard
              daysInactive={reengagement.daysInactive}
              onContinue={() =>
                setReengagement({ show: false, daysInactive: 0 })
              }
              onDismiss={() =>
                setReengagement({ show: false, daysInactive: 0 })
              }
            />
          ) : (
            <>
              {/* Single-hero rule: streak chip is suppressed while a
               * dedicated hero (FirstAction / SoftAuth) is taking over
               * the top of the dashboard. Two competing eyebrows above
               * the hero card produced the «card avalanche» the IA pass
               * is fixing — streak still re-appears once the hero falls
               * back to TodayFocus or the default state. */}
              {!firstActionVisible && !showSoftAuth && <StreakIndicator />}
              {hero}
              {showChecklist && primaryModule && (
                <ModuleChecklist
                  moduleId={primaryModule}
                  onAction={(action) => {
                    openHubModuleWithAction(
                      primaryModule as Parameters<
                        typeof openHubModuleWithAction
                      >[0],
                      action as Parameters<typeof openHubModuleWithAction>[1],
                    );
                  }}
                />
              )}
              {/* Activation progress — visible only before the first real
               * entry. Once the user crosses the FTUX gate the bar would
               * read 100% indefinitely, so we drop it instead of pinning
               * a perpetual «4/4 модулів» chrome above the bento grid. */}
              {!hasRealEntry && (
                <OnboardingProgress activeModules={activeModules} />
              )}
            </>
          )}
        </div>
      </StaggerChild>

      {/* GROUP 1 — Module bento grid.
       * Hoisted above the FTUX-gated Hints/Analytics block so the
       * primary navigation surface is reachable above-the-fold on
       * smaller viewports — secondary, data-dependent insights load
       * underneath rather than burying the modules grid. */}
      <StaggerChild index={1}>
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-0.5">
            <SectionHeading as="h2" size="xs" className="px-0!">
              Модулі
            </SectionHeading>
            {/* Edit affordance — icon-only when idle so it stops competing
             * with the H2 «Moduli» for the user's eye. Switches to a clear
             * «Gotovo» pill while edit mode is active so the exit path stays
             * obvious. */}
            <button
              type="button"
              onClick={toggleEditMode}
              aria-pressed={editMode}
              aria-label={
                editMode
                  ? "Завершити налаштування порядку модулів"
                  : "Налаштувати порядок модулів"
              }
              title={editMode ? "Готово" : "Налаштувати"}
              className={cn(
                "inline-flex items-center justify-center gap-1.5 text-2xs font-medium rounded-xl transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                editMode
                  ? "bg-primary text-bg px-2.5 py-1"
                  : "text-muted hover:text-text hover:bg-panelHi w-7 h-7",
              )}
            >
              <Icon
                name={editMode ? "check" : "grip-vertical"}
                size="xs"
                strokeWidth={2}
                aria-hidden
              />
              {editMode ? <span>Готово</span> : null}
            </button>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayOrder}
              strategy={rectSortingStrategy}
            >
              <div
                className={cn(
                  "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
                  DENSITY_BENTO_GAP[density],
                )}
              >
                {displayOrder.map((id) => (
                  <SortableCard
                    key={id}
                    id={id as ModuleId}
                    onOpenModule={onOpenModule}
                    quickAdd={quickAddByModule[id] || null}
                    inactive={!isActiveModule(activeModules, id)}
                    editMode={editMode}
                    adaptiveReason={
                      id === adaptive.liftedId ? adaptive.reason : null
                    }
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {hasInactive && (
            <button
              type="button"
              onClick={toggleHideInactive}
              className="mx-auto mt-2 block text-2xs text-muted underline-offset-2 hover:text-text hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              {hideInactive
                ? "Показати неактивні модулі"
                : "Приховати неактивні модулі"}
            </button>
          )}
        </section>
      </StaggerChild>

      {/* GROUP 2 — «Інсайти» (FTUX-gated): merged Підказки + Аналітика.
       *
       * Previously these rendered as TWO separate `CollapsibleSection`s
       * stacked vertically (each with its own pill chrome, icon, and
       * subtitle), so the user paid an extra collapsed-card tax for
       * essentially the same kind of content — «AI dragging insights
       * out of recent activity». Merging them under one outer
       * «Інсайти» wrapper keeps both subsections discoverable while
       * cutting the heading count in half (per UX audit «Dashboard
       * card avalanche»).
       *
       * До першого реального запису весь блок прихований — всі data-driven
       * всередині (AssistantAdvice / HubInsightsPanel / WeeklyDigest)
       * все одно порожні без історії. */}
      {hasRealEntry && (
        <StaggerChild index={2}>
          <CollapsibleSection
            storageKey="sergeant:hub.insights.open"
            defaultOpen={insightsDefaultOpen}
            title="Інсайти"
            collapsedIcon="sparkles"
            collapsedSubtitle={
              coachLoading
                ? "Готую AI-пораду…"
                : coachError
                  ? "Не вдалось отримати AI-пораду"
                  : rest.length > 0
                    ? `AI-порада · ${rest.length} ${pluralize(rest.length, "інсайт", "інсайти", "інсайтів")}${
                        digestFresh ? " · свіжий дайджест" : ""
                      }`
                    : digestFresh
                      ? "AI-порада + свіжий дайджест"
                      : activeNudge && !reengagement.show
                        ? "AI-порада + нагадування"
                        : "AI-порада на день"
            }
          >
            <AssistantAdviceCard
              insight={coachInsightText}
              loading={coachLoading}
              error={coachError}
              onRefresh={coachRefresh}
            />
            {activeNudge && !reengagement.show && (
              <DailyNudge
                nudge={activeNudge}
                sessionDays={sessionDays}
                onDismiss={() => setNudgeDismissed(true)}
              />
            )}
            <HubInsightsPanel
              items={rest}
              onOpenModule={openInsightTarget}
              onDismiss={dismiss}
            />
            {digestExpanded ? (
              <WeeklyDigestCard onCollapse={() => setDigestExpanded(false)} />
            ) : showDigestFooter ? (
              <WeeklyDigestFooter
                fresh={digestFresh}
                onExpand={() => setDigestExpanded(true)}
              />
            ) : null}
          </CollapsibleSection>
        </StaggerChild>
      )}

      {/* Motivational footer */}
      <MotivationalFooter />

      {/* First entry celebration modal */}
      <CelebrationModal
        open={celebration.open}
        onClose={celebration.close}
        ttvMs={celebration.ttvMs}
      />
    </div>
  );
}
