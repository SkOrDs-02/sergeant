import { useState } from "react";
import { Spinner } from "@shared/components/ui/Spinner";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { AnimatedNumber } from "@shared/components/ui/AnimatedNumber";
import { StreakFlame } from "@shared/components/ui/StreakFlame";
import { Button } from "@shared/components/ui/Button";
import { Sec, Group } from "../_shared";

/**
 * Motion & Animation showcase — 3-tier motion budget:
 *
 *  Tier 1 — Ambient  : skeleton, spinner, pulse  (background states)
 *  Tier 2 — Response : slide, fade, scale         (user-triggered feedback)
 *  Tier 3 — Celebrate: streak, check, number, bar (milestone moments)
 *
 * Matches docs/design/design-system.md § 17 motion budget.
 * All animations are wrapped in motion-safe:* so they are suppressed for
 * users who have prefers-reduced-motion: reduce set.
 */

function AmbientTier() {
  return (
    <Group label="Tier 1 — Ambient (фонові стани)">
      <div className="space-y-4">
        {/* Pulse skeleton */}
        <div>
          <p className="text-xs text-muted mb-2">
            Skeleton pulse — <code>motion-safe:animate-pulse</code>
          </p>
          <div className="space-y-2 max-w-xs">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        {/* Shimmer skeleton */}
        <div>
          <p className="text-xs text-muted mb-2">
            Skeleton shimmer — <code>motion-safe:animate-shimmer</code>
          </p>
          <div className="space-y-2 max-w-xs">
            <Skeleton shimmer className="h-5 w-3/4" />
            <Skeleton shimmer className="h-4 w-full" />
            <Skeleton shimmer className="h-4 w-2/3" />
          </div>
        </div>

        {/* Spinner variants */}
        <div>
          <p className="text-xs text-muted mb-2">
            Spinner — <code>motion-safe:animate-spin</code>
          </p>
          <div className="flex items-center gap-4">
            <Spinner size="xs" className="text-muted" />
            <Spinner size="sm" className="text-muted" />
            <Spinner size="md" className="text-brand" />
            <Spinner size="lg" className="text-brand" />
          </div>
        </div>
      </div>
    </Group>
  );
}

function ResponseTier() {
  const [visible, setVisible] = useState(true);
  const [key, setKey] = useState(0);

  function replay() {
    setVisible(false);
    setTimeout(() => {
      setKey((k) => k + 1);
      setVisible(true);
    }, 50);
  }

  return (
    <Group label="Tier 2 — Response (реакція на дію)">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" variant="secondary" onClick={replay}>
            Replay ▶
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 max-w-sm" key={key}>
          {visible && (
            <>
              <div className="animate-fade-in bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-fade-in</code>
              </div>
              <div className="animate-scale-in bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-scale-in</code>
              </div>
              <div className="animate-slide-in-up bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-slide-in-up</code>
              </div>
              <div className="animate-slide-in-right bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-slide-in-right</code>
              </div>
              <div className="animate-card-enter bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-card-enter</code>
              </div>
              <div className="animate-fab-item bg-panel border border-line rounded-xl p-3 text-xs text-center">
                <code>animate-fab-item</code>
              </div>
            </>
          )}
        </div>

        {/* Shake (error feedback) */}
        <ShakeDemo />
      </div>
    </Group>
  );
}

function ShakeDemo() {
  const [shaking, setShaking] = useState(false);

  function triggerShake() {
    setShaking(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShaking(true));
    });
    setTimeout(() => setShaking(false), 500);
  }

  return (
    <div>
      <p className="text-xs text-muted mb-2">
        Shake (помилка валідації) — <code>animate-shake</code>
      </p>
      <div className="flex items-center gap-3">
        <input
          type="text"
          readOnly
          value="Некоректне значення"
          className={[
            "input-focus px-3 py-2 rounded-xl border border-danger/60 bg-panel text-sm text-text",
            shaking ? "animate-shake" : "",
          ].join(" ")}
        />
        <Button size="sm" variant="danger" onClick={triggerShake}>
          Shake
        </Button>
      </div>
    </div>
  );
}

