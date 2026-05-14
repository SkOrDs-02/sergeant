import { useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { Spinner } from "@shared/components/ui/Spinner";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { AnimatedNumber } from "@shared/components/ui/AnimatedNumber";
import { StreakFlame } from "@shared/components/ui/StreakFlame";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

/**
 * 3-tier motion budget (Hard Rule #17):
 *   Tier 1 — Ambient  : skeleton, spinner, pulse  (background states)
 *   Tier 2 — Response : slide, fade, scale        (user-triggered feedback)
 *   Tier 3 — Celebrate: streak, check, number     (milestone moments only)
 *
 *   max 1 ambient + 1 response simultaneously; stagger ≤ 30ms × N capped at
 *   150ms; celebrate only on 7/30/100/365 milestones.
 */

const SAMPLE_USAGE = `// motion-safe gates the animation under prefers-reduced-motion: reduce
<div className="motion-safe:animate-fade-in">…</div>

// Response feedback for taps / form submits
<Button className="active:scale-95 transition-transform">…</Button>`;

function AmbientTier() {
  return (
    <Group label="Tier 1 — Ambient (фонові стани)">
      <div className="space-y-4">
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
  const [seq, setSeq] = useState(0);

  function replay() {
    setVisible(false);
    setTimeout(() => {
      setSeq((k) => k + 1);
      setVisible(true);
    }, 50);
  }

  return (
    <Group label="Tier 2 — Response (реакція на дію)">
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2 mb-3">
          <Button size="sm" variant="secondary" onClick={replay}>
            Replay
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 max-w-sm" key={seq}>
          {visible ? (
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
            </>
          ) : null}
        </div>
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
          aria-label="Приклад input у стані помилки"
          className={`input-focus px-3 py-2 rounded-xl border border-danger/60 bg-panel text-sm text-text ${
            shaking ? "animate-shake" : ""
          }`}
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
      </div>
    </Group>
  );
}

export function MotionSection() {
  return (
    <Sec
      id="motion"
      title="Motion"
      intro={
        <>
          Бюджет — макс. 1 ambient + 1 response одночасно (HR #17). Кожна
          анімація обгорнута в <code>motion-safe:</code> щоб поважати OS pref
          <code>prefers-reduced-motion: reduce</code>. Celebrate — тільки на
          milestone-моментах (7 / 30 / 100 / 365 днів).
        </>
      }
    >
      <AmbientTier />
      <ResponseTier />
      <CelebrateTier />

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Decorative animate",
              good: <code>motion-safe:animate-pulse</code>,
              bad: <code>animate-pulse</code>,
            },
            {
              label: "Page enter",
              good: <code>animate-fade-in</code>,
              bad: (
                <code>
                  style=&#123;&#123; transition: &quot;all 0.8s&quot;
                  &#125;&#125;
                </code>
              ),
            },
            {
              label: "Celebrate",
              good: <code>milestone === 7 ? &lt;Confetti /&gt; : null</code>,
              bad: <code>&lt;Confetti every-action /&gt;</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[{ label: "HR #17", hint: "Animation budget — 3 tiers" }]}
        lintRules={[
          {
            label: "motion-safe convention",
            hint: "Wrap animate-* with motion-safe:",
          },
        ]}
      />
    </Sec>
  );
}
