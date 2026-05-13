import { useState } from "react";
import { Spinner } from "@shared/components/ui/Spinner";
import { Skeleton } from "@shared/components/ui/Skeleton";
import { AnimatedCheckbox } from "@shared/components/ui/AnimatedCheckbox";
import { AnimatedNumber } from "@shared/components/ui/AnimatedNumber";
import { StreakFlame } from "@shared/components/ui/StreakFlame";
import { Button } from "@shared/components/ui/Button";
import { cn } from "@shared/lib/ui/cn";
import { Sec, Group } from "../_shared";

/**
 * Motion & Animation showcase — 3-tier motion budget (Hard Rule #17):
 *
 *  Tier 1 — Ambient   : skeleton, spinner, pulse  (background states)
 *  Tier 2 — Response  : slide, fade, scale         (user-triggered feedback)
 *  Tier 3 — Celebrate : streak, check, number, bar (milestone moments)
 *
 * Token reference: `docs/design/design-system.md` §14 Motion. All blocks
 * below pull `--motion-duration-*` / `--motion-ease-*` from `theme.css`
 * via Tailwind's `duration-*` / `ease-*` utilities — no raw timing
 * values are accepted in `className` (`duration-[230ms]` is forbidden).
 *
 * The "Reduced motion" toggle near the top wraps the whole section in
 * `.simulate-reduced-motion`, which mirrors the
 * `@media (prefers-reduced-motion: reduce)` strategy: AMBIENT loops
 * pause, RESPONSE + CELEBRATE collapse to a 100 ms opacity fade.
 */

const DURATIONS = [
  { name: "instant", value: "75 ms", className: "duration-instant" },
  { name: "fast", value: "150 ms", className: "duration-fast" },
  { name: "base", value: "220 ms", className: "duration-base" },
  { name: "slow", value: "320 ms", className: "duration-slow" },
  { name: "slower", value: "480 ms", className: "duration-slower" },
  { name: "slowest", value: "680 ms", className: "duration-slowest" },
] as const;

const EASINGS = [
  {
    name: "standard",
    expr: "cubic-bezier(.2, 0, 0, 1)",
    className: "ease-standard",
  },
  {
    name: "emphasized",
    expr: "cubic-bezier(.3, 0, 0, 1)",
    className: "ease-emphasized",
  },
  {
    name: "accelerate",
    expr: "cubic-bezier(.3, 0, 1, 1)",
    className: "ease-accelerate",
  },
  {
    name: "decelerate",
    expr: "cubic-bezier(0, 0, .2, 1)",
    className: "ease-decelerate",
  },
  {
    name: "overshoot",
    expr: "cubic-bezier(.34, 1.56, .64, 1)",
    className: "ease-overshoot",
  },
] as const;

/* ── Reduced-motion toggle ───────────────────────────────────────────── */

function ReducedMotionWrapper({ children }: { children: React.ReactNode }) {
  const [reduced, setReduced] = useState(false);
  return (
    <div className={cn(reduced && "simulate-reduced-motion")}>
      <Group label="prefers-reduced-motion">
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            size="sm"
            variant={reduced ? "primary" : "secondary"}
            onClick={() => setReduced((v) => !v)}
            aria-pressed={reduced}
          >
            {reduced ? "Reduced motion ON" : "Reduced motion OFF"}
          </Button>
          <p className="text-xs text-muted">
            Симулює <code>prefers-reduced-motion: reduce</code>: AMBIENT
            анімації паузаться, RESPONSE/CELEBRATE сходять до opacity-fade ≤ 100
            ms.
          </p>
        </div>
      </Group>
      <div className="mt-6 space-y-8">{children}</div>
    </div>
  );
}

/* ── Duration tokens — moving block per token ────────────────────────── */

