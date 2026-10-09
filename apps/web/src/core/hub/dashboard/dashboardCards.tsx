/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useEffect, useMemo } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { StreakBadge } from "@shared/components/ui/StreakFlame";
import { safeReadLS, safeReadStringLS } from "@shared/lib/storage/storage";
import {
  STORAGE_KEYS,
  TRACKED_STREAK_MILESTONES,
  claimStreakMilestone,
  pluralDays,
} from "@sergeant/shared";
import { webKVStore } from "@shared/lib/storage/storage";
import { ANALYTICS_EVENTS, trackEvent } from "../../observability/analytics";
import { getWeekRange } from "../../insights/useWeeklyDigest";
import { useHubStorageBump } from "../useHubStorageBump";

/**
 * Streak chip rendered above the hero card. Picks the longest active
 * streak across Routine and Fizruk (both must be ≥2 to render anything).
 *
 * Reads quick-stats from localStorage with a `safeReadLS` -> raw fallback
 * because legacy clients wrote bare JSON without our wrapper schema and
 * the safe wrapper would otherwise yield null and silently hide the chip.
 */
export function StreakIndicator() {
  // Re-read when any module emits storageUpdated (same-tab) or when the
  // native storage event fires (cross-tab). See useHubStorageBump.ts.
  const bump = useHubStorageBump();

  const streak = useMemo(() => {
    void bump; // storage-write tick — forces re-read of quick-stats shards
    const readLegacy = (key: string): Record<string, unknown> | null => {
      const raw = safeReadStringLS(key, null);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    };
    const routine =
      safeReadLS<Record<string, unknown>>(
        STORAGE_KEYS.ROUTINE_QUICK_STATS,
        null,
      ) || readLegacy("routine_quick_stats");

    // AI-DANGER: тільки ДЕННІ стріки. Фізрук навмисно НЕ в цьому списку —
    // його `streak` перейшов на тижні (`computeWeeklyStreakWeeks`), а і цей
    // бейдж, і `streak_milestone_reached` нижче міряють дні. Поки Фізрук
    // тут був, `Math.max` над різними одиницями брав 5 тижнів як «більше»
    // за 5 днів, і в аналітику летіло `days: 7` за сім ТИЖНІВ підряд —
    // мовчазне псування воронки (аудит L-8, 2026-08-07). Додавати сюди
    // модуль можна лише тоді, коли його стрік рахується в днях.
    const streaks = [{ days: Number(routine?.["streak"]) || 0 }]
      .filter((s) => s.days >= 2)
      .sort((a, b) => b.days - a.days);

    return streaks[0]?.days ?? 0;
  }, [bump]);

  // Detect streak-milestone crossings on the hub so the funnel sees
  // `streak_milestone_reached` from the dashboard render path.
  //
  // ЧОМУ ЦЕ БІЛЬШЕ НЕ РЕФ. Попередня редакція засівала `previousStreakRef`
  // поточним значенням на першому монтуванні — і на цьому детектор
  // структурно НЕ ПРАЦЮВАВ: чекін відбувається в модулі Рутини, тобто на
  // іншому маршруті, тож повернення на хаб — це нове монтування, реф
  // засівається вже перетнутим числом, і порівняння нічого не бачить.
  // Єдиний шлях, яким подія реально летіла, — чекін у СУСІДНІЙ вкладці
  // (крос-табовий `storageUpdated` без ремаунту). Практичний наслідок:
  // `streak_milestone_reached` у PostHog порожній не тому, що люди не
  // доходять до 7 днів (знахідка O1, 2026-09-13).
  //
  // `claimStreakMilestone` тримає зайняті віхи в сховищі ПРИСТРОЮ, тож
  // ремаунт їх не губить, а перший запуск засіває так само, як засівав реф.
  // Набір лишається широким (`TRACKED_STREAK_MILESTONES`, вісім порогів) —
  // він дає воронці роздільність, якої три святкові пороги не дають.
  // Scope окремий від святкування: людина бачить три віхи, аналітика міряє
  // вісім, і зведення їх в один scope зіпсувало б одне з двох.
  useEffect(() => {
    const crossed = claimStreakMilestone(
      webKVStore,
      "hub-analytics",
      streak,
      TRACKED_STREAK_MILESTONES,
    );
    if (crossed === null) return;
    trackEvent(ANALYTICS_EVENTS.STREAK_MILESTONE_REACHED, {
      days: crossed,
      // Keeping `type` on the payload lets PostHog segment by surface
      // without a payload-shape change to chase.
      type: "toast" as const,
    });
  }, [streak]);

  if (streak < 2) return null;

  return (
    <StreakBadge
      streak={streak}
      label={`${pluralDays(streak)} поспіль`}
      className="shadow-sm"
    />
  );
}

/**
 * Compact "Звіт тижня" footer shown when a digest is fresh OR on Mon/Tue.
 * Tapping it expands the full `WeeklyDigestCard` inline.
 */
export function WeeklyDigestFooter({
  onExpand,
  fresh,
}: {
  onExpand: () => void;
  fresh: boolean;
}) {
  const weekRange = getWeekRange();
  return (
    <button
      type="button"
      onClick={onExpand}
      // Без aria-label: він перекривав видимий текст разом із позначкою
      // «новий», тож свіжість звіту була лише візуальною.
      aria-expanded={false}
      className={cn(
        "w-full flex items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5 focus-ring",
        "shadow-card hover:shadow-float transition-[box-shadow,filter,opacity,transform]",
        "text-left",
      )}
    >
      <span
        className={cn(
          "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
          "bg-brand-soft",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-brand-strong"
          aria-hidden
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </span>
      <span className="flex-1 min-w-0 flex flex-col">
        <span className="flex items-center gap-1.5">
          <span className="text-style-label text-text">Звіт тижня</span>
          {fresh && (
            <>
              <span
                className="inline-block w-1.5 h-1.5 rounded-full bg-primary"
                aria-hidden
              />
              <span className="sr-only">, новий</span>
            </>
          )}
        </span>
        <span className="text-style-caption text-muted truncate">
          {weekRange}
        </span>
      </span>
      <Icon
        name="chevron-right"
        size="sm"
        strokeWidth={2.5}
        className="text-muted shrink-0"
      />
    </button>
  );
}
