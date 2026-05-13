/**
 * Hero block for the Hub Dashboard (T1 decomposition).
 *
 * Single-hero rule: the onboarding resolver picks exactly one winner
 * (FirstAction, SoftAuth, or TodayFocus). Re-engagement overrides all.
 */

import { openHubModuleWithAction } from "@shared/lib/modules/hubNav";
import type { getOnboardingGoals } from "@sergeant/shared";
import { TodayFocusCard } from "../insights/TodayFocusCard";
import { SoftAuthPromptCard } from "../onboarding/SoftAuthPromptCard";
import { FirstActionHeroCard } from "../onboarding/FirstActionSheet";
import { CrossModulePreview } from "./CrossModulePreview";
import { ReEngagementCard } from "../onboarding/ReEngagementCard";
import { ModuleChecklist } from "../onboarding/ModuleChecklist";
import { OnboardingProgress } from "../onboarding/OnboardingProgress";
import { ValueProgressBar } from "./ValueProgressBar";
import { StreakIndicator } from "./dashboard/dashboardCards";
import type { DashboardModuleId, User } from "./hub.types";
import type { useOnboardingState } from "../onboarding/useOnboardingState";
import type { Rec } from "@sergeant/shared";

export interface HubHeroBlockProps {
  onOpenModule: (module: string) => void;
  onShowAuth: () => void;
  user: User | null;
  hasRealEntry: boolean;
  sessionDays: number;
  entryCount: number;
  onboardingState: ReturnType<typeof useOnboardingState>;
  reengagement: { show: boolean; daysInactive: number };
  dismissReengagement: () => void;
  crossModulePreviewSource: DashboardModuleId | null;
  dismissCrossModulePreview: () => void;
  focus: Rec | null;
  dismiss: (id: string) => void;
  primaryModule: "finyk" | "fizruk" | "routine" | "nutrition" | undefined;
  showChecklist: boolean;
  activeModules: readonly string[];
  goals: ReturnType<typeof getOnboardingGoals>;
  hasValueBar: boolean;
}

export function HubHeroBlock({
  onOpenModule,
  onShowAuth,
  hasRealEntry,
  sessionDays,
  entryCount,
  onboardingState,
  reengagement,
  dismissReengagement,
  crossModulePreviewSource,
  dismissCrossModulePreview,
  focus,
  dismiss,
  primaryModule,
  showChecklist,
  activeModules,
  goals,
  hasValueBar,
}: HubHeroBlockProps) {
  const reengagementIsHero = reengagement.show;

  let hero: React.ReactNode;
  if (onboardingState.showFirstAction) {
    hero = (
      <FirstActionHeroCard onDismiss={onboardingState.dismissFirstAction} />
    );
  } else if (onboardingState.showSoftAuth) {
    hero = (
      <SoftAuthPromptCard
        onOpenAuth={onShowAuth}
        onDismiss={onboardingState.dismissSoftAuth}
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

  if (reengagementIsHero) {
    return (
      <div className="space-y-4">
        <ReEngagementCard
          daysInactive={reengagement.daysInactive}
          onContinue={dismissReengagement}
          onDismiss={dismissReengagement}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!onboardingState.showFirstAction && !onboardingState.showSoftAuth && (
        <StreakIndicator />
      )}
      {hero}
      {showChecklist && primaryModule && (
        <ModuleChecklist
          moduleId={primaryModule}
          onAction={(action) => {
            openHubModuleWithAction(
              primaryModule as Parameters<typeof openHubModuleWithAction>[0],
              action as Parameters<typeof openHubModuleWithAction>[1],
            );
          }}
        />
      )}
      {!hasRealEntry &&
        (hasValueBar ? (
          <ValueProgressBar activeModules={activeModules} goals={goals} />
        ) : (
          <OnboardingProgress activeModules={activeModules} />
        ))}
      {hasRealEntry && crossModulePreviewSource && (
        <CrossModulePreview
          sourceModule={crossModulePreviewSource}
          onClose={dismissCrossModulePreview}
        />
      )}
    </div>
  );
}
