/**
 * Hero block for the Hub Dashboard (T1 decomposition).
 *
 * Single-hero rule: the onboarding resolver picks exactly one winner
 * (FirstAction, SoftAuth, or TodayFocus). Re-engagement overrides all.
 */

import type { getOnboardingGoals } from "@sergeant/shared";
import { SoftAuthPromptCard } from "../onboarding/SoftAuthPromptCard";
import { FirstActionHeroCard } from "../onboarding/FirstActionSheet";
import { CrossModulePreview } from "./CrossModulePreview";
import { ReEngagementCard } from "../onboarding/ReEngagementCard";
import {
  ChecklistNowRows,
  type ChecklistNowProps,
} from "./now/ChecklistNowRows";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { coreMessages } from "@shared/i18n/uk.core";
import { OnboardingProgress } from "../onboarding/OnboardingProgress";
import { useFlag } from "../lib/featureFlags";
import { OutcomeCard } from "./OutcomeCard";
import { ValueProgressBar } from "./ValueProgressBar";
import { StreakIndicator } from "./dashboard/dashboardCards";
import type { DashboardModuleId } from "./hub.types";
import type { useOnboardingState } from "../onboarding/useOnboardingState";

export interface HubHeroBlockProps {
  onOpenModule: (module: string) => void;
  onShowAuth: () => void;
  hasRealEntry: boolean;
  sessionDays: number;
  entryCount: number;
  onboardingState: ReturnType<typeof useOnboardingState>;
  reengagement: { show: boolean; daysInactive: number };
  dismissReengagement: () => void;
  crossModulePreviewSource: DashboardModuleId | null;
  dismissCrossModulePreview: () => void;
  primaryModule: "finyk" | "fizruk" | "routine" | "nutrition" | undefined;
  /** Незроблені кроки онбордингу (рядки «Зараз»). */
  checklist?: ChecklistNowProps | undefined;
  activeModules: readonly string[];
  goals: ReturnType<typeof getOnboardingGoals>;
  hasValueBar: boolean;
  /**
   * Вісь дії (спека `hub-action-axis.md`): hero-слот займає купа «Зараз»
   * (`NowPile`). FirstAction / SoftAuth / re-engagement перемагають так
   * само; без них слот займає купа (redesign v3 зняв картку «Зараз»), а
   * `null` — коли новачку купі нема чого показати.
   */
  nowPile: React.ReactNode;
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
  primaryModule,
  checklist,
  activeModules,
  goals,
  hasValueBar,
  nowPile,
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
    hero = nowPile;
  }

  if (reengagementIsHero) {
    // AI-CONTEXT (H1, 2026-09-13): `ReEngagementCard` не бере участь у
    // бюджеті банерів (`bannerBudget.tsx`) — вона ЗАМІНЮЄ hero, а не
    // додається до сторінки, тож не має конкурувати за слоти з
    // `localOnlyData`/`privacyLock` над нею. Раніше конкурувала — і при
    // насиченому бюджеті рендерила `null`, лишаючи hero-смугу порожньою.
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
      {/* Кроки онбордингу живуть у купі «Зараз». Коли hero-слот зайняв
          інший герой (FTUX, soft-auth), вони стоять окремою секцією «Зараз». */}
      {checklist && (!nowPile || hero !== nowPile) && (
        <section aria-labelledby="checklist-now-heading" className="space-y-2">
          <SectionHeading as="h2" size="lg" id="checklist-now-heading">
            {coreMessages.hub.nowPile.heading}
          </SectionHeading>
          <ul
            data-testid="checklist-now"
            className="divide-y divide-line border-y border-line"
          >
            <ChecklistNowRows {...checklist} />
          </ul>
        </section>
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
