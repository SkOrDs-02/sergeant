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
import { useFlag } from "../lib/featureFlags";
import { OutcomeCard } from "./OutcomeCard";
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
  user,
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
  const outcomeCardEnabled = useFlag("ftux_outcome_card_v1");

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
          accountCreatedAt={user?.createdAt ?? null}
          onAction={(action) => {
            // AI-DANGER: тут НЕ МОЖНА ставити відмітку «крок виконано».
            // Був саме такий рядок для `view_analytics`, і він брехав:
            // подія йде в `useAppEffects`, який передає далі лише
            // `module`, а не `action`, тож Фінік відкривається на
            // дефолтній сторінці (огляд), а `FinykApp` споживає з усіх
            // дій саму `add_expense`. Відмітка ж ставилась постійно —
            // тобто чекліст знову зараховував крок, якого не сталося,
            // рівно той дефект, що його F3 і закривав (знахідка рев'ю
            // до PR #1106). Тап — це чиста навігація; відмітку ставить
            // САМ екран аналітики на маунті
            // (`modules/finyk/pages/Analytics.tsx`).
            openHubModuleWithAction(
              primaryModule as Parameters<typeof openHubModuleWithAction>[0],
              action as Parameters<typeof openHubModuleWithAction>[1],
            );
          }}
        />
      )}
      {!hasRealEntry &&
        (outcomeCardEnabled ? (
          <OutcomeCard
            activeModules={activeModules}
            primaryModule={primaryModule}
            onOpenModule={onOpenModule}
          />
        ) : hasValueBar ? (
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
