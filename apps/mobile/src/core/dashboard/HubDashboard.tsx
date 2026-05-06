/**
 * Sergeant Hub — top-level dashboard screen (mobile).
 *
 * Structure today (top → bottom):
 *   1. Greeting + today label + settings button (always visible).
 *   2. Hero slot with one-hero rule: `FirstActionHeroCard` >
 *      `SoftAuthPromptCard` > `TodayFocusCard`, mirroring
 *      `apps/web/src/core/hub/HubDashboard.tsx`.
 *   3. Status row stack (`DraggableDashboard`) with per-module
 *      quick-stats preview wired via `useModulePreviews`.
 *   4. `HubInsightsPanel` — collapsible secondary-recs block. Fed
 *      from `useDashboardFocus().rest` so dismissals share the
 *      same `hub_recs_dismissed_v1` map as the hero focus card.
 *   5. `WeeklyDigestFooter` — thin link to the weekly digest card,
 *      with a fresh-dot when the shared digest helper says the
 *      current digest is live.
 *
 * Scope notes:
 *   - Nutrition now renders in the Hub status stack alongside the other
 *     native module tabs.
 *   - `onShowAuth` navigates to the `(auth)/sign-in` modal via
 *     `router.push`. The `(auth)` group is presented as a modal in
 *     `app/_layout.tsx`; after successful sign-in the modal closes
 *     and `useUser` reactively updates the dashboard.
 *   - `useWeeklyDigest` + `useCoachInsight` (фаза 8) — після входу
 *     підтягують дайджест/інсайт; понеділкова автоген — лише для
 *     залогінених.
 */

import { router, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Settings, Sparkles } from "lucide-react-native";

import { colors } from "@/theme";

import { useUser } from "@sergeant/api-client/react";
import {
  getActiveModules,
  getFirstRealEntryModule,
  getHideInactiveModules,
  getOnboardingGoals,
  hasAnyValueProgressBar,
  hasSeenCrossModulePreview,
  isActiveModule,
  isFirstActionPending,
  isFirstRealEntryDone,
  isSoftAuthDismissed,
  setHideInactiveModules,
  type DashboardModuleId,
} from "@sergeant/shared";

import { CrossModulePreview } from "./CrossModulePreview";
import { DraggableDashboard } from "./DraggableDashboard";
import {
  DASHBOARD_MODULE_ROUTES,
  VISIBLE_DASHBOARD_MODULES,
} from "./dashboardModuleConfig";
import { FirstActionHeroCard } from "./FirstActionHeroCard";
import { HubInsightsPanel, type InsightItem } from "./HubInsightsPanel";
import { SoftAuthPromptCard } from "./SoftAuthPromptCard";
import { TodayFocusCard } from "./TodayFocusCard";
import { ValueProgressBar } from "./ValueProgressBar";
import { useDashboardFocus } from "./useDashboardFocus";
import { useDashboardOrder } from "./useDashboardOrder";
import { useModulePreviews } from "./useModulePreviews";
import { useCoachInsight } from "./useCoachInsight";
import { useMondayAutoDigest } from "./useMondayAutoDigest";
import { useWeeklyDigest } from "./useWeeklyDigest";
import { WeeklyDigestFooter } from "./WeeklyDigestFooter";
import { useHints } from "../hints/useHints";
import { mobileKVStore as mmkvStore } from "@/lib/storage";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";

/**
 * AssistantFab — floating action button with pulse glow animation.
 */
