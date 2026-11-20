import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { STORAGE_KEYS, deviceDayKey } from "@sergeant/shared";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import { useHubPref, HUB_PREF_MONDAY_AUTO } from "../../settings/hubPrefs";
import {
  getWeekKey,
  loadDigest,
  useWeeklyDigest,
} from "../../insights/useWeeklyDigest";
import {
  adoptServerDigest,
  readServerDigest,
} from "../../insights/digestServerCopy";

interface AutoAttemptMarker {
  weekKey: string;
  dayKey: string;
}

/** Чи вже отримали сьогодні `INSUFFICIENT_DATA` за цей тиждень. */
function refusedToday(weekKey: string, dayKey: string): boolean {
  const m = safeReadLS<AutoAttemptMarker>(
    STORAGE_KEYS.WEEKLY_DIGEST_AUTO_ATTEMPT,
  );
  return m?.weekKey === weekKey && m.dayKey === dayKey;
}

/**
 * Auto-generates the weekly digest for the WEEK THAT JUST ENDED on the
 * first hub open of the following week — Monday or, if the hub wasn't
 * opened on Monday, any later day up to Sunday (С-3 (а), рішення власника
 * 2026-11-18, OD-30). Людина звіт і далі не замовляє (рішення 2026-09-03):
 * це та сама автогенерація, лише вікно не один день, а тиждень. Назву
 * хука збережено заради call-site-ів і тестів.
 *
 * Межа тижня та сама, що й раніше: `getWeekKey(now − 7 днів)` для БУДЬ-якого
 * дня тижня дає понеділок минулого ISO-тижня (device-local, ADR-0078).
 *
 * Запобіжники: тумблер (opt-out), вхід (`signedIn`: роут дайджесту за
 * `requireSession()`, тож гостю запит дав би лише 401), наявний звіт за
 * тиждень у сховищі пристрою (`loadDigest`, до і після читання сервера),
 * одна спроба на монтування (`firedRef`), гейт достатності даних і
 * rate-limit на сервері. Звіт поза AI-квотою (рішення 2026-08-30), тариф
 * його не гейтить.
 *
 * «Звіту немає» означає «немає ніде», а не лише на цьому пристрої: перед
 * генерацією хук читає серверну копію (памʼять коуча, `digestServerCopy.ts`)
 * і, якщо звіт за тиждень там є, кладе його на пристрій без виклику моделі.
 * Помилка чи таймаут читання = цей прохід пропускається без генерації:
 * генерувати наосліп після збою читання означало б дубль саме тоді, коли
 * сервер про звіт знає, а наступне відкриття хаба спробує знову.
 *
 * Після `INSUFFICIENT_DATA` пишеться маркер `{ weekKey, dayKey }` (день
 * пристрою, ADR-0078), і того самого дня хук не шле ні читання, ні
 * генерації. Наступного дня спроба дозволена: дані минулого тижня можуть
 * доїхати синком з іншого пристрою. Успіх і збій мережі маркер не ставлять.
 *
 * Історія: до 2026-08-30 хук брав `getWeekKey(now)` — для понеділка це
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
export function useMondayAutoDigest({ signedIn }: { signedIn: boolean }) {
  // Тиждень, що завершився вчора (неділею): понеділок now мінус 7 днів.
  // Lazy-ініціалізатор useState — санкціоноване місце для одноразового
  // читання годинника (react-hooks/purity забороняє Date.now() у тілі
  // рендера). Перетин півночі Нд→Пн під час відкритої вкладки ловить не
  // цей ключ, а firedRef + повторний loadDigest у таймері.
  const [previousWeekKey] = useState(() =>
    getWeekKey(new Date(Date.now() - 7 * 86_400_000)),
  );
  const { autoGenerate } = useWeeklyDigest(previousWeekKey);
  const queryClient = useQueryClient();
  const firedRef = useRef(false);
  // Прапорець переїхав у мішок `hub_prefs_v1` разом із рештою хабових
  // налаштувань (залишок PR-S13), тож тепер він ще й спільний між
  // пристроями. Дефолт ON зберігся: відсутність ключа = увімкнено.
  const [mondayAuto] = useHubPref<boolean>(HUB_PREF_MONDAY_AUTO, true);

  useEffect(() => {
    if (!mondayAuto) return;
    // Гостю не шлемо: сервер однаково відповів би 401. Сесія, що
    // довантажилась пізніше, перезапускає ефект (`signedIn` у залежностях).
    if (!signedIn) return;
    // Гейту «лише понеділок» більше немає (С-3 (а)): `previousWeekKey`
    // уже вказує на завершений тиждень у будь-який день поточного.

    if (loadDigest(previousWeekKey)) return;
    if (firedRef.current) return;
    firedRef.current = true;

    let cancelled = false;
    const run = async () => {
      if (loadDigest(previousWeekKey)) return;
      const dayKey = deviceDayKey(new Date());
      if (refusedToday(previousWeekKey, dayKey)) return;

      let serverDigest;
      try {
        serverDigest = await readServerDigest(queryClient, previousWeekKey);
      } catch {
        return; // збій читання: пропускаємо прохід, див. докстрінг
      }
      if (cancelled || loadDigest(previousWeekKey)) return;
      if (serverDigest) {
        adoptServerDigest(queryClient, serverDigest);
        return;
      }

      const outcome = await autoGenerate();
      if (outcome === "insufficient") {
        safeWriteLS(STORAGE_KEYS.WEEKLY_DIGEST_AUTO_ATTEMPT, {
          weekKey: previousWeekKey,
          dayKey,
        } satisfies AutoAttemptMarker);
      }
    };
    const timer = setTimeout(() => void run(), 3000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // `mondayAuto` у залежностях — не поступка лінтеру. Прапорець тепер
    // реактивний (мішок `hub_prefs_v1`), тож вимкнення ПІД ЧАС відліку
    // тригерить очищення і гасить таймер — раніше значення читалось один
    // раз усередині ефекту, і скасувати вже запущений відлік було нічим.
    // Зворотний бік: `firedRef` лишається піднятим, тож повторне
    // вмикання в тій же сесії відлік не переозброїть. Це навмисно —
    // консервативніше не згенерувати, ніж згенерувати попри відмову.
  }, [autoGenerate, previousWeekKey, mondayAuto, signedIn, queryClient]);
}
