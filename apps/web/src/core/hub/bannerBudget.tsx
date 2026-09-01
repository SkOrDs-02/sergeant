/**
 * Last validated: 2026-09-01
 * Status: Active
 */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Бюджет банерів хабу — не більше `max` підказок на екрані одночасно.
 *
 * AI-CONTEXT: анти-слоп аудит 2026-09-01 (F3) зняв перший екран хабу в
 * demo: пʼять банерів однієї анатомії поспіль (дані на пристрої → демо →
 * акаунт → блокування → nudge). Кожен окремо виправданий, разом — стек
 * підказок замість даних, і жоден не важливіший за сусідній. Рішення
 * власника: не нова форма, а стеля — два банери одночасно, решта чекає
 * своєї черги і зʼявляється, коли попередній закрито. Тригери самих банерів
 * не змінено: кожен і далі сам вирішує, чи хоче показатись; бюджет лише
 * відповідає, чи є для нього місце.
 *
 * Пріоритет — менше число = важливіше. Порядок зафіксовано тут, а не в
 * call-site-ах, щоб він читався одним списком:
 */
export const HUB_BANNER_PRIORITY = {
  /** Дані лише на цьому пристрої — попередження про втрату, завжди перше. */
  localOnlyData: 0,
  /** Демо-режим — шлях «Створити свій» має лишатись досяжним (founder). */
  demoMode: 1,
  /** Мʼякий заклик створити акаунт — конверсія. */
  softAuth: 2,
  /** Блокування застосунку — безпека, але після конверсії. */
  privacyLock: 3,
  /** Щоденний nudge. */
  dailyNudge: 4,
  /** Повернення після паузи. */
  reengagement: 5,
  /** Тизер «Що Sergeant покаже далі» після першого запису. */
  crossModulePreview: 6,
} as const;

export type HubBannerId = keyof typeof HUB_BANNER_PRIORITY;

interface BannerBudgetContextValue {
  register: (id: HubBannerId) => () => void;
  visibleIds: ReadonlySet<HubBannerId>;
}

const BannerBudgetContext = createContext<BannerBudgetContextValue | null>(
  null,
);

export const HUB_BANNER_BUDGET_DEFAULT = 2;

export function HubBannerBudgetProvider({
  max = HUB_BANNER_BUDGET_DEFAULT,
  children,
}: {
  max?: number;
  children: ReactNode;
}) {
  const [registered, setRegistered] = useState<ReadonlySet<HubBannerId>>(
    () => new Set(),
  );

  const register = useCallback((id: HubBannerId) => {
    setRegistered((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    return () => {
      setRegistered((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    };
  }, []);

  const visibleIds = useMemo<ReadonlySet<HubBannerId>>(() => {
    const sorted = [...registered].sort(
      (a, b) => HUB_BANNER_PRIORITY[a] - HUB_BANNER_PRIORITY[b],
    );
    return new Set(sorted.slice(0, Math.max(0, max)));
  }, [registered, max]);

  const value = useMemo(
    () => ({ register, visibleIds }),
    [register, visibleIds],
  );

  return (
    <BannerBudgetContext.Provider value={value}>
      {children}
    </BannerBudgetContext.Provider>
  );
}

/**
 * Банер викликає хук ПІСЛЯ власних перевірок «чи хочу показатись»
 * (`wants`), і рендерить лише коли хук повернув `true`.
 *
 * Без провайдера (сторі, юніт-тести самого банера) — завжди `true`, тож
 * поведінка компонента поза хабом не змінюється.
 */
export function useHubBannerSlot(id: HubBannerId, wants = true): boolean {
  const ctx = useContext(BannerBudgetContext);
  const register = ctx?.register;

  // Layout-effect, не effect: реєстрація і перерахунок видимості мають
  // відбутись до першого кадру, інакше банери на мить блимають усі разом
  // і лише потім зайві ховаються.
  useLayoutEffect(() => {
    if (!register || !wants) return undefined;
    return register(id);
  }, [register, id, wants]);

  if (!ctx) return wants;
  return wants && ctx.visibleIds.has(id);
}
