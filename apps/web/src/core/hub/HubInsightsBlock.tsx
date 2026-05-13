/**
 * Insights collapsible section for the Hub Dashboard (T1 decomposition).
 *
 * Merged «Підказки + Аналітика» under one wrapper per UX audit
 * «Dashboard card avalanche». Only renders post-first-entry.
 */

import { CollapsibleSection } from "@shared/components/ui/CollapsibleSection";
import { AssistantAdviceCard } from "../insights/AssistantAdviceCard";
import { DailyNudge } from "../onboarding/DailyNudge";
import { HubInsightsPanel } from "./HubInsightsPanel";
import { WeeklyDigestCard } from "../insights/WeeklyDigestCard";
import { WeeklyDigestFooter } from "./dashboard/dashboardCards";
import type { Rec, NudgeDefinition } from "@sergeant/shared";
import { pluralize } from "./useHubDashboardState";

export interface HubInsightsBlockProps {
  insightsDefaultOpen: boolean;
  coachLoading: boolean;
  coachError: string | null;
  coachInsightText: string | null;
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
  coachLoading,
  coachError,
  coachInsightText,
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
  return (
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
                : activeNudge && !reengagementShow
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
        <WeeklyDigestCard onCollapse={() => setDigestExpanded(false)} />
      ) : showDigestFooter ? (
        <WeeklyDigestFooter
          fresh={digestFresh}
          onExpand={() => setDigestExpanded(true)}
        />
      ) : null}
    </CollapsibleSection>
  );
}
