/**
 * Кроки онбордингу модуля як пункти осі «Зараз / Закрито» (redesign v3,
 * рішення власника 2026-10-09: чекліст-віджет знято, кроки стають рядками).
 *
 * Логіка перенесена з колишнього `ModuleChecklist`: крок зроблений рівно тоді,
 * коли це доводять дані (`useChecklistSignals`), і досягнення латчиться в
 * сховище назавжди (F3, 2026-09-11). Тап по рядку лише навігація. Дії
 * «сховати» більше немає: вісь одна на все, тож незроблені кроки стоять у
 * «Зараз», а зроблені переходять у «Закрито», поки триває вікно онбордингу.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { webKVStore } from "@shared/lib/storage/storage";
import { useToast } from "@shared/hooks/useToast";
import {
  MODULE_CHECKLISTS,
  getChecklistState,
  markChecklistStepDone,
  markChecklistSeen,
  resolveChecklistStepsFromState,
  type DashboardModuleId,
  type ResolvedChecklistStep,
} from "@sergeant/shared";
import { ANALYTICS_EVENTS, trackEvent } from "../../observability/analytics";
import { useChecklistSignals } from "../../onboarding/useChecklistSignals";

export interface ChecklistNow {
  /** Незроблені кроки: рядки «Зараз». */
  open: ResolvedChecklistStep[];
  /** Зроблені кроки: рядки «Закрито». */
  done: ResolvedChecklistStep[];
}

const NONE: ChecklistNow = { open: [], done: [] };

/**
 * `moduleId` = `null`, коли вікно онбордингу закрите (`showChecklist` із
 * `useHubDashboardState`): хук тоді нічого не віддає й нічого не пише.
 */
export function useChecklistNow(
  moduleId: DashboardModuleId | null,
): ChecklistNow {
  const toast = useToast();
  // Сигнали рахуються завжди (правило хуків); без модуля - для finyk, але
  // результат нижче відкидається.
  const signals = useChecklistSignals(moduleId ?? "finyk");
  const [state, setState] = useState(() =>
    moduleId ? getChecklistState(webKVStore, moduleId) : null,
  );
  const [stateFor, setStateFor] = useState(moduleId);
  if (stateFor !== moduleId) {
    setStateFor(moduleId);
    setState(moduleId ? getChecklistState(webKVStore, moduleId) : null);
  }

  const def = moduleId ? MODULE_CHECKLISTS[moduleId] : null;
  const steps = useMemo(
    () =>
      def && state ? resolveChecklistStepsFromState(def, state, signals) : [],
    [def, state, signals],
  );
  const completed = steps.filter((s) => s.done).length;
  const total = steps.length;

  useEffect(() => {
    if (!moduleId) return;
    markChecklistSeen(webKVStore, moduleId);
    trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_SHOWN, { module: moduleId });
  }, [moduleId]);

  // Auto-latch (єдиний писач завершення): щойно живий сигнал доводить крок,
  // він записується назавжди. Обгортка в `Promise` - та сама ідіома, що була
  // в `ModuleChecklist` (правило `react-hooks/set-state-in-effect`).
  useEffect(() => {
    if (!moduleId || !def || !state) return;
    const newlyProven = def.steps.filter(
      (step) =>
        signals[step.id] === true && !state.completedSteps.includes(step.id),
    );
    if (newlyProven.length === 0) return;
    void Promise.resolve().then(() => {
      let next = state;
      for (const step of newlyProven) {
        next = markChecklistStepDone(webKVStore, moduleId, step.id);
      }
      setState(next);
      for (const step of newlyProven) {
        trackEvent(ANALYTICS_EVENTS.MODULE_CHECKLIST_STEP_DONE, {
          module: moduleId,
          stepId: step.id,
          completed,
          total,
        });
      }
    });
  }, [signals, state, def, moduleId, completed, total]);

  // Факт один раз на перехід у «все зроблено»; уже завершений на маунті
  // чекліст тосту не дає.
  const wasCompleteRef = useRef(total > 0 && completed >= total);
  useEffect(() => {
    const isComplete = total > 0 && completed >= total;
    if (isComplete && !wasCompleteRef.current && def) {
      toast.success(`${def.title}: перші кроки виконано`, 4000);
    }
    wasCompleteRef.current = isComplete;
  }, [completed, total, def, toast]);

  if (!moduleId) return NONE;
  return {
    open: steps.filter((s) => !s.done),
    done: steps.filter((s) => s.done),
  };
}
