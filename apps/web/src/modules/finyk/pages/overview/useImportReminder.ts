/**
 * Last validated: 2026-08-29
 * Status: Active
 *
 * Плашка «залий документи» — стан і рішення (спека
 * `docs/90-work/planning/specs/finyk-import-reminders.md`).
 *
 * AI-DANGER: годинник тут ВЛАСНИЙ, і це не стилістика. Умова плашки
 * («днів від останнього імпорту») росте від ЧАСУ, а не від даних: поки
 * людина нічого не заливає, жодна залежність React Query не змінюється.
 * Порахувати це один раз у `useMemo` по відповіді сервера означає, що на
 * довго відкритій вкладці (PWA тримають тижнями) плашка не зʼявиться
 * НІКОЛИ саме в сценарії, заради якого написана. Той самий баг уже був у
 * `useMonoStaleness` — його докстрінг описує розтин. Не прибирай тік.
 *
 * З тієї ж причини сервер віддає дати, а не вердикт: серверна відповідь
 * застаріває так само, як `useMemo`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@shared/api";
import { finykKeys } from "@shared/lib/api/queryKeys";
import { STORAGE_KEYS } from "@sergeant/shared";
import { FinykDomain } from "@sergeant/finyk-domain";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";
import {
  ANALYTICS_EVENTS,
  trackEvent,
} from "../../../../core/observability/analytics";

import { MONO_STALENESS_TICK_MS } from "./useMonoStaleness";

/** Той самий тік, що в staleness: поріг має добову гранулярність. */
export const IMPORT_REMINDER_TICK_MS = MONO_STALENESS_TICK_MS;

type Prefs = Record<
  string,
  | {
      snoozedUntil?: string;
      muted?: boolean;
      /**
       * День, коли `shown` уже відправлено для цього джерела (`YYYY-MM-DD`).
       * Огляд відкривають кілька разів на день, і без цієї позначки один і
       * той самий показ рахувався б п'ять разів — знаменник CTR роздувся б,
       * і фічу зняли б за критерієм, якого вона не проходила.
       *
       * Ключ рахується в UTC навмисно: для дедупу телеметрії зсув межі доби
       * на кілька годин не значить нічого, а тягнути сюди канонічні
       * day-key-хелпери іншого модуля — значить платити за точність, яка
       * тут не потрібна.
       */
      shownDay?: string;
    }
  | undefined
>;

function readPrefs(): Prefs {
  return safeReadLS<Prefs>(STORAGE_KEYS.FINYK_IMPORT_REMINDER, {}) ?? {};
}

export interface UseImportReminderInput {
  /**
   * Чи взагалі питати сервер. `false` для незалогіненого користувача:
   * `import_batches` серверна, історії в нього немає за визначенням, і
   * запит повернув би 401.
   */
  readonly enabled: boolean;
  /** Відкритий аркуш імпорту — мовчимо, він і так у роботі. */
  readonly hasOpenDraft?: boolean | undefined;
  /** Перевизначення інтервалу тіку — лише для тестів. */
  readonly tickMs?: number | undefined;
}

export interface UseImportReminderResult {
  readonly reminder: FinykDomain.ImportReminder | null;
  /** «Пізніше»: ховає на половину звичного інтервалу. */
  readonly snooze: () => void;
  /** «Не нагадувати»: назавжди, знімається лише руками. */
  readonly mute: () => void;
}

export function useImportReminder(
  input: UseImportReminderInput,
): UseImportReminderResult {
  const { enabled, hasOpenDraft } = input;
  const tickMs = input.tickMs ?? IMPORT_REMINDER_TICK_MS;

  const { data } = useQuery({
    queryKey: finykKeys.importRecent(),
    queryFn: ({ signal }) => apiClient.finyk.getRecentImports({ signal }),
    enabled,
    // Історія імпортів міняється лише коли людина щось залила, а той шлях
    // інвалідує ключ сам. Годину тримаємо, щоб не бити ендпоінт на кожен
    // вхід в Огляд.
    staleTime: 60 * 60 * 1000,
  });

  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), tickMs);
    return () => window.clearInterval(id);
  }, [tickMs]);

  const reminder = useMemo(() => {
    if (!data) return null;
    return FinykDomain.evaluateImportReminder({
      sources: data.sources,
      prefs,
      now: new Date(nowMs),
      ...(hasOpenDraft === undefined ? {} : { hasOpenDraft }),
    });
  }, [data, prefs, nowMs, hasOpenDraft]);

  /**
   * Мерджимо від СВІЖОГО читання сховища, а не від `prefs` у стані.
   * Позначку `shownDay` пише ефект нижче повз React (див. його коментар),
   * тож запис зі стану затер би її на першому ж «Пізніше».
   */
  const merge = useCallback((source: string, patch: Prefs[string]): Prefs => {
    const current = readPrefs();
    return {
      ...current,
      [source]: { ...current[source], ...patch },
    };
  }, []);

  const persist = useCallback((next: Prefs) => {
    safeWriteLS(STORAGE_KEYS.FINYK_IMPORT_REMINDER, next);
    setPrefs(next);
  }, []);

  const snooze = useCallback(() => {
    if (!reminder) return;
    trackEvent(ANALYTICS_EVENTS.FINYK_IMPORT_REMINDER_SNOOZED, {
      source: reminder.source,
      daysSince: reminder.daysSince,
    });
    persist(
      merge(reminder.source, {
        snoozedUntil: FinykDomain.importReminderSnoozeUntil(
          reminder.expectedIntervalDays,
          new Date(nowMs),
        ),
      }),
    );
  }, [reminder, nowMs, merge, persist]);

  const mute = useCallback(() => {
    if (!reminder) return;
    trackEvent(ANALYTICS_EVENTS.FINYK_IMPORT_REMINDER_MUTED, {
      source: reminder.source,
      daysSince: reminder.daysSince,
    });
    persist(merge(reminder.source, { muted: true }));
  }, [reminder, merge, persist]);

  // Дедуп події `shown` пише ПОВЗ React-стан: позначка «сьогодні вже
  // рахували» нікому не рендериться, тож проганяти її крізь `setPrefs`
  // означало б каскадний ререндер заради даних, які UI не читає (те саме,
  // на що лається `react-hooks/set-state-in-effect`). localStorage тут —
  // саме той зовнішній системний стан, який ефекти й мають синхронізувати.
  useEffect(() => {
    if (!reminder) return;
    const today = new Date(nowMs).toISOString().slice(0, 10);
    const stored = readPrefs();
    if (stored[reminder.source]?.shownDay === today) return;

    trackEvent(ANALYTICS_EVENTS.FINYK_IMPORT_REMINDER_SHOWN, {
      source: reminder.source,
      daysSince: reminder.daysSince,
      expectedIntervalDays: reminder.expectedIntervalDays,
    });
    safeWriteLS(STORAGE_KEYS.FINYK_IMPORT_REMINDER, {
      ...stored,
      [reminder.source]: { ...stored[reminder.source], shownDay: today },
    });
  }, [reminder, nowMs]);

  return { reminder, snooze, mute };
}
