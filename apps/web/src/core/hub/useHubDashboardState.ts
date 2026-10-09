/**
 * Aggregated state hook for the Hub Dashboard (T1 decomposition).
 *
 * Extracts all `useState` / `useEffect` / `useMemo` / `useCallback` from
 * `HubDashboard` into a single hook so the container stays under 100 LOC.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getActiveModules,
  getActiveNudge,
  getModulesWithFirstAction,
  getOnboardingGoals,
  getVibePicks,
  hasSeenCrossModulePreview,
  isWithinChecklistWindow,
  pluralUa,
  recordLastActiveDate,
  shouldShowReengagement,
  type DashboardModuleId,
} from "@sergeant/shared";
import { openHubModule } from "@shared/lib/modules/hubNav";
import { useDashboardFocus } from "../insights/dashboardFocus";
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
import { isLocalOnlyBannerVisible } from "./localOnlyBannerVisibility";
import { hasAnyValueBar } from "./ValueProgressBar";
import { webKVStore } from "@shared/lib/storage/storage";
import { useHubStorageBump } from "./useHubStorageBump";
import { localStorageStore } from "./dashboard/dashboardStore";
import { useHubPref } from "../settings/hubPrefs";
import { useMondayAutoDigest } from "./dashboard/useMondayAutoDigest";
import type { User } from "./hub.types";

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
 * (`s.hasRealEntry && showInsights`) — обидва місця мають лишатись
 * синхронними, бо саме ця умова вирішує, чи варто взагалі бити запит до
 * `useCoachInsight` (денна AI-квота Free-плану, ADR-0085).
 */
export function shouldFetchCoachInsight(
  hasRealEntry: boolean,
  showInsights: boolean,
  insightsOpen: boolean,
): boolean {
  return hasRealEntry && showInsights && insightsOpen;
}

// ─────────────────────────────────────────────────────────────────────
// Main aggregated state
// ─────────────────────────────────────────────────────────────────────

export interface HubDashboardState {
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

  // Module rail / piles
  activeModules: readonly string[];
  /** Тік сховища — купа «Закрито» перераховується після запису в модулі. */
  storageBump: number;

  // Focus / Insights
  focus: ReturnType<typeof useDashboardFocus>["focus"];
  rest: ReturnType<typeof useDashboardFocus>["rest"];
  /** Усі активні рекомендації без відфільтрованих відкиданням (див. `useDashboardFocus`). */
  allRecs: ReturnType<typeof useDashboardFocus>["allRecs"];
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
  });
  const entryCount = useMemo(() => {
    // `storageBump` — тік запису в сховище: тіло його не читає, але без нього
    // лічильник не перечитався б після запису.
    void storageBump;
    return countRealEntries();
  }, [storageBump]);
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
  const { focus, rest, allRecs, dismiss } = focusProbe;

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

  // Той самий прапор, який `HubDashboard.tsx` читає для видимості
  // `HubInsightsBlock` (`showInsights`) — читаємо тут-таки, щоб не робити
  // мережевий запит/не палити AI-квоту заради поради, якої ніде не
  // показують (аудит PR-A1, канон hub-coach §6.2).
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  // AI-DANGER: `insightsOpen` — НЕ дублікат двох прапорців вище, і
  // прибрати його не можна.
  //
  // Два прапорці кажуть «блок змонтований», а він монтується ЗГОРНУТИМ:
  // `HubDashboard` передає `insightsDefaultOpen={false}` навмисно
  // (рішення «Тихо» — увесь розумний шум живе під згорнутим pill).
  // Тобто без цього терма порада генерувалась у КОЖНОГО, хто просто
  // відкрив хаб, і Free-користувач щодня платив частиною денної квоти
  // (5 запитів) за текст, якого на екрані немає — залишок аудиту PR-A1.
  //
  // Згорнутий підпис від цього не біднішає: він поради не показує
  // (`HubInsightsBlock.tsx` — третя гілка `collapsedSubtitle` віддає
  // `rest[0]?.title`), тож зникає лише блимання «Готую пораду Сержанта…».
  const coachInsightEnabled = shouldFetchCoachInsight(
    hasRealEntry,
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
    storageBump,
    focus,
    rest,
    allRecs,
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
