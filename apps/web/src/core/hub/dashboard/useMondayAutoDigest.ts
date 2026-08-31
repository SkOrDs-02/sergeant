import { useEffect, useRef, useState } from "react";
import { safeReadLS } from "@shared/lib/storage/storage";
import { STORAGE_KEYS } from "@sergeant/shared";
import {
  getWeekKey,
  loadDigest,
  useWeeklyDigest,
} from "../../insights/useWeeklyDigest";

/**
 * Auto-generates the weekly digest on Monday for the WEEK THAT JUST
 * ENDED. До 2026-08-30 хук брав `getWeekKey(now)` — для понеділка це
 * сам понеділок, тобто генерувався щойно-початий тиждень із ~нульовими
 * даними, і opt-in юзер отримував INSUFFICIENT_DATA замість звіту
 * (знахідка W1 ревʼю дайджесту).
 *
 * Default ON (opt-out через тумблер у налаштуваннях): дайджест виведено
 * з добової AI-квоти (рішення founder-а 2026-08-30), тож стара причина
 * дефолтного OFF («AI-виклик зʼїдається без запиту») більше не діє.
 * Відсутнє значення прапорця означає «увімкнено»; збережене «0» —
 * явний opt-out і поважається.
 *
 * Generation is deferred 3s so the dashboard finishes mounting before
 * the network/AI request kicks off.
 *
 * Idempotency: a mount-scoped ref blocks a second `generate()` call when
 * the `generate` callback identity flips at the Sunday→Monday midnight
 * transition (the original 2x LLM cost risk). A second `loadDigest`
 * check inside the timer mitigates cross-tab races. See
 * `docs/audits/2026-05-13-page-audit-02-hub-dashboard.md § F12`.
 */
export function useMondayAutoDigest() {
  // Тиждень, що завершився вчора (неділею): понеділок now мінус 7 днів.
  // Lazy-ініціалізатор useState — санкціоноване місце для одноразового
  // читання годинника (react-hooks/purity забороняє Date.now() у тілі
  // рендера). Перетин півночі Нд→Пн під час відкритої вкладки ловить не
  // цей ключ, а firedRef + повторний loadDigest у таймері.
  const [previousWeekKey] = useState(() =>
    getWeekKey(new Date(Date.now() - 7 * 86_400_000)),
  );
  const { generate } = useWeeklyDigest(previousWeekKey);
  const firedRef = useRef(false);

  useEffect(() => {
    const enabled =
      safeReadLS<string>(STORAGE_KEYS.WEEKLY_DIGEST_MONDAY_AUTO, "") !== "0";
    if (!enabled) return;

    const now = new Date();
    // Device-local weekday — той самий годинник, що й `getWeekKey`
    // (device-local, ADR-0078 §parity з mobile). Раніше гейт брав київський
    // weekday, а `weekKey` рахувався за пристроєм: у поясах на захід від
    // Києва понеділок за Києвом наставав РАНІШЕ понеділка за пристроєм, і
    // гейт спрацьовував на позаминулому `previousWeekKey` (audit
    // unification-modules §1.2).
    // eslint-disable-next-line sergeant-design/prefer-kyiv-time -- ADR-0078: matches getWeekKey's device-local clock, not a display/report value.
    const isMonday = now.getDay() === 1;
    if (!isMonday) return;

    if (loadDigest(previousWeekKey)) return;
    if (firedRef.current) return;
    firedRef.current = true;

    const timer = setTimeout(() => {
      if (loadDigest(previousWeekKey)) return;
      generate();
    }, 3000);
    return () => clearTimeout(timer);
  }, [generate, previousWeekKey]);
}