function AssistantFab({ onPress }: { onPress: () => void }) {
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const shadowOpacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Subtle pulse animation for the glow ring
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1.15,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseScale, {
            toValue: 1,
            duration: 0,
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    // Shadow breathing animation
    const shadowAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(shadowOpacity, {
          toValue: 0.6,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(shadowOpacity, {
          toValue: 0.3,
          duration: 1200,
          useNativeDriver: true,
        }),
      ]),
    );

    pulseAnimation.start();
    shadowAnimation.start();

    return () => {
      pulseAnimation.stop();
      shadowAnimation.stop();
    };
  }, [pulseScale, pulseOpacity, shadowOpacity]);

  return (
    <View
      style={{
        position: "absolute",
        right: 20,
        bottom: 24,
        pointerEvents: "box-none",
      }}
    >
      {/* Pulse glow ring */}
      <Animated.View
        style={{
          position: "absolute",
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 32,
          backgroundColor: colors.accent,
          opacity: pulseOpacity,
          transform: [{ scale: pulseScale }],
        }}
        pointerEvents="none"
      />
      {/* Shadow layer */}
      <Animated.View
        style={{
          position: "absolute",
          top: 2,
          left: 2,
          right: -2,
          bottom: -2,
          borderRadius: 28,
          backgroundColor: colors.accent,
          opacity: shadowOpacity,
        }}
        pointerEvents="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Відкрити AI-асистента"
        onPress={onPress}
        className="h-14 flex-row items-center gap-2 rounded-full bg-brand-700 pl-4 pr-5 shadow-xl active:scale-95 active:opacity-90"
        testID="dashboard-assistant-fab"
      >
        <Sparkles size={20} color="#fff" strokeWidth={2.2} />
        <Text className="text-sm font-semibold text-white">Асистент</Text>
      </Pressable>
    </View>
  );
}

