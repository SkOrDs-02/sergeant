/**
 * Годинник пристрою проти сервера — датчик того, що аудит 2026-09-15 § 2
 * назвав «шляхом втрати даних зі зламаною спостережуваністю з обох кінців».
 *
 * Сервер перевіряє лише годинник, що ВИПЕРЕДЖАЄ (`CLOCK_SKEW_FORWARD_MS` у
 * `syncV2.ts`). Відсталий годинник — NTP-дрейф, довгий офлайн, виставлена
 * вручну дата — не перевіряється взагалі: LWW-гард порівнює
 * `existing.updated_at >= client_ts` на КЛІЄНТСЬКОМУ штампі, тож такий
 * пристрій програє кожен конфлікт. А `lww_conflict` на клієнті — benign:
 * без логу, без Sentry, без лічильника. Тобто дані не доїхали, а виглядає
 * це як штатний LWW.
 *
 * Два незалежні сигнали, кожен звітує один раз за сесію (Sentry не спам):
 *   1. `server_now` із відповіді push проти `Date.now()` — прямий замір
 *      зсуву; поріг 5 хв, бо мережева затримка — сотні мілісекунд, а
 *      NTP-дрейф, що ламає LWW, — хвилини й години.
 *   2. Серія `lww_conflict` поспіль без жодного успішного op-а — непрямий
 *      сигнал для серверів без `server_now`: штатний LWW програє точково,
 *      систематичний програш з одного пристрою — це годинник, не конфлікт.
 */

export const CLOCK_SKEW_WARN_MS = 5 * 60 * 1000;
export const LWW_CONFLICT_STREAK_WARN = 5;

export interface ClockSkewReport {
  readonly kind: "skew" | "lww_streak";
  /** `now - server_now`: додатне — пристрій випереджає, відʼємне — відстає. */
  readonly skewMs: number | null;
  readonly streak: number;
}

export interface ClockSkewMonitor {
  noteServerNow(serverNow: string | undefined): void;
  /** `null` — op застосовано; інакше — термінальна причина відхилення. */
  noteOutcome(reason: string | null): void;
  isSkewed(): boolean;
  skewMs(): number | null;
}

export function createClockSkewMonitor(deps: {
  readonly report: (report: ClockSkewReport) => void;
  readonly now?: () => number;
}): ClockSkewMonitor {
  const now = deps.now ?? (() => Date.now());
  let skewMs: number | null = null;
  let skewReported = false;
  let streak = 0;
  let streakReported = false;

  return {
    noteServerNow(serverNow) {
      if (!serverNow) return;
      const serverMs = Date.parse(serverNow);
      if (Number.isNaN(serverMs)) return;
      skewMs = now() - serverMs;
      if (Math.abs(skewMs) >= CLOCK_SKEW_WARN_MS && !skewReported) {
        skewReported = true;
        deps.report({ kind: "skew", skewMs, streak });
      }
    },
    noteOutcome(reason) {
      if (reason === "lww_conflict") {
        streak += 1;
        if (streak >= LWW_CONFLICT_STREAK_WARN && !streakReported) {
          streakReported = true;
          deps.report({ kind: "lww_streak", skewMs, streak });
        }
        return;
      }
      if (reason === null) streak = 0;
    },
    isSkewed() {
      return skewMs !== null && Math.abs(skewMs) >= CLOCK_SKEW_WARN_MS;
    },
    skewMs() {
      return skewMs;
    },
  };
}
