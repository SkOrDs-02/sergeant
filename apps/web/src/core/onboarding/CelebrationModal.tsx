/**
 * CelebrationModal — First entry success celebration
 *
 * Full-screen modal celebrating the user's first real entry.
 * Shows confetti particles and module-aware copy from
 * `FIRST_ENTRY_CELEBRATIONS` so the headline acknowledges what the
 * user actually just did. TTV-numbers stay in the analytics payload
 * (`celebration_shown { ttvMs }`) — they are not used as copy input,
 * because bragging about engineering speed reframes the moment to
 * the app instead of the user.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import {
  type DashboardModuleId,
  getFirstEntryCelebrationCopy,
} from "@sergeant/shared";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { ANALYTICS_EVENTS, trackEvent } from "../observability/analytics";

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

const CONFETTI_COLORS = [
  "#10B981", // emerald
  "#14B8A6", // teal
  "#F97066", // coral
  "#84CC16", // lime
  "#FBBF24", // amber
];

interface CelebrationModalProps {
  open: boolean;
  onClose: () => void;
  /** Time-to-value in milliseconds (null if not measured) */
  ttvMs: number | null;
  /**
   * Module that owns the entry which flipped the first-real-entry
   * flag. Picks the copy variant from `FIRST_ENTRY_CELEBRATIONS`;
   * `null` falls back to the default copy.
   */
  moduleId: DashboardModuleId | null;
}

export function CelebrationModal({
  open,
  onClose,
  ttvMs,
  moduleId,
}: CelebrationModalProps) {
  const [visible, setVisible] = useState(false);
  const [animateOut, setAnimateOut] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  // Generate confetti particles. `Math.random()` is used here only to
  // jitter visual positions / colours / sizes — visual diversity is
  // the goal, not derived state. `useMemo` snapshots the values on
  // mount so subsequent renders are stable; the impurity is contained.
  /* eslint-disable react-hooks/purity -- intentional visual jitter */
  const particles = useMemo<ConfettiParticle[]>(() => {
    return Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: 50 + (Math.random() - 0.5) * 80,
      y: 30 + (Math.random() - 0.5) * 40,
      rotation: Math.random() * 360,
      color:
        CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: 6 + Math.random() * 8,
      delay: Math.random() * 0.3,
    }));
  }, []);
  /* eslint-enable react-hooks/purity */

  const handleClose = useCallback(() => {
    hapticTap();
    setAnimateOut(true);
    setTimeout(() => {
      setVisible(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Sync visibility with open prop. The `setVisible` / `setAnimateOut`
  // calls translate the parent-controlled `open` boolean into local
  // animation state and fire the analytics event. Treating it as
  // render-derivation would lose the open-edge needed for the
  // animation; suppress `react-hooks/set-state-in-effect` here.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      setAnimateOut(false);
      // Trigger haptic on open
      if (navigator.vibrate) {
        navigator.vibrate([50, 30, 50]);
      }
      trackEvent(ANALYTICS_EVENTS.CELEBRATION_SHOWN, {
        ttvMs,
        source: "first_entry",
        moduleId,
      });
    }
  }, [open, ttvMs, moduleId]);

  // Auto-dismiss after 10 seconds
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => {
      handleClose();
    }, 10000);
    return () => clearTimeout(timer);
  }, [visible, handleClose]);

  // Handle keyboard
  useEffect(() => {
    if (!visible) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [visible, handleClose]);

  // Focus the backdrop for keyboard accessibility
  useEffect(() => {
    if (visible && backdropRef.current) {
      backdropRef.current.focus();
    }
  }, [visible]);

  if (!visible) return null;

  // Module-aware copy lives in `FIRST_ENTRY_CELEBRATIONS`. The
  // headline acknowledges what the user actually did (записав
  // витрату / зафіксував тренування / запустив звичку / залогував
  // їжу), and the subtext promises the next step. Engineering-speed
  // bragging is intentionally absent — TTV stays in analytics
  // (see `celebration_shown` event payload above).
  const { headline, subtext } = getFirstEntryCelebrationCopy(moduleId);

  return (
    <div
      ref={backdropRef}
      className={cn(
        "fixed inset-0 z-9999 flex items-center justify-center",
        "bg-bg/85 backdrop-blur-md",
        animateOut
          ? "motion-safe:animate-fade-out"
          : "motion-safe:animate-fade-in",
      )}
      onClick={handleClose}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClose();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label="Закрити святкування"
    >
      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute animate-confetti"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.id % 3 === 0 ? "50%" : "2px",
              transform: `rotate(${p.rotation}deg)`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      <div
        className={cn(
          "relative flex flex-col items-center gap-5 p-8 max-w-sm mx-4 text-center",
          "bg-panel/95 backdrop-blur-xl rounded-3xl shadow-float border border-line",
          animateOut
            ? "motion-safe:animate-scale-out"
            : "motion-safe:animate-streak-milestone",
        )}
        role="presentation"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {/* Success icon with ring animation */}
        <div
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center",
            "bg-brand-500/15 ring-4 ring-brand-500/20",
            "motion-safe:animate-success-ring",
          )}
        >
          <div className="w-14 h-14 rounded-full bg-brand-500/20 flex items-center justify-center">
            <Icon
              name="check"
              size={32}
              strokeWidth={3}
              className="text-brand-500 motion-safe:animate-check-draw"
            />
          </div>
        </div>

        {/* Headline */}
        <div className="space-y-1">
          <h2 className="text-style-hero text-text">{headline}</h2>
          <p className="text-sm text-muted">{subtext}</p>
        </div>

        {/* Tips for next steps */}
        <div className="w-full p-3 rounded-xl bg-panelHi/50 border border-line/50 text-left space-y-2">
          {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift -- intentional overlay typography */}
          <p className="text-2xs text-subtle uppercase tracking-wide font-medium">
            Що далі
          </p>
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-6 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0 mt-0.5">
              <Icon name="sparkles" size={12} className="text-brand-500" />
            </div>
            <p className="text-xs text-muted leading-relaxed">
              Продовжуй додавати записи. Після кількох днів отримаєш перші
              інсайти та персональні поради.
            </p>
          </div>
        </div>

        {/* Dismiss button */}
        <Button
          variant="primary"
          size="lg"
          onClick={handleClose}
          className="w-full mt-1"
        >
          Продовжити
        </Button>
      </div>
    </div>
  );
}
