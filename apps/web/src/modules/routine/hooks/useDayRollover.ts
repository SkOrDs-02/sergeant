import { useEffect, useRef } from "react";
import { getKyivDateParts, getKyivDayKey } from "@shared/lib/time/kyivTime";

/**
 * Викликає `onRollover(prevTodayKey)`, коли київська доба змінилась,
 * поки компонент лишався змонтованим.
 *
 * AI-CONTEXT: без цього «сьогодні» в модулі роздвоювалось. `selectedDay`
 * замерзає в редюсері `useRoutineTimeState` на момент монтування, а
 * `todayKey` у `useRoutineDerivedData` рахується щоренду. Якщо застосунок
 * лишили відкритим через північ (типовий кейс PWA на телефоні), ці два
 * ключі розїжджаються на добу і `WeekDayStrip` малює одразу два маркери:
 * вчорашній день як обраний, сьогоднішній — як `isToday`.
 *
 * Дві незалежні тригер-точки навмисно:
 *   1. `setTimeout` до найближчої київської півночі — ловить перехід,
 *      коли вкладка активна;
 *   2. `visibilitychange` / `focus` — iOS Safari присипляє таймери у
 *      фоновій вкладці, тож повернення до застосунку звіряє ключ ще раз.
 *
 * Крок таймера обрізаний згори годиною, щоб зміна системного годинника
 * чи довгий сон пристрою не лишали нас із протермінованим таймаутом.
 */
const MAX_TICK_MS = 60 * 60 * 1000;
const MIN_TICK_MS = 1_000;
const DAY_SECONDS = 24 * 60 * 60;

function msUntilKyivMidnight(): number {
  const { hour, minute, second } = getKyivDateParts();
  const elapsed = hour * 60 * 60 + minute * 60 + second;
  // +1 c, щоб прокинутись уже ПІСЛЯ межі, а не рівно на ній.
  return (DAY_SECONDS - elapsed) * 1000 + 1_000;
}

export function useDayRollover(
  onRollover: (prevTodayKey: string) => void,
): void {
  const callbackRef = useRef(onRollover);

  useEffect(() => {
    callbackRef.current = onRollover;
  }, [onRollover]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKey = getKyivDayKey();

    const check = () => {
      const key = getKyivDayKey();
      if (key === lastKey) return;
      const prev = lastKey;
      lastKey = key;
      callbackRef.current(prev);
    };

    const schedule = () => {
      const delay = Math.min(
        Math.max(msUntilKyivMidnight(), MIN_TICK_MS),
        MAX_TICK_MS,
      );
      timer = setTimeout(() => {
        check();
        schedule();
      }, delay);
    };

    schedule();
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
}
