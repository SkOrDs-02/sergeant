/**
 * Last validated: 2026-09-30
 * Status: Active
 *
 * Годинник для предиката банера «підключи банк».
 *
 * Раніше `now` фіксувався при монтуванні `FinykApp`: вкладка, відкрита довше
 * за 7 днів snooze, після повернення на Огляд без ремаунту банер не
 * показувала, бо предикат міряв від застарілого моменту. Тепер час
 * оцінки оновлюється при: поверненні на Огляд, `visibilitychange` на
 * visible і на рівно залишку snooze (одноразовий таймер, не інтервал).
 */
import { useEffect, useRef, useState } from "react";
import { BANK_BANNER_SNOOZE_DAYS } from "../components/NoBankBanner.visibility";

const SNOOZE_MS = BANK_BANNER_SNOOZE_DAYS * 24 * 60 * 60 * 1000;
/** `setTimeout` тримає затримку лише в межах int32; довші спрацювали б одразу. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function useBankBannerClock(
  page: string,
  dismissedAt: number | null,
): number {
  const [now, setNow] = useState(() => Date.now());

  // Повернення на Огляд. Перший запуск пропускаємо: `now` щойно взято в
  // ініціалізаторі, а зайвий ре-рендер на монтуванні нічого не дає. Оновлення
  // йде з таймера 0 мс, а не синхронно в ефекті: синхронний `setState` в
  // ефекті дає каскад ре-рендерів (`react-hooks/set-state-in-effect`).
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current === page) return;
    prevPageRef.current = page;
    if (page !== "overview") return;
    const id = setTimeout(() => setNow(Date.now()), 0);
    return () => clearTimeout(id);
  }, [page]);

  // Вкладка знову видима після довгого простою.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") setNow(Date.now());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  // Одноразовий таймер на момент закінчення snooze. Перезапускається після
  // кожного оновлення `now`, тож ранній спрацьовок (клемп int32) догонить.
  useEffect(() => {
    if (dismissedAt === null) return;
    const remaining = dismissedAt + SNOOZE_MS - Date.now();
    if (remaining <= 0) return;
    const id = setTimeout(
      () => setNow(Date.now()),
      Math.min(remaining, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(id);
  }, [dismissedAt, now]);

  return now;
}
