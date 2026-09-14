/**
 * Last validated: 2026-05-19
 * Status: Active
 *
 * Insights collapsible section for the Hub Dashboard (T1 decomposition).
 *
 * Merged «Підказки + Аналітика» under one wrapper per UX audit
 * «Dashboard card avalanche». Only renders post-first-entry.
 *
 * Phase 5e: renders top 3 module insights (surface="hub") above the
 * AssistantAdviceCard via useAllInsights. Module surfaces continue
 * rendering their own insights locally via per-trigger hooks.
 */

import { useNavigate } from "react-router-dom";
import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { AssistantAdviceCard } from "../insights/AssistantAdviceCard";
import { DailyNudge } from "../onboarding/DailyNudge";
import { HubInsightsPanel } from "./HubInsightsPanel";
import { WeeklyDigestCard } from "../insights/WeeklyDigestCard";
import { WeeklyDigestFooter } from "./dashboard/dashboardCards";
import { InsightCard } from "@shared/components/ui/InsightCard";
import { useAllInsights } from "@shared/lib/insights/useAllInsights";
import { useAskAiQuotaExhausted } from "@shared/lib/insights/useAskAiQuota";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import type { Insight } from "@shared/lib/insights/types";
import type { Rec, NudgeDefinition } from "@sergeant/shared";

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
  rest: readonly Rec[];
  digestFresh: boolean;
  activeNudge: NudgeDefinition | null;
  reengagementShow: boolean;
  sessionDays: number;
  dismissNudge: () => void;
  openInsightTarget: (module: string, hash?: string) => void;
  dismiss: (id: string) => void;
  digestExpanded: boolean;
  setDigestExpanded: (v: boolean) => void;
  showDigestFooter: boolean;
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
  rest,
  digestFresh,
  activeNudge,
  reengagementShow,
  sessionDays,
  dismissNudge,
  openInsightTarget,
  dismiss,
  digestExpanded,
  setDigestExpanded,
  showDigestFooter,
}: HubInsightsBlockProps) {
  const navigate = useNavigate();
  const moduleInsights = useAllInsights({ surface: "hub", cap: 3 });
  const askAiDisabled = useAskAiQuotaExhausted();
  // Реальний стан розгорнутості секції тепер живе в `HubDashboard`.
  // `CollapsibleSection` тримає дітей у DOM і згорнутою, тож він потрібен
  // тут, щоб AI-порада й дайджест не рахували показ, якого користувач не
  // бачив (подвійний collapse) — а ПІДНЯТИЙ він тому, що та сама відповідь
  // потрібна батьківському хуку, щоб не палити AI-квоту на пораду під
  // закритим акордеоном (PR-A1). Ініціалізація в батька — `false`, доки
  // `onOpenChange` не віддасть справжній стан із localStorage.

  function handleInsightActivate(insight: Insight) {
    if (insight.action.type === "navigate") {
      navigate(insight.action.path);
    } else if (insight.action.type === "open-chat") {
      emitHubBus("openChat", {
        message: insight.action.prompt,
        autoSend: false,
      });
    } else if (insight.action.type === "callback") {
      insight.action.fn();
    }
  }

  function handleAskAi(insight: Insight) {
    emitHubBus("openChat", { message: insight.askAiPrompt, autoSend: false });
  }

  return (
    <CollapsibleSection
      storageKey={HUB_INSIGHTS_OPEN_STORAGE_KEY}
      defaultOpen={insightsDefaultOpen}
      onOpenChange={onInsightsOpenChange}
      title="Що зараз важливо"
      collapsedIcon="sergeant"
      collapsedSubtitle={
        coachLoading
          ? "Готую AI-пораду…"
          : coachError
            ? // AI-порада недоступна (anon/quota/мережа). Не лякаємо
              // «збоєм» — показуємо реальні інсайти, якщо є, інакше
              // спокійний нейтральний підпис.
              (rest[0]?.title ?? "Порада Сержанта зараз недоступна")
            : // Show first actionable insight title verbatim so the collapsed
              // pill carries real value instead of a generic count.
              (rest[0]?.title ??
              (digestFresh
                ? "Порада Сержанта + свіжий дайджест"
                : activeNudge && !reengagementShow
                  ? "Порада Сержанта + нагадування"
                  : "Порада Сержанта на день"))
      }
    >
      {moduleInsights.length > 0 && (
        <div className="space-y-1.5">
          {moduleInsights.map((insight) => (
            <InsightCard
              key={insight.id}
              id={insight.id}
              title={insight.title}
              subtitle={insight.subtitle}
              // Хаб — єдина поверхня, що не є модульним блоком. Без цього
              // пропа події `value_signal_*` з хабу поїхали б як
              // `surface: "module"` і зіпсували б розріз по поверхнях.
              surface="hub"
              onActivate={() => handleInsightActivate(insight)}
              onAskAi={() => handleAskAi(insight)}
              askAiDisabled={askAiDisabled}
            />
          ))}
        </div>
      )}
      <AssistantAdviceCard
        insight={coachInsightText}
        loading={coachLoading}
        error={coachError}
        onRefresh={coachRefresh}
        adviceId={coachAdviceId}
        sectionOpen={insightsOpen}
      />
      {activeNudge && !reengagementShow && (
        <DailyNudge
          nudge={activeNudge}
          sessionDays={sessionDays}
          onDismiss={dismissNudge}
        />
      )}
      <HubInsightsPanel
        items={rest as Rec[]}
        onOpenModule={openInsightTarget}
        onDismiss={dismiss}
      />
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
