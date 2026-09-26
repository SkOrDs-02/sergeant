/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useState } from "react";
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import { FirstEntryCelebrationModal } from "../onboarding/FirstEntryCelebrationModal";
import { MotivationalFooter, StaggerChild } from "./dashboard/dashboardCards";
import { HubHeroBlock } from "./HubHeroBlock";
import { HubModulesGrid } from "./HubModulesGrid";
import {
  HubInsightsBlock,
  HUB_INSIGHTS_OPEN_STORAGE_KEY,
} from "./HubInsightsBlock";
import { useHubDashboardState } from "./useHubDashboardState";
import { DENSITY_OUTER_SPACE, type HubDashboardProps } from "./hub.types";
import { PrivacyLockBanner } from "../security/PrivacyLockBanner";
import { useHubPref } from "../settings/hubPrefs";
import { safeReadLS } from "@shared/lib/storage/storage";
import { useAuthOptional } from "../auth/AuthContext";
import { ModuleRail } from "@shared/components/layout/ModuleRail";
import { NowPile } from "./now/NowPile";
import { ClosedTodayPile } from "./now/ClosedTodayPile";

export const DASHBOARD_MODULE_LABELS = SHARED_DASHBOARD_MODULE_LABELS;
export {
  loadDashboardOrder,
  saveDashboardOrder,
} from "./dashboard/dashboardStore";

export function HubDashboard({
  onOpenModule,
  user,
  onShowAuth,
}: HubDashboardProps) {
  // `useAuthOptional` (не `useAuth`) — поза `AuthProvider` він віддає `null`
  // замість кидати, тож тести, що монтують цей компонент без провайдера,
  // поводяться як раніше. Статус потрібен нижче за течією: без нього анонім
  // у вікні завантаження сесії не бачив НІ банера durability, НІ soft-auth
  // (ревʼю #1128) — розбір у `localOnlyBannerVisibility.ts`.
  const auth = useAuthOptional();
  // Розгорнутість блоку «Що зараз важливо» живе ТУТ, а не в самому блоці,
  // бо відповідь потрібна двом споживачам одразу: самому блоку (не рахувати
  // показ під згорнутим pill) і `useHubDashboardState` (не палити денну
  // AI-квоту на пораду, якої на екрані немає — аудит PR-A1).
  //
  // Читаємо ТОЙ САМИЙ ключ, що й `CollapsibleSection` усередині блоку, і
  // читаємо його в ініціалізаторі — навмисно.
  //
  // Перша версія стартувала з `false` і покладалась на те, що справжнє
  // значення прилетить ефектом секції. Це коштувало ЗАЙВОГО оновлення стану
  // одразу після монтування — тобто повного ре-рендеру дашборда на кожному
  // вході в хаб. Читання в ініціалізаторі знімає той прохід і, головне,
  // робить гейт AI-квоти нижче коректним уже на ПЕРШОМУ рендері, а не
  // тактом пізніше.
  //
  // AI-NOTE: правка зроблена ще й як гіпотеза на падіння
  // `tests/smoke/reduced-motion.spec.ts` (три `pulse` при бюджеті ≤2).
  // Доведено там небагато: `main` зелений, гілка червона, а reduce-шар
  // гасить анімацію за 100 мс — отже три «running» на 1.2 с означають три
  // щойно змонтовані скелетони. Що їх монтує саме цей зайвий прохід —
  // НЕ доведено: smoke-стек потребує Postgres, якого в середовищі не було,
  // тож локально відтворити не вдалось. Якщо тест упаде знову, шукай
  // причину деінде, а не повертай старий варіант: він гірший незалежно
  // від цього тесту.
  const [insightsOpen, setInsightsOpen] = useState(
    () => safeReadLS<boolean>(HUB_INSIGHTS_OPEN_STORAGE_KEY, false) ?? false,
  );
  const s = useHubDashboardState({
    onOpenModule,
    user,
    onShowAuth,
    insightsOpen,
    authStatus: auth?.status,
  });
  // C · Контроль: «Чистий режим» (toggle у HubHeader) ховає весь сигнальний
  // шар головної — лишаються лише модулі (+ hero для FTUX). Реактивно
  // оновлюється через спільний HUB_PREFS-стан.
  const [calmPref] = useHubPref<boolean>("calmMode", false);
  // Вісь дії (спека `hub-action-axis.md`): «Чистого режиму» під нею немає —
  // збережене значення ігнорується, kill-switch повертає його як було.
  const calmMode = s.axis ? false : calmPref;
  // C · Контроль (per-section visibility): постійне тонке налаштування з
  // Settings → Дашборд — на відміну від тимчасового «Чистого режиму», ці
  // прапори назавжди прибирають конкретні секції. Today-focus ховаємо лише
  // для досвідченого юзача; у FTUX hero — єдиний CTA, його не чіпаємо.
  const [showTodayFocusPref] = useHubPref<boolean>("showTodayFocus", true);
  // Купи під віссю не вимикаються — це і є головна.
  const showTodayFocus = s.axis ? true : showTodayFocusPref;
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  const [showMotivational] = useHubPref<boolean>("showMotivational", true);

  // A · Тихо (redesign 2026-06): для досвідченого юзача (hasRealEntry)
  // головна = пульт — модулі піднімаються над hero, а today-focus стає
  // другорядним під ними. Новачок у FTUX-вікні бачить hero-CTA першим, бо
  // там немає модульних даних і єдиний сигнал має бути дія. Виносимо обидва
  // блоки у змінні, щоб не дублювати довгі props-списки між гілками.
  const hero = (
    // Keep the hero in normal document flow. A transform changes paint
    // position without reserving the translated space, so when modules are
    // rendered first the focus card can slide over their bottom edge.
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
        nowPile={
          s.axis && s.hasRealEntry ? (
            <NowPile onOpenTarget={s.openInsightTarget} />
          ) : undefined
        }
      />
    </StaggerChild>
  );

  // Вісь дії: безумовний вхід у модуль — рейок під шапкою, той самий
  // компонент, що й перемикач усередині модулів. Неактивні модулі
  // приглушені, не сховані. Замінює сітку плиток цілком.
  const rail = (
    <StaggerChild index={0}>
      <ModuleRail
        active={null}
        source="module_rail"
        activeModules={s.activeModules}
      />
    </StaggerChild>
  );

  // Друга купа — одне твердження на активний модуль (`closedToday.ts`).
  const closedPile = (
    <StaggerChild index={2}>
      <ClosedTodayPile
        activeModules={s.activeModules}
        recs={s.focus ? [s.focus, ...s.rest] : s.rest}
        onOpenModule={onOpenModule}
        storageBump={s.storageBump}
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
      {s.axis ? (
        // Вісь дії: рейок → «Зараз» (у hero-слоті) → «Закрито сьогодні».
        // Новачок без запису бачить FTUX-hero і рейок; куп немає, доки
        // немає запису (рішення власника 2026-09-17).
        <>
          {rail}
          {hero}
          {s.hasRealEntry && closedPile}
        </>
      ) : s.hasRealEntry ? (
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
        <StaggerChild index={s.axis ? 3 : 2}>
          <HubInsightsBlock
            axis={s.axis}
            finykActive={s.activeModules.includes("finyk")}
            insightsDefaultOpen={false}
            insightsOpen={insightsOpen}
            onInsightsOpenChange={setInsightsOpen}
            coachLoading={s.coachLoading}
            coachError={s.coachError}
            coachInsightText={s.coachInsightText}
            coachAdviceId={s.coachAdviceId}
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
