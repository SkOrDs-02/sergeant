import { useState } from "react";
import { ComparePair, MiniPhone } from "./_Compare";

const TIERS = [
  { min: 0, label: "Старт", color: "148 163 184", glow: 0 }, // slate
  { min: 3, label: "Розгін", color: "251 191 36", glow: 0.25 }, // amber
  { min: 7, label: "Вогонь", color: "249 115 22", glow: 0.45 }, // orange
  { min: 30, label: "Легенда", color: "239 68 68", glow: 0.7 }, // red
];

function tierFor(days: number) {
  return TIERS.reduce((acc, t) => (days >= t.min ? t : acc), TIERS[0]!);
}

const FLAME_PATH =
  "M12 2c1 3-2 4-2 7a2 2 0 004 0c0-1 0-2 1-3 1 2 3 4 3 7a6 6 0 01-12 0c0-4 4-6 6-11z";

/**
 * R2-V-12 — Streak-flame градації.
 *
 * Зараз: StreakFlame має один вигляд незалежно від довжини серії.
 * Може бути: колір та інтенсивність полумʼя ростуть tier-ами (Старт → Розгін
 * → Вогонь → Легенда), даючи відчуття прогресії.
 *
 * Тягни повзунок — ліворуч полумʼя незмінне, праворуч росте tier-ами.
 */
function Flame({ days, tiered }: { days: number; tiered: boolean }) {
  const t = tiered ? tierFor(days) : TIERS[2]!; // fixed "Вогонь" look when not tiered
  const size = tiered ? 1 + Math.min(days, 40) / 60 : 1.1;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5">
      <div
        className="flex h-28 w-28 items-center justify-center rounded-full"
        style={{
          background: `radial-gradient(circle, rgb(${t.color}/${tiered ? t.glow : 0.3}) 0%, transparent 70%)`,
        }}
      >
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          style={{ transform: `scale(${size})` }}
        >
          <path d={FLAME_PATH} fill={`rgb(${t.color})`} />
        </svg>
      </div>
      <p className="text-3xl font-semibold text-text">
        {days} <span className="text-base font-normal text-muted">днів</span>
      </p>
      <p className="text-2xs text-muted">
        {tiered ? t.label : "Завжди однаково"}
      </p>
    </div>
  );
}

export function StreakTiersDemo() {
  const [days, setDays] = useState(7);

  return (
    <div className="flex flex-col items-center gap-4">
      <ComparePair
        before={
          <MiniPhone dim>
            <Flame days={days} tiered={false} />
          </MiniPhone>
        }
        after={
          <MiniPhone>
            <Flame days={days} tiered />
          </MiniPhone>
        }
      />
      <div className="w-full max-w-[280px]">
        <input
          type="range"
          min={0}
          max={40}
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="w-full accent-[rgb(var(--c-accent-rgb))]"
          aria-label="Довжина серії"
        />
        <div className="flex justify-between text-2xs text-muted mt-1">
          {TIERS.map((tier) => (
            <span
              key={tier.label}
              style={{
                color: days >= tier.min ? `rgb(${tier.color})` : undefined,
              }}
            >
              {tier.min}д
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
