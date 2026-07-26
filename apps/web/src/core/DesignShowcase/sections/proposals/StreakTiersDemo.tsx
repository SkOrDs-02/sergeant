import { useState } from "react";
import { PhoneFrame } from "./_PhoneFrame";

const TIERS = [
  { min: 0, label: "Старт", color: "148 163 184", glow: 0 }, // slate
  { min: 3, label: "Розгін", color: "251 191 36", glow: 0.25 }, // amber
  { min: 7, label: "Вогонь", color: "249 115 22", glow: 0.45 }, // orange
  { min: 30, label: "Легенда", color: "239 68 68", glow: 0.7 }, // red
];

function tierFor(days: number) {
  return TIERS.reduce((acc, t) => (days >= t.min ? t : acc), TIERS[0]!);
}

/**
 * R2-V-12 — Streak-flame градації.
 * Наявний StreakFlame має один вигляд. Тут колір/інтенсивність полумʼя росте
 * з довжиною серії (tier-візуал), даючи відчуття прогресії.
 */
export function StreakTiersDemo() {
  const [days, setDays] = useState(7);
  const t = tierFor(days);
  const size = 1 + Math.min(days, 40) / 60;

  return (
    <div className="flex flex-col gap-3">
      <PhoneFrame label={`Серія · ${t.label}`}>
        <div className="flex h-full flex-col items-center justify-center gap-5">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full"
            style={{
              background: `radial-gradient(circle, rgb(${t.color}/${t.glow}) 0%, transparent 70%)`,
            }}
          >
            <svg width="64" height="64" viewBox="0 0 24 24" style={{ transform: `scale(${size})` }}>
              <path
                d="M12 2c1 3-2 4-2 7a2 2 0 004 0c0-1 0-2 1-3 1 2 3 4 3 7a6 6 0 01-12 0c0-4 4-6 6-11z"
                fill={`rgb(${t.color})`}
              />
            </svg>
          </div>
          <p className="text-3xl font-semibold text-strong">
            {days} <span className="text-base font-normal text-muted">днів</span>
          </p>
        </div>
      </PhoneFrame>

      <input
        type="range"
        min={0}
        max={40}
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        className="w-full accent-[rgb(var(--c-accent-rgb))]"
        aria-label="Довжина серії"
      />
      <div className="flex justify-between text-2xs text-muted">
        {TIERS.map((tier) => (
          <span key={tier.label} style={{ color: days >= tier.min ? `rgb(${tier.color})` : undefined }}>
            {tier.min}д
          </span>
        ))}
      </div>
    </div>
  );
}
