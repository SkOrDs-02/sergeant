/**
 * Hero block for the Hub Dashboard (T1 decomposition).
 *
 * Single-hero rule: the onboarding resolver picks exactly one winner
 * (FirstAction or TodayFocus). Re-engagement overrides all. SoftAuth hero
 * знято 2026-11-17: його текст несе `LocalOnlyDataBanner`.
 */

import type { getOnboardingGoals } from "@sergeant/shared";
import { FirstActionHeroCard } from "../onboarding/FirstActionSheet";
import { CrossModulePreview } from "./CrossModulePreview";
import { ReEngagementCard } from "../onboarding/ReEngagementCard";
import {
  ChecklistNowRows,
  type ChecklistNowProps,
} from "./now/ChecklistNowRows";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { coreMessages } from "@shared/i18n/uk.core";
import { useFlag } from "../lib/featureFlags";
import { OutcomeCard } from "./OutcomeCard";
import { ValueProgressBar } from "./ValueProgressBar";
import { NewcomerTimelineCard } from "./NewcomerTimelineCard";
import { BankHistoryFactsCard } from "./BankHistoryFactsCard";
import { StreakIndicator } from "./dashboard/dashboardCards";
import type { DashboardModuleId } from "./hub.types";
import type { useOnboardingState } from "../onboarding/useOnboardingState";

export interface HubHeroBlockProps {
  onOpenModule: (module: string) => void;
  hasRealEntry: boolean;
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
  /** Людина увійшла (Monobank і звіт тижня — лише з акаунтом). */
  signedIn: boolean;
  /**
   * Триває перший тиждень (`isWithinChecklistWindow`): лише тоді хаб
   * показує факти з історії банку (С-4 (б)).
   */
  inFirstWeek: boolean;
  /**
   * Вісь дії (спека `hub-action-axis.md`): hero-слот займає купа «Зараз»
   * (`NowPile`). FirstAction / re-engagement перемагають так
   * само; без них слот займає купа (redesign v3 зняв картку «Зараз»), а
   * `null` — коли новачку купі нема чого показати.
   */
  nowPile: React.ReactNode;
}

export function HubHeroBlock({
  onOpenModule,
  hasRealEntry,
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
  signedIn,
  inFirstWeek,
  nowPile,
}: HubHeroBlockProps) {
  const reengagementIsHero = reengagement.show;
  const outcomeCardEnabled = useFlag("ftux_outcome_card_v1");

  let hero: React.ReactNode;
  if (onboardingState.showFirstAction) {
    hero = (
      <FirstActionHeroCard onDismiss={onboardingState.dismissFirstAction} />
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
      {!onboardingState.showFirstAction && <StreakIndicator />}
      {hero}
      {/* Кроки онбордингу живуть у купі «Зараз». Коли hero-слот зайняв
          інший герой (FTUX), вони стоять окремою секцією «Зараз». */}
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
          // «Що зʼявиться і коли» на місці смуги «Модулів увімкнено: N з 4»
          // (П-20 (А)). Поки записів немає, спільних днів теж 0.
          <NewcomerTimelineCard
            activeModules={activeModules}
            signedIn={signedIn}
            sharedDays={0}
          />
        ))}
      <BankHistoryFactsCard
        enabled={signedIn && inFirstWeek && activeModules.includes("finyk")}
      />
      {hasRealEntry && crossModulePreviewSource && (
        <CrossModulePreview
          sourceModule={crossModulePreviewSource}
          onClose={dismissCrossModulePreview}
        />
      )}
    </div>
  );
}
