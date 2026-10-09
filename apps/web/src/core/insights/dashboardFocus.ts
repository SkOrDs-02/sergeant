/**
 * Фокус дашборда: сховище закритих сьогодні рекомендацій і хук
 * `useDashboardFocus`. Картку «Зараз» (бокс зі смугою й «×») знято в
 * redesign v3: «Зараз» тепер купа рядків `core/hub/now/NowPile.tsx`.
 */
import { useCallback, useEffect, useState } from "react";
import { generateRecommendations } from "../lib/recommendationEngine";
import { useLocalStorageState } from "@shared/hooks/useLocalStorageState";
import {
  dismissalsOfToday,
  isDismissedToday,
} from "@shared/lib/insights/dismissedToday";

// Reuse the same dismissed-map key HubRecommendations used so the storage
// contract stays stable across the redesign. Значення — `ts` відкидання, і
// діє воно ДО КІНЦЯ ПОТОЧНОЇ ОСОБИСТОЇ ДОБИ (рішення власника 2026-10-01):
// старі записи без сьогоднішньої мітки прострочені. Експортується для
// `core/hub/now/useNowItems.ts`: об'єднаний список «Зараз» пише dismiss у
// ТЕ САМЕ сховище, а не заводить третє (спека `hub-action-axis.md`).
export const HUB_RECS_DISMISSED_KEY = "hub_recs_dismissed_v1";
const DISMISSED_KEY = HUB_RECS_DISMISSED_KEY;

// Підпис дії рядка «Зараз», коли rec не несе свого `pwaAction`: відкрити
// модуль (знахідний відмінок: «Відкрити Їжу»). Імперативну дію
// (`add_expense`, …) підписує `getModulePrimaryAction`.
export const MODULE_OPEN_CTA: Record<string, string> = {
  finyk: "Відкрити Фінік",
  fizruk: "Відкрити Фізрук",
  routine: "Відкрити Рутину",
  nutrition: "Відкрити Їжу",
  hub: "Подивитись",
};

/**
 * Hook that exposes the current dashboard focus (= top recommendation) plus
 * the rest of the visible recommendations, sharing dismiss state with the
 * unified insights panel.
 */
export function useDashboardFocus() {
  const [dismissed, setDismissed] = useLocalStorageState<
    Record<string, number>
  >(DISMISSED_KEY, {});
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const recs = generateRecommendations();

  // Без `useMemo`: `recs` — новий масив на кожен рендер (мемо нічого не
  // економило), а предикат залежить від поточної доби, якої в залежностях
  // немає, — застосунок, відкритий через північ, мусить повернути вчорашні
  // відкидання на найближчому рендері (тік раз на дві хвилини).
  const visible = recs.filter((r) => !isDismissedToday(dismissed[r.id]));

  const dismiss = useCallback(
    (id: string) => {
      // Заодно викидаємо прострочені id, щоб мапа не росла.
      setDismissed((prev) => ({
        ...dismissalsOfToday(prev),
        [id]: Date.now(),
      }));
    },
    [setDismissed],
  );

  return {
    focus: visible[0] || null,
    rest: visible.slice(1),
    /**
     * Усі активні рекомендації, НЕ відфільтровані відкиданням. Потрібні тому,
     * хто питає «чи активна ця ситуація», а не «що показати»: купа «Закрито
     * сьогодні» не має казати «перевищень немає», бо картку про перевищення
     * сховали.
     */
    allRecs: recs,
    dismiss,
  };
}