function formatToday(now: Date): string {
  try {
    return now.toLocaleDateString("uk-UA", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  } catch {
    // Hermes without Intl (shouldn't happen on RN 0.76, but stay safe).
    return now.toDateString();
  }
}

function firstName(name: string | null | undefined): string {
  if (!name) return "друже";
  const trimmed = name.trim();
  if (!trimmed) return "друже";
  const [first] = trimmed.split(/\s+/);
  return first ?? trimmed;
}

export function HubDashboard() {
  const { data } = useUser();
  const signedIn = Boolean(data?.user);
  const greetingName = firstName(data?.user?.name);
  const todayLabel = useMemo(() => formatToday(new Date()), []);

  const { generate } = useWeeklyDigest();
  const { insight: coachInsightText } = useCoachInsight({
    enabled: signedIn,
  });
  const [refreshing, setRefreshing] = useState(false);

  // Active vs. inactive modules — driven by the user's onboarding
  // "vibe picks". Inactive modules render greyed-out (or hidden when
  // the user has flipped the `hideInactive` toggle below). Computed
  // before `useDashboardOrder` so the visibility filter can drop
  // inactive ids when the toggle is on.
  const activeModules = useMemo(() => getActiveModules(mmkvStore), []);
  const [hideInactive, setHideInactive] = useState(() =>
    getHideInactiveModules(mmkvStore),
  );
  const toggleHideInactive = useCallback(() => {
    setHideInactive((prev) => {
      const next = !prev;
      setHideInactiveModules(mmkvStore, next);
      return next;
    });
  }, []);
  const dashboardVisibleIds = useMemo(
    () =>
      hideInactive
        ? VISIBLE_DASHBOARD_MODULES.filter((id) =>
            isActiveModule(activeModules, id),
          )
        : VISIBLE_DASHBOARD_MODULES,
    [hideInactive, activeModules],
  );

  const { visibleOrder, reorderVisible } =
    useDashboardOrder(dashboardVisibleIds);
  const { focus, rest, dismiss: dismissFocus } = useDashboardFocus();
  const previews = useModulePreviews();

  const inactiveModuleSet = useMemo(
    () =>
      new Set<DashboardModuleId>(
        visibleOrder.filter((id) => !isActiveModule(activeModules, id)),
      ),
    [visibleOrder, activeModules],
  );
  const hasInactive = useMemo(
    () =>
      VISIBLE_DASHBOARD_MODULES.some(
        (id) => !isActiveModule(activeModules, id),
      ),
    [activeModules],
  );

  const runDigest = useCallback(() => {
    void generate();
  }, [generate]);

  useMondayAutoDigest({ generate: runDigest, enabled: signedIn });

  // Hero-layer visibility gates. Read synchronously on every render
  // (MMKV is sync + cheap) so CTAs that flip these flags trigger a
  // one-frame re-eval without needing an event bus. Local state
  // ticks re-run the reads after inline dismissals. Booleans are
  // computed inline rather than via useMemo — per AGENTS.md rule 5.3
  // the memo overhead outweighs a single sync MMKV read.
  const [heroTick, setHeroTick] = useState(0);
  // Reference heroTick so React re-runs these reads after a bump.
  void heroTick;
  const firstActionPending = isFirstActionPending(mmkvStore);
  const softAuthDismissed = isSoftAuthDismissed(mmkvStore);
  const hasFirstRealEntry = isFirstRealEntryDone(mmkvStore);
  useHints({
    store: mmkvStore,
    inFtuxSession: firstActionPending && !hasFirstRealEntry,
    hasFirstRealEntry,
  });

  // Cross-module preview (S6.4 mobile parity) — one-shot post-first-entry
  // promo. Source module is snapshotted at mount via
  // `getFirstRealEntryModule` so the copy stays paired with the
  // *triggering* surface even if a later entry flips the scan-order
  // winner. Mirrors the web HubDashboard render path exactly.
  const [crossModulePreviewSource, setCrossModulePreviewSource] =
    useState<DashboardModuleId | null>(() => {
      if (!hasFirstRealEntry) return null;
      if (hasSeenCrossModulePreview(mmkvStore)) return null;
      return getFirstRealEntryModule(mmkvStore);
    });
  const dismissCrossModulePreview = useCallback(
    () => setCrossModulePreviewSource(null),
    [],
  );

  const openModule = useCallback((id: DashboardModuleId) => {
    // `DASHBOARD_MODULE_ROUTES` holds validated Expo-Router hrefs. We
    // cast to `Href` so the router's typed-href helper accepts them
    // without materialising a union of every literal string.
    router.push(DASHBOARD_MODULE_ROUTES[id] as Href);
  }, []);

  const openSettings = useCallback(() => {
    router.push("/settings" as Href);
  }, []);

  const openAssistant = useCallback(() => {
    router.push("/assistant" as Href);
  }, []);

  const bumpHero = useCallback(() => setHeroTick((t) => t + 1), []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // `useModulePreviews` is fed by `useSyncExternalStore` over MMKV — it
    // re-renders automatically whenever the underlying quick-stats keys
    // change, so we only need to bump the hero tick to re-evaluate
    // FTUX/coach state. There's no imperative `refresh()` to call.
    try {
      bumpHero();
    } finally {
      setRefreshing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [bumpHero]);

  const handleShowAuth = useCallback(() => {
    router.push("/(auth)/sign-in" as Href);
  }, []);

  // Insights panel is fed the `rest` slice from the shared focus
  // selector. Dismissing a panel item goes through the same
  // `dismiss()` as the hero card, so both share the
  // `hub_recs_dismissed_v1` dismissal map.
  const insightItems = useMemo<readonly InsightItem[]>(
    () =>
      rest.map((rec): InsightItem => {
        // `rec.module` is the shared `RecModule` (includes "hub");
        // `InsightItem.action` only accepts real module ids, so the
        // "hub" bucket surfaces without an inline open affordance.
        const isDashboardModule = rec.module !== "hub";
        return {
          id: rec.id,
          title: rec.title,
          body: rec.body,
          icon: rec.icon,
          module: rec.module,
          ...(isDashboardModule
            ? { action: rec.module as DashboardModuleId }
            : {}),
        };
      }),
    [rest],
  );

  const handleInsightDismiss = useCallback(
    (id: string) => {
      dismissFocus(id);
    },
    [dismissFocus],
  );

  // One-hero rule: exactly one hero renders per frame, in priority
  // order. `firstActionVisible` tracks the FTUX flag; `showSoftAuth`
  // gates on the post-FTUX window (real entry exists, not dismissed,
  // user not signed in); everything else falls back to the focus
  // card (which itself renders an empty state when no rec is live).
  const firstActionVisible = firstActionPending;
  const showSoftAuth =
    !firstActionVisible && hasFirstRealEntry && !softAuthDismissed && !signedIn;

  return (
    <SafeAreaView className="flex-1 bg-bg dark:bg-bg" edges={["top", "bottom"]}>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 16, paddingBottom: 100, gap: 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressViewOffset={10}
          />
        }
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1 gap-1">
            <Text className="text-[26px] font-bold text-fg">
              Привіт, {greetingName}
            </Text>
            <Text
              accessibilityRole="text"
              className="text-sm text-fg-muted capitalize"
            >
              {todayLabel}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Відкрити налаштування"
            onPress={openSettings}
            className="h-10 w-10 items-center justify-center rounded-full bg-cream-100 active:opacity-70 active:scale-95"
            testID="dashboard-settings-button"
          >
            <Settings size={20} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </View>

        <View testID="dashboard-hero-slot">
          {firstActionVisible ? (
            <FirstActionHeroCard
              onAction={(id) => openModule(id)}
              onDismiss={bumpHero}
              onShown={({ primary, picks, primaryReason }) => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_SHOWN, {
                  picks,
                  primary,
                  primary_reason: primaryReason,
                });
              }}
              onPicked={({ module, via, primaryReason }) => {
                trackEvent(ANALYTICS_EVENTS.ONBOARDING_FIRST_ACTION_PICKED, {
                  module,
                  via,
                  primary_reason: primaryReason,
                });
              }}
            />
          ) : showSoftAuth ? (
            <SoftAuthPromptCard
              onOpenAuth={handleShowAuth}
              onDismiss={bumpHero}
              onShown={() => {
                trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_SHOWN, {
                  placement: "dashboard",
                });
              }}
              onAuthOpened={() => {
                trackEvent(ANALYTICS_EVENTS.AUTH_AFTER_VALUE);
              }}
              onDismissed={() => {
                trackEvent(ANALYTICS_EVENTS.AUTH_PROMPT_DISMISSED);
              }}
            />
          ) : (
            <TodayFocusCard
              focus={focus}
              coachInsight={coachInsightText}
              onAction={(_actionKey, rec) => {
                if ((rec.module as DashboardModuleId) !== undefined) {
                  openModule(rec.module as DashboardModuleId);
                }
              }}
              onDismiss={dismissFocus}
            />
          )}
        </View>

        {/* Value-promise bars (S3.3a + S3.3b mobile parity). Pre-FTUX
            only — reads back the budget / habit / weekly target the
            user spelled out in the wizard goals step so the empty hub
            carries explicit intent. The shared helper returns []
            when no active module has a goal, so we additionally
            guard the entire row to avoid an empty wrapper view. */}
        {!hasFirstRealEntry &&
        hasAnyValueProgressBar({
          activeModules,
          goals: getOnboardingGoals(mmkvStore),
        }) ? (
          <ValueProgressBar
            activeModules={activeModules}
            goals={getOnboardingGoals(mmkvStore)}
          />
        ) : null}

        {/* Cross-module preview (S6.4 mobile parity). One-shot
            post-first-entry promo — shown the frame the user crosses
            from FTUX into "real" usage. Persistence flag lives in
            shared (`hub_cross_module_preview_seen_v1`). Hidden once
            the user taps the CTA or X. */}
        {hasFirstRealEntry && crossModulePreviewSource ? (
          <CrossModulePreview
            sourceModule={crossModulePreviewSource}
            onClose={dismissCrossModulePreview}
          />
        ) : null}

        <View className="gap-2">
          <Text className="text-sm font-semibold text-fg-muted">Статус</Text>
          <DraggableDashboard
            modules={visibleOrder}
            onReorder={reorderVisible}
            onOpenModule={openModule}
            previews={previews}
            inactiveModules={inactiveModuleSet}
          />
          {hasInactive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                hideInactive
                  ? "Показати неактивні модулі"
                  : "Приховати неактивні модулі"
              }
              onPress={toggleHideInactive}
              className="mt-1 self-center px-2 py-1 active:opacity-70"
              testID="dashboard-toggle-hide-inactive"
            >
              <Text className="text-xs text-fg-muted underline">
                {hideInactive
                  ? "Показати неактивні модулі"
                  : "Приховати неактивні модулі"}
              </Text>
            </Pressable>
          ) : null}
          <Text className="mt-1 text-xs leading-relaxed text-fg-subtle">
            Утримай і потягни, щоб змінити порядок модулів. Порядок
            синхронізується з вебом.
          </Text>
        </View>

        <HubInsightsPanel
          items={insightItems}
          onOpenModule={openModule}
          onDismiss={handleInsightDismiss}
        />

        <WeeklyDigestFooter />
      </ScrollView>

      {/* Assistant FAB — thumb-reach entry to AI chat with pulse glow.
          Always visible so user can reach assistant from anywhere. */}
      <AssistantFab onPress={openAssistant} />
    </SafeAreaView>
  );
}
