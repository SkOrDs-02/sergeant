/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import { DemoModeBanner } from "../onboarding/DemoModeBanner";
import { FirstEntryCelebrationModal } from "../onboarding/FirstEntryCelebrationModal";
import { MotivationalFooter, StaggerChild } from "./dashboard/dashboardCards";
import { HubHeroBlock } from "./HubHeroBlock";
import { HubModulesGrid } from "./HubModulesGrid";
import { HubInsightsBlock } from "./HubInsightsBlock";
import { useHubDashboardState } from "./useHubDashboardState";
import { DENSITY_OUTER_SPACE, type HubDashboardProps } from "./hub.types";
import { PrivacyLockBanner } from "../security/PrivacyLockBanner";
import { useHubPref } from "../settings/hubPrefs";

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
  // C · Контроль: «Чистий режим» (toggle у HubHeader) ховає весь сигнальний
  // шар головної — лишаються лише модулі (+ hero для FTUX). Реактивно
  // оновлюється через спільний HUB_PREFS-стан.
  const [calmMode] = useHubPref<boolean>("calmMode", false);
  // C · Контроль (per-section visibility): постійне тонке налаштування з
  // Settings → Дашборд — на відміну від тимчасового «Чистого режиму», ці
  // прапори назавжди прибирають конкретні секції. Today-focus ховаємо лише
  // для досвідченого юзача; у FTUX hero — єдиний CTA, його не чіпаємо.
  const [showTodayFocus] = useHubPref<boolean>("showTodayFocus", true);
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  const [showMotivational] = useHubPref<boolean>("showMotivational", true);

  // A · Тихо (redesign 2026-06): для досвідченого юзача (hasRealEntry)
  // головна = пульт — модулі піднімаються над hero, а today-focus стає
  // другорядним під ними. Новачок у FTUX-вікні бачить hero-CTA першим, бо
  // там немає модульних даних і єдиний сигнал має бути дія. Виносимо обидва
  // блоки у змінні, щоб не дублювати довгі props-списки між гілками.
  const hero = (
    <StaggerChild index={s.hasRealEntry ? 1 : 0}>
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
  );

  const modules = (
    <StaggerChild index={s.hasRealEntry ? 0 : 1}>
      <HubModulesGrid
        density={s.density}
        editMode={s.editMode}
        toggleEditMode={s.toggleEditMode}
        displayOrder={s.displayOrder}
        sortableHandlers={s.sortableHandlers}
        onOpenModule={onOpenModule}
        activeModules={s.activeModules}
        adaptive={s.adaptive}
        hasInactive={s.hasInactive}
        hideInactive={s.hideInactive}
        toggleHideInactive={s.toggleHideInactive}
      />
    </StaggerChild>
  );

  return (
    <div className={DENSITY_OUTER_SPACE[s.density]}>
      <DemoModeBanner />

      {s.hasRealEntry ? (
        <>
          {modules}
          {showTodayFocus && hero}
        </>
      ) : (
        <>
          {hero}
          {modules}
        </>
      )}

      {/* G4 — App-lock soft-prompt. Self-hides via LS dismissal. Hidden
          entirely in calm mode. */}
      {!calmMode && <PrivacyLockBanner />}

      {/* GROUP 2 — Insights (post-first-entry). A · Тихо: завжди згорнуті
          за замовчуванням — увесь розумний шум (інсайти, AI-порада, nudge,
          дайджест) живе під одним згорнутим pill, який користувач розгортає
          на вимогу, а не зустрічає розгорнутим на кожному вході.
          C · Контроль: у «Чистому режимі» прибирається повністю. */}
      {s.hasRealEntry && !calmMode && showInsights && (
        <StaggerChild index={2}>
          <HubInsightsBlock
            insightsDefaultOpen={false}
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

      {!calmMode && showMotivational && <MotivationalFooter />}

      <FirstEntryCelebrationModal
        open={s.celebration.open}
        onClose={s.celebration.close}
        ttvMs={s.celebration.ttvMs}
        moduleId={s.celebration.moduleId}
      />
    </div>
  );
}
