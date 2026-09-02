import { useEffect, useRef } from "react";
import { anchoredTodayKey } from "../lib/dayAnchor";

/**
 * Викликає `onRollover(prevTodayKey)`, коли доба ПРИСТРОЮ змінилась, поки
 * компонент лишався змонтованим.
 *
 * AI-CONTEXT: без цього «сьогодні» в модулі роздвоювалось. `selectedDay`
 * замерзає в редюсері `useRoutineTimeState` на момент монтування, а
 * `todayKey` у `useRoutineDerivedData` рахується щоренду. Якщо застосунок
 * лишили відкритим через північ (типовий кейс PWA на телефоні), ці два
 * ключі розїжджаються на добу і `WeekDayStrip` малює одразу два маркери:
 * вчорашній день як обраний, сьогоднішній — як `isToday`.
 *
 * **Cutover 2026-09-01 (LOG-3, ADR-0078):** межа доби перемкнута з Kyiv на
 * годинник ПРИСТРОЮ — той самий анкер, що й `lib/dayAnchor.ts`
 * (`anchoredTodayKey`). До цієї дати таймер чекав київської півночі, тоді
 * як «сьогодні» вже й так було київським — узгоджено. Якби рушили лише
 * анкер і лишили тут `getKyivDayKey`, застосунок на пристрої поза Києвом
 * перегортав би екран на «завтра» в момент київської півночі, а не своєї
 * власної — саме той клас бага, що й LOG-3.
 *
 * Дві незалежні тригер-точки навмисно:
 *   1. `setTimeout` до найближчої опівночі пристрою — ловить перехід,
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

function msUntilDeviceMidnight(): number {
  // ADR-0078: межа доби routine — годинник ПРИСТРОЮ, не Києва; узгоджено з
  // `lib/dayAnchor.ts`.
  // eslint-disable-next-line no-restricted-syntax -- див. коментар вище
  const now = new Date();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- див. коментар вище
  const hours = now.getHours();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const minutes = now.getMinutes();
  // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- те саме
  const seconds = now.getSeconds();
  const elapsed = hours * 3600 + minutes * 60 + seconds;
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
    let lastKey = anchoredTodayKey();

    const check = () => {
      const key = anchoredTodayKey();
      if (key === lastKey) return;
      const prev = lastKey;
      lastKey = key;
      callbackRef.current(prev);
    };

    const schedule = () => {
      const delay = Math.min(
        Math.max(msUntilDeviceMidnight(), MIN_TICK_MS),
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