function DurationTokens() {
  const [played, setPlayed] = useState(0);
  const playing = played % 2 === 1;
  return (
    <Group label="Duration tokens — moving block per token">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPlayed((v) => v + 1)}
        >
          {playing ? "Reset" : "Play ▶"}
        </Button>
        <p className="text-xs text-muted">
          Кожен блок переміщується однакову відстань за різну тривалість —
          візуально видно, що <code>instant</code> ≪ <code>slowest</code>.
        </p>
      </div>
      <div className="space-y-2">
        {DURATIONS.map((d) => (
          <div
            key={d.name}
            className="flex items-center gap-3 bg-panelHi rounded-xl px-2 py-1.5 border border-line"
          >
            <span className="font-mono text-xs text-muted w-20 shrink-0">
              {d.name}
            </span>
            <span className="font-mono text-2xs text-subtle w-14 shrink-0">
              {d.value}
            </span>
            <div className="relative flex-1 h-6 rounded-full bg-panel border border-line/60 overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 w-6 rounded-full bg-brand-strong",
                  "transition-transform ease-standard motion-safe:will-change-transform",
                  d.className,
                  playing ? "translate-x-[calc(100%-1.5rem)]" : "translate-x-0",
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </Group>
  );
}

/* ── Easing tokens — same distance, different curve ──────────────────── */

function EasingTokens() {
  const [played, setPlayed] = useState(0);
  const playing = played % 2 === 1;
  return (
    <Group label="Easing tokens — horizontal travel comparison">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setPlayed((v) => v + 1)}
        >
          {playing ? "Reset" : "Play ▶"}
        </Button>
        <p className="text-xs text-muted">
          Тривалість фіксована (<code>duration-slowest</code>), різниться лише
          крива. Старти синхронізовані — видно прискорення/гальмування.
        </p>
      </div>
      <div className="space-y-2">
        {EASINGS.map((e) => (
          <div
            key={e.name}
            className="flex items-center gap-3 bg-panelHi rounded-xl px-2 py-1.5 border border-line"
          >
            <span className="font-mono text-xs text-muted w-24 shrink-0">
              {e.name}
            </span>
            <span className="font-mono text-2xs text-subtle w-44 shrink-0 hidden sm:inline">
              {e.expr}
            </span>
            <div className="relative flex-1 h-6 rounded-full bg-panel border border-line/60 overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 w-6 rounded-full bg-finyk",
                  "transition-transform duration-slowest motion-safe:will-change-transform",
                  e.className,
                  playing ? "translate-x-[calc(100%-1.5rem)]" : "translate-x-0",
                )}
              />
            </div>
          </div>
        ))}
      </div>
    </Group>
  );
}

/* ── Stagger demo ────────────────────────────────────────────────────── */

function StaggerDemo() {
  const [key, setKey] = useState(0);
  return (
    <Group label="Stagger — 30 ms cadence, cap 150 ms (Hard Rule #17)">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setKey((k) => k + 1)}
        >
          Replay ▶
        </Button>
        <p className="text-xs text-muted">
          <code>.stagger-children</code> — діти отримують
          <code> animation-delay: index × 30 ms</code>, починаючи з 6-го
          залишається 150 ms. Уся група рахується як 1 RESPONSE.
        </p>
      </div>
      <div key={key} className="stagger-children grid grid-cols-3 gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="bg-panel border border-line rounded-xl px-3 py-2 text-xs text-center text-muted"
          >
            child {i + 1}
          </div>
        ))}
      </div>
    </Group>
  );
}

/* ── Enter/exit helpers (sheet / modal / menu) ───────────────────────── */

function ChoreographyHelpers() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Group label="Enter / exit helpers (sheets, modals, menus)">
      <p className="text-xs text-muted mb-3">
        Канонічні token-driven класи —<code> .motion-sheet-enter/-exit</code>,
        <code> .motion-modal-enter/-exit</code>,
        <code> .motion-menu-enter/-exit</code>. Цей showcase демонструє
        choreography; реальні overlay-примітиви живуть у
        <code> @shared/components/ui</code>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setSheetOpen((v) => !v)}
          aria-pressed={sheetOpen}
        >
          {sheetOpen ? "Close sheet" : "Open sheet"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setModalOpen((v) => !v)}
          aria-pressed={modalOpen}
        >
          {modalOpen ? "Close modal" : "Open modal"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setMenuOpen((v) => !v)}
          aria-pressed={menuOpen}
        >
          {menuOpen ? "Close menu" : "Open menu"}
        </Button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 min-h-[80px]">
        <div className="bg-panelHi rounded-xl border border-line p-2 overflow-hidden flex items-center justify-center">
          {sheetOpen && (
            <div className="motion-sheet-enter bg-brand-strong text-white rounded-xl px-3 py-2 text-xs w-full text-center">
              sheet enter
            </div>
          )}
        </div>
        <div className="bg-panelHi rounded-xl border border-line p-2 overflow-hidden flex items-center justify-center">
          {modalOpen && (
            <div className="motion-modal-enter bg-finyk-strong text-white rounded-xl px-3 py-2 text-xs w-full text-center">
              modal enter
            </div>
          )}
        </div>
        <div className="bg-panelHi rounded-xl border border-line p-2 overflow-hidden flex items-center justify-center">
          {menuOpen && (
            <div className="motion-menu-enter bg-routine-strong text-white rounded-xl px-3 py-2 text-xs w-full text-center">
              menu enter
            </div>
          )}
        </div>
      </div>
    </Group>
  );
}

/* ── Existing tier demos (Ambient / Response / Celebrate) ────────────── */

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
            Skeleton shimmer — <code>motion-safe:animate-shimmer</code>
          </p>
          <div className="space-y-2 max-w-xs">
            <Skeleton shimmer className="h-5 w-3/4" />
            <Skeleton shimmer className="h-4 w-full" />
            <Skeleton shimmer className="h-4 w-2/3" />
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
      <ReducedMotionWrapper>
        <DurationTokens />
        <EasingTokens />
        <StaggerDemo />
        <ChoreographyHelpers />
        <AmbientTier />
        <ResponseTier />
        <CelebrateTier />
      </ReducedMotionWrapper>
    </Sec>
  );
}