function CelebrateTier() {
  const [checked, setChecked] = useState(false);
  const [amount, setAmount] = useState(0);

  return (
    <Group label="Tier 3 — Celebrate (досягнення)">
      <div className="space-y-6">
        {/* StreakFlame */}
        <div>
          <p className="text-xs text-muted mb-3">
            StreakFlame — <code>animate-streak-glow</code>
          </p>
          <div className="flex items-end gap-4 flex-wrap">
            {[1, 7, 14, 30, 90].map((n) => (
              <div key={n} className="flex flex-col items-center gap-1">
                <StreakFlame streak={n} size="md" showLabel />
                <span className="text-xs text-muted">{n}д</span>
              </div>
            ))}
          </div>
        </div>

        {/* AnimatedCheckbox */}
        <div>
          <p className="text-xs text-muted mb-3">
            AnimatedCheckbox — <code>animate-check-bounce</code>
          </p>
          <div className="flex items-center gap-4 flex-wrap">
            {(
              ["default", "routine", "finyk", "fizruk", "nutrition"] as const
            ).map((variant) => (
              <div key={variant} className="flex flex-col items-center gap-1.5">
                <AnimatedCheckbox
                  checked={checked}
                  onChange={setChecked}
                  variant={variant}
                  size="lg"
                />
                <span className="text-xs text-muted">{variant}</span>
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => setChecked((v) => !v)}
          >
            Toggle ({checked ? "✓" : "○"})
          </Button>
        </div>

        {/* AnimatedNumber */}
        <div>
          <p className="text-xs text-muted mb-3">
            AnimatedNumber — <code>animate-tick-up / tick-down</code>
          </p>
          <div className="flex items-end gap-6 flex-wrap">
            <div className="text-center">
              <AnimatedNumber
                value={amount}
                formatOptions={{ style: "currency", currency: "UAH" }}
                locale="uk-UA"
                className="text-style-hero text-text tabular-nums"
              />
              <p className="text-xs text-muted mt-1">Сума</p>
            </div>
            <div className="text-center">
              <AnimatedNumber
                value={amount}
                suffix=" ккал"
                className="text-style-title text-nutrition tabular-nums"
              />
              <p className="text-xs text-muted mt-1">Калорії</p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAmount((v) => v + 1000)}
            >
              +1000
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAmount((v) => Math.max(0, v - 500))}
            >
              −500
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAmount(0)}>
              Reset
            </Button>
          </div>
        </div>

        {/* Bar grow */}
        <div>
          <p className="text-xs text-muted mb-3">
            Bar grow — <code>animate-bar-grow</code>
          </p>
          <BarGrowDemo />
        </div>
      </div>
    </Group>
  );
}

function BarGrowDemo() {
  const [key, setKey] = useState(0);
  const bars = [
    { label: "Пн", pct: 60, color: "bg-finyk" },
    { label: "Вт", pct: 85, color: "bg-routine" },
    { label: "Ср", pct: 40, color: "bg-fizruk" },
    { label: "Чт", pct: 95, color: "bg-nutrition" },
    { label: "Пт", pct: 70, color: "bg-brand" },
  ];

  return (
    <div className="space-y-2 max-w-xs">
      <div className="flex items-end gap-2 h-20" key={key}>
        {bars.map((b) => (
          <div
            key={b.label}
            className="flex flex-col items-center gap-1 flex-1"
          >
            <div
              className="w-full flex flex-col justify-end"
              style={{ height: "64px" }}
            >
              <div
                className={[b.color, "rounded-t-md animate-bar-grow"].join(" ")}
                style={{ height: `${b.pct}%` }}
              />
            </div>
            <span className="text-xs text-muted">{b.label}</span>
          </div>
        ))}
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => setKey((k) => k + 1)}
      >
        Replay ▶
      </Button>
    </div>
  );
}

export function MotionSection() {
  return (
    <Sec id="motion" title="Motion & Animation">
      <AmbientTier />
      <ResponseTier />
      <CelebrateTier />
    </Sec>
  );
}
