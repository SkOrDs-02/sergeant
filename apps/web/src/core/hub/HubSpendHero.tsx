/**
 * Hero хаба «Витрати сьогодні» (redesign v3, H.2): тинт Фініка, число дня
 * 40 px, «₴ · ще N» до плану дня і лінія накопичених витрат від 06:00 до
 * 23:00 проти пунктиру плану. Єдина тинтована поверхня екрана.
 *
 * Дані: знімок quick-stats Фініка (`todaySpent`, `todayPoints`, `dayPlan`),
 * той самий, з якого читає панель модулів. План дня рахує писач Фініка
 * через `calculateSafeToSpendPerDay` на початок доби.
 *
 * Last validated: 2026-10-09
 * Status: Active
 */
import { useMemo, useState } from "react";
import { STORAGE_KEYS, formatNumberUk } from "@sergeant/shared";
import { Card } from "@shared/components/ui/Card";
import { safeReadStringLS } from "@shared/lib/storage/storage";
import { getKyivDateParts } from "@shared/lib/time/kyivTime";
import { coreMessages } from "@shared/i18n/uk.core";
import { cn } from "@shared/lib/ui/cn";
import { buildSpendLine, LINE_H, LINE_W } from "./spendHeroLine";

interface SpendSnapshot {
  todaySpent: number;
  dayPlan: number | null;
  todayPoints: Array<[number, number]>;
}

function readSnapshot(): SpendSnapshot | null {
  const raw = safeReadStringLS(STORAGE_KEYS.FINYK_QUICK_STATS);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as Partial<SpendSnapshot>;
    if (typeof s.todaySpent !== "number") return null;
    return {
      todaySpent: s.todaySpent,
      dayPlan: typeof s.dayPlan === "number" ? s.dayPlan : null,
      todayPoints: Array.isArray(s.todayPoints) ? s.todayPoints : [],
    };
  } catch {
    return null;
  }
}

const pad = (n: number) => String(n).padStart(2, "0");

export interface HubSpendHeroProps {
  /** Тік сховища з батька: перечитати знімок після запису у Фініку. */
  storageBump?: number | undefined;
}

export function HubSpendHero({ storageBump }: HubSpendHeroProps) {
  const t = coreMessages.hub.spendHero;
  // ponytail: «зараз» фіксується на монтуванні хаба; тік раз на хвилину
  // додати, якщо лінія має повзти, поки екран відкритий.
  const [mountedAt] = useState(() => Date.now());
  const view = useMemo(() => {
    void storageBump;
    const snap = readSnapshot();
    if (!snap) return null;
    const { hour, minute } = getKyivDateParts(mountedAt);
    const nowMinute = hour * 60 + minute;
    return {
      ...snap,
      nowLabel: `${pad(hour)}:${pad(minute)}`,
      line: buildSpendLine(snap.todayPoints, nowMinute, snap.dayPlan),
    };
  }, [storageBump, mountedAt]);

  if (!view) return null;
  const left = view.dayPlan === null ? null : view.dayPlan - view.todaySpent;

  return (
    <Card
      as="section"
      prominence="hero"
      tone="finyk"
      padding="none"
      aria-label={t.label}
      data-testid="hub-spend-hero"
      className="px-4 py-3.5"
    >
      <div className="flex items-baseline justify-between text-style-overline text-finyk-tint-label">
        <span>{t.label}</span>
        <span className="tnum">
          {view.dayPlan === null
            ? t.noPlan
            : `${t.plan} ${formatNumberUk(view.dayPlan)}`}
        </span>
      </div>
      <p className="mt-1.5 text-style-display tnum text-text">
        {formatNumberUk(view.todaySpent)}{" "}
        <span
          className={cn(
            "text-style-label-lg font-medium tracking-normal",
            left !== null && left < 0 ? "text-danger-strong" : "text-muted",
          )}
        >
          ₴
          {left !== null &&
            ` · ${left < 0 ? t.over : t.left} ${formatNumberUk(Math.abs(left))}`}
        </span>
      </p>
      <svg
        width="100%"
        height={LINE_H}
        viewBox={`0 0 ${LINE_W} ${LINE_H}`}
        preserveAspectRatio="none"
        aria-hidden
        className="mt-2.5 block"
      >
        {view.line.planY !== null && (
          <line
            x1={0}
            x2={LINE_W}
            y1={view.line.planY}
            y2={view.line.planY}
            className="stroke-finyk-tint-label"
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
        <path
          d={view.line.path}
          fill="none"
          className="stroke-chart-finyk"
          strokeWidth={2.5}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={view.line.now.x}
          cy={view.line.now.y}
          r={4}
          className="fill-chart-finyk"
        />
      </svg>
      <div className="mt-1 flex justify-between text-style-overline tnum text-finyk-tint-label">
        <span>06:00</span>
        <span className="text-text">{view.nowLabel}</span>
        <span>23:00</span>
      </div>
    </Card>
  );
}
