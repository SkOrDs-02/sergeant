/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Insights collapsible section for the Hub Dashboard (T1 decomposition).
 *
 * Merged «Підказки + Аналітика» under one wrapper per UX audit
 * «Dashboard card avalanche». Only renders post-first-entry.
 *
 * Під віссю дії (спека `hub-action-axis.md`) інсайти модулів і рекомендації
 * живуть у купі «Зараз» (`now/NowPile`); тут лишаються порада коуча,
 * nudge і звіт тижня.
 */

import { useEffect, useRef, useState } from "react";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { onHubBus } from "@shared/lib/modules/hubBus";
import { AssistantAdviceCard } from "../insights/AssistantAdviceCard";
import { LocalWeekReport } from "./LocalWeekReport";
import { useFinykWeekReport } from "../../modules/finyk/hooks/useFinykWeekReport";
import { DailyNudge } from "../onboarding/DailyNudge";
import { WeeklyDigestCard } from "../insights/WeeklyDigestCard";
import { WeeklyDigestFooter } from "./dashboard/dashboardCards";
import type { NudgeDefinition } from "@sergeant/shared";

/**
 * Ключ, під яким `CollapsibleSection` тримає розгорнутість секції.
 *
 * Експортується тому, що його читає ще й `HubDashboard` — щоб ПЕРШИЙ
 * рендер уже знав правду й не робив зайвого оновлення стану на маунті
 * (див. коментар там). Один константний рядок на обидва місця: якби
 * кожне мало свій літерал, вони розійшлись би мовчки.
 */
export const HUB_INSIGHTS_OPEN_STORAGE_KEY = "sergeant:hub.insights.open";

export interface HubInsightsBlockProps {
  insightsDefaultOpen: boolean;
  /**
   * Справжня розгорнутість секції, піднята в `HubDashboard`.
   *
   * Раніше цей стан жив тут і нікуди не виходив — через що `useCoachInsight`
   * у батьківському хуці не мав як дізнатися, що блок закритий, і палив
   * денну AI-квоту на пораду під згорнутим pill (аудит PR-A1).
   */
  insightsOpen: boolean;
  /** Стабільний setter із `useState` батька — вимога `CollapsibleSection`. */
  onInsightsOpenChange: (open: boolean) => void;
  coachLoading: boolean;
  coachError: string | null;
  coachInsightText: string | null;
  /**
   * `advice_id` поточної AI-поради (з `useCoachInsight`). Просто прокидається
   * вниз у `AssistantAdviceCard` — блок його не читає.
   */
  coachAdviceId?: string | null;
  coachRefresh: () => void;
  digestFresh: boolean;
  activeNudge: NudgeDefinition | null;
  reengagementShow: boolean;
  sessionDays: number;
  dismissNudge: () => void;
  digestExpanded: boolean;
  setDigestExpanded: (v: boolean) => void;
  showDigestFooter: boolean;
  /** Фінік серед активних модулів: без нього звіту тижня з грошей немає. */
  finykActive?: boolean | undefined;
}

export function HubInsightsBlock({
  insightsDefaultOpen,
  insightsOpen,
  onInsightsOpenChange,
  coachLoading,
  coachError,
  coachInsightText,
  coachAdviceId = null,
  coachRefresh,
  digestFresh,
  activeNudge,
  reengagementShow,
  sessionDays,
  dismissNudge,
  digestExpanded,
  setDigestExpanded,
  showDigestFooter,
  finykActive = true,
}: HubInsightsBlockProps) {
  // Р23: звіт тижня з локальних даних. Він не чекає мережі, тож і підпис
  // згорнутого блоку, поки AI-порада вантажиться чи недоступна, говорить
  // фактом, а не «Готую пораду Сержанта…».
  const weekReport = useFinykWeekReport(finykActive);
  const weekHeadline = weekReport[0];
  // «Відкрити звіт тижня» з картки про темп витрат: розгорнути блок і
  // підвести до рядків «Тиждень у цифрах» (рішення власника 2026-10-01). Блок
  // згорнутий за замовчуванням, тож без цього картка вела б повз нього.
  const weekReportRef = useRef<HTMLElement>(null);
  const [openSignal, setOpenSignal] = useState(0);
  useEffect(
    () => onHubBus("openWeekReport", () => setOpenSignal((n) => n + 1)),
    [],
  );
  // Реальний стан розгорнутості секції тепер живе в `HubDashboard`.
  // `CollapsibleSection` тримає дітей у DOM і згорнутою, тож він потрібен
  // тут, щоб AI-порада й дайджест не рахували показ, якого користувач не
  // бачив (подвійний collapse) — а ПІДНЯТИЙ він тому, що та сама відповідь
  // потрібна батьківському хуку, щоб не палити AI-квоту на пораду під
  // закритим акордеоном (PR-A1). Ініціалізація в батька — `false`, доки
  // `onOpenChange` не віддасть справжній стан із localStorage.

  return (
    <CollapsibleSection
      storageKey={HUB_INSIGHTS_OPEN_STORAGE_KEY}
      defaultOpen={insightsDefaultOpen}
      onOpenChange={onInsightsOpenChange}
      openSignal={openSignal}
      revealRef={weekReportRef}
      title="Порада й звіт тижня"
      collapsedIcon="sergeant"
      collapsedSubtitle={
        coachLoading
          ? (weekHeadline ?? "Готую пораду Сержанта…")
          : coachError
            ? // AI-порада недоступна (anon/quota/мережа). Не лякаємо
              // «збоєм» — показуємо звіт тижня, інакше спокійний нейтральний
              // підпис.
              (weekHeadline ?? "Порада Сержанта зараз недоступна")
            : // Інсайти й рекомендації живуть у купі «Зараз», тож підпис —
              // про те, що всередині.
              digestFresh
              ? "Порада Сержанта + свіжий звіт тижня"
              : activeNudge && !reengagementShow
                ? "Порада Сержанта + нагадування"
                : "Порада Сержанта на день"
      }
    >
      <AssistantAdviceCard
        insight={coachInsightText}
        loading={coachLoading}
        error={coachError}
        onRefresh={coachRefresh}
        adviceId={coachAdviceId}
        sectionOpen={insightsOpen}
      />
      {/* AI-порада над локальним звітом, не замість нього (Р23). */}
      <LocalWeekReport lines={weekReport} sectionRef={weekReportRef} />
      {activeNudge && !reengagementShow && (
        <DailyNudge
          nudge={activeNudge}
          sessionDays={sessionDays}
          onDismiss={dismissNudge}
        />
      )}
      {digestExpanded ? (
        <WeeklyDigestCard
          onCollapse={() => setDigestExpanded(false)}
          surface="hub_dashboard"
          sectionOpen={insightsOpen}
        />
      ) : showDigestFooter ? (
        <WeeklyDigestFooter
          fresh={digestFresh}
          onExpand={() => setDigestExpanded(true)}
        />
      ) : null}
    </CollapsibleSection>
  );
}
