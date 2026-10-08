/**
 * Last validated: 2026-09-13
 * Status: Active
 *
 * Поточний день ПРИСТРОЮ (`YYYY-MM-DD`, ADR-0078), що оновлюється сам на
 * межі доби.
 *
 * НАВІЩО. `useMemo`, який читає `deviceDayKey()` усередині, не має дня у
 * залежностях — тож компонент, змонтований через північ без інших змін,
 * рахує вчорашнє вікно. Хук дає значення, яке можна поставити в
 * залежності, і memo перерахується рівно тоді, коли день справді
 * змінився.
 *
 * AI-DANGER: сам по собі `setTimeout` цю задачу НЕ вирішує, і саме тут
 * наївний фікс виглядав би робочим. Sergeant — PWA: на заблокованому
 * телефоні вкладку заморожують, таймери не спрацьовують, а людина
 * відкриває застосунок уранці й бачить учорашнє вікно — тобто рівно той
 * сценарій, заради якого хук і потрібен. Тому межа доби ловиться ДВІЧІ:
 * таймером (вкладка жива) і `visibilitychange` (вкладку розбудили).
 * Прибереш друге — лишиться фікс, який не працює саме там, де болить.
 *
 * Значення стабільне в межах доби, тож зайвих ререндерів немає:
 * `setDayKey` з тим самим рядком React ігнорує.
 */
import { useCallback, useEffect, useState } from "react";
import { deviceDayKey } from "@sergeant/shared";

/** Скільки чекати після півночі, щоб не влучити в межу за мілісекунду. */
const BOUNDARY_SLACK_MS = 1_000;

function msUntilNextDeviceMidnight(): number {
  const now = new Date();
  const next = new Date(now);
  // `setHours(24, …)` — канонічний спосіб дістати наступну північ за
  // МІСЦЕВИМ часом: він сам переносить дату й переживає перехід на
  // літній час, на відміну від додавання 86 400 000 мс.
  next.setHours(24, 0, 0, 0);
  return next.getTime() - now.getTime() + BOUNDARY_SLACK_MS;
}

/**
 * Те саме, що `useDeviceDayKey`, плюс `refresh` — синхронне «перечитай день
 * зараз». Потрібен тому, що таймер і `visibilitychange` не гарантовані
 * (ноутбук проспав ніч, Chromium не рахує час сну): код, який ПИШЕ запис
 * під ключем дня, читає годинник напряму, а екран тим часом ще показує
 * вчора. Викликаєш `refresh()` разом із записом — і екран перевертається
 * разом із ним, а не розходиться з тим, куди запис ліг.
 */
export function useDeviceDay(): { dayKey: string; refresh: () => void } {
  const [dayKey, setDayKey] = useState(() => deviceDayKey());
  const refresh = useCallback(() => {
    setDayKey(deviceDayKey());
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const sync = () => {
      setDayKey(deviceDayKey());
    };

    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        sync();
        schedule();
      }, msUntilNextDeviceMidnight());
    };

    // Вкладку розбудили — день міг змінитись, поки таймери стояли.
    // Переставляємо і таймер: до наступної півночі тепер інший інтервал.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      sync();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return { dayKey, refresh };
}

export function useDeviceDayKey(): string {
  return useDeviceDay().dayKey;
}
