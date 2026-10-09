/**
 * Last validated: 2026-08-03
 * Status: Active
 */
import { useState } from "react";
import { DASHBOARD_MODULE_LABELS as SHARED_DASHBOARD_MODULE_LABELS } from "@sergeant/shared";
import { FirstEntryCelebrationModal } from "../onboarding/FirstEntryCelebrationModal";
import { HubHeroBlock } from "./HubHeroBlock";
import {
  HubInsightsBlock,
  HUB_INSIGHTS_OPEN_STORAGE_KEY,
} from "./HubInsightsBlock";
import { useHubDashboardState } from "./useHubDashboardState";
import type { HubDashboardProps } from "./hub.types";
import { useHubPref } from "../settings/hubPrefs";
import { safeReadLS } from "@shared/lib/storage/storage";
import { useAuthOptional } from "../auth/AuthContext";
import { ModulePanel } from "./ModulePanel";
import { useChecklistNow } from "./now/useChecklistNow";
import { NowPile } from "./now/NowPile";
import { ClosedTodayPile } from "./now/ClosedTodayPile";

export const DASHBOARD_MODULE_LABELS = SHARED_DASHBOARD_MODULE_LABELS;

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
  const [showInsights] = useHubPref<boolean>("showInsights", true);
  const checklistModule =
    s.showChecklist && s.primaryModule ? s.primaryModule : null;
  const checklistSteps = useChecklistNow(checklistModule);
  const checklistOpen =
    checklistModule && checklistSteps.open.length > 0
      ? { moduleId: checklistModule, steps: checklistSteps.open }
      : undefined;
  const checklistDone =
    checklistModule && checklistSteps.done.length > 0
      ? { moduleId: checklistModule, steps: checklistSteps.done }
      : undefined;

  // Мова H (redesign v3): hero-слот («Зараз» або FTUX-hero) → панель
  // модулів → «Закрито». Блоки зʼявляються без stagger-анімації.
  return (
    <div className="space-y-7">
      <HubHeroBlock
        onOpenModule={onOpenModule}
        onShowAuth={onShowAuth}
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
        checklist={checklistOpen}
        activeModules={s.activeModules}
        goals={s.goals}
        hasValueBar={s.hasValueBar}
        nowPile={
          s.hasRealEntry ? (
            <NowPile
              onOpenTarget={s.openInsightTarget}
              checklist={checklistOpen}
            />
          ) : undefined
        }
      />

      <ModulePanel
        activeModules={s.activeModules}
        storageBump={s.storageBump}
      />

      {s.hasRealEntry && (
        <ClosedTodayPile
          activeModules={s.activeModules}
          // Усі активні рекомендації, не відфільтровані відкиданням: сховану
          // картку `budget_over_*` рядок Фініка все одно мусить враховувати.
          recs={s.allRecs}
          onOpenModule={onOpenModule}
          storageBump={s.storageBump}
          checklistDone={checklistDone}
        />
      )}

      {/* «Порада й тиждень» (post-first-entry), згорнутий за замовчуванням. */}
      {s.hasRealEntry && showInsights && (
        <HubInsightsBlock
          finykActive={s.activeModules.includes("finyk")}
          insightsDefaultOpen={false}
          insightsOpen={insightsOpen}
          onInsightsOpenChange={setInsightsOpen}
          coachLoading={s.coachLoading}
          coachError={s.coachError}
          coachInsightText={s.coachInsightText}
          coachAdviceId={s.coachAdviceId}
          coachRefresh={s.coachRefresh}
          digestFresh={s.digestFresh}
          activeNudge={s.activeNudge}
          reengagementShow={s.reengagement.show}
          sessionDays={s.sessionDays}
          dismissNudge={s.dismissNudge}
          digestExpanded={s.digestExpanded}
          setDigestExpanded={s.setDigestExpanded}
          showDigestFooter={s.showDigestFooter}
        />
      )}

      <FirstEntryCelebrationModal
        open={s.celebration.open}
        onClose={s.celebration.close}
        ttvMs={s.celebration.ttvMs}
        moduleId={s.celebration.moduleId}
      />
    </div>
  );
}
