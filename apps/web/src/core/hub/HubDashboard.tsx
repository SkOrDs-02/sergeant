/**
 * Hub Dashboard — thin container (T1 decomposition, Sprint 6).
 *
 * Composes: HubHeroBlock, HubModulesGrid, HubInsightsBlock.
 * All state lives in `useHubDashboardState`.
 */

import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import { DemoModeBanner } from "../onboarding/DemoModeBanner";
import { CelebrationModal } from "../onboarding/CelebrationModal";
import { MotivationalFooter, StaggerChild } from "./dashboard/dashboardCards";
import { HubHeroBlock } from "./HubHeroBlock";
import { HubModulesGrid } from "./HubModulesGrid";
import { HubInsightsBlock } from "./HubInsightsBlock";
import { useHubDashboardState } from "./useHubDashboardState";
import { DENSITY_OUTER_SPACE, type HubDashboardProps } from "./hub.types";

export const DASHBOARD_MODULE_LABELS = SHARED_DASHBOARD_MODULE_LABELS;
export {
  loadDashboardOrder,
  saveDashboardOrder,
  resetDashboardOrder,
} from "./dashboard/dashboardStore";

export function HubDashboard({
  onOpenModule,
  user,
  onShowAuth,
}: HubDashboardProps) {
  const s = useHubDashboardState({ onOpenModule, user, onShowAuth });

  return (
    <div className={DENSITY_OUTER_SPACE[s.density]}>
      <DemoModeBanner />

      {/* GROUP 0 — Hero block */}
      <StaggerChild index={0}>
        <HubHeroBlock
          onOpenModule={onOpenModule}
          onShowAuth={onShowAuth}
          user={user}
          hasRealEntry={s.hasRealEntry}
          sessionDays={s.sessionDays}
          entryCount={s.entryCount}
          onboardingState={s.onboardingState}
          reengagement={s.reengagement}
          dismissReengagement={s.dismissReengagement}
          crossModulePreviewSource={s.crossModulePreviewSource}
          dismissCrossModulePreview={s.dismissCrossModulePreview}
          focus={s.focus}
          dismiss={s.dismiss}
          primaryModule={s.primaryModule}
          showChecklist={s.showChecklist}
          activeModules={s.activeModules}
          goals={s.goals}
          hasValueBar={s.hasValueBar}
        />
      </StaggerChild>

      {/* GROUP 1 — Module bento grid */}
      <StaggerChild index={1}>
        <HubModulesGrid
          density={s.density}
          hasRealEntry={s.hasRealEntry}
          editMode={s.editMode}
          toggleEditMode={s.toggleEditMode}
          displayOrder={s.displayOrder}
          sensors={s.sensors}
          handleDragStart={s.handleDragStart}
          handleDragEnd={s.handleDragEnd}
          onOpenModule={onOpenModule}
          quickAddByModule={s.quickAddByModule}
          activeModules={s.activeModules}
          adaptive={s.adaptive}
          hasInactive={s.hasInactive}
          hideInactive={s.hideInactive}
          toggleHideInactive={s.toggleHideInactive}
        />
      </StaggerChild>

      {/* GROUP 2 — Insights (post-first-entry) */}
      {s.hasRealEntry && (
        <StaggerChild index={2}>
          <HubInsightsBlock
            insightsDefaultOpen={s.insightsDefaultOpen}
            coachLoading={s.coachLoading}
            coachError={s.coachError}
            coachInsightText={s.coachInsightText}
            coachRefresh={s.coachRefresh}
            rest={s.rest}
            digestFresh={s.digestFresh}
            activeNudge={s.activeNudge}
            reengagementShow={s.reengagement.show}
            sessionDays={s.sessionDays}
            dismissNudge={s.dismissNudge}
            openInsightTarget={s.openInsightTarget}
            dismiss={s.dismiss}
            digestExpanded={s.digestExpanded}
            setDigestExpanded={s.setDigestExpanded}
            showDigestFooter={s.showDigestFooter}
          />
        </StaggerChild>
      )}

      <MotivationalFooter />

      <CelebrationModal
        open={s.celebration.open}
        onClose={s.celebration.close}
        ttvMs={s.celebration.ttvMs}
        moduleId={s.celebration.moduleId}
      />
    </div>
  );
}
