import { memo, useEffect, useState, useCallback } from "react";
import { cn } from "@shared/lib/cn";

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
}

const MILESTONE_COLORS = {
  7: ["#10B981", "#14B8A6", "#059669"], // emerald/teal for 7 days
  14: ["#F97066", "#FB923C", "#F59E0B"], // coral/orange for 14 days
  30: ["#A855F7", "#EC4899", "#8B5CF6"], // purple/pink for 30 days
  default: ["#10B981", "#F97066", "#84CC16"], // mixed for other milestones
};

const MILESTONE_MESSAGES: Record<number, string> = {
  7: "Тиждень послідовності!",
  14: "Два тижні! Неймовірно!",
  21: "Три тижні сили волі!",
  30: "Місяць! Ти легенда!",
  60: "Два місяці! Вражаюче!",
  90: "Три місяці! Майстер!",
  100: "100 днів! Феноменально!",
  365: "Рік! Ти неперевершений!",
};

function getMilestoneMessage(days: number): string | null {
  if (MILESTONE_MESSAGES[days]) return MILESTONE_MESSAGES[days];
  if (days > 0 && days % 100 === 0) return `${days} днів! Чемпіон!`;
  return null;
}

function getColors(days: number): string[] {
  if (days === 7) return MILESTONE_COLORS[7];
  if (days === 14) return MILESTONE_COLORS[14];
  if (days >= 30) return MILESTONE_COLORS[30];
  return MILESTONE_COLORS.default;
}

export interface StreakCelebrationProps {
  /** Current streak count */
  streak: number;
  /** Previous streak count (to detect milestone crossing) */
  previousStreak?: number;
  /** Called when celebration animation completes */
  onComplete?: () => void;
  /** Override visibility control */
  show?: boolean;
  /** Custom class name */
  className?: string;
}

/**
 * Streak milestone celebration with confetti burst effect.
 * Automatically detects milestone crossings (7, 14, 30, etc.) and shows
 * a celebration overlay with confetti and congratulatory message.
 */
export const StreakCelebration = memo(function StreakCelebration({
  streak,
  previousStreak,
  onComplete,
  show: showOverride,
  className,
}: StreakCelebrationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const generateParticles = useCallback((count: number, colors: string[]) => {
    const newParticles: ConfettiParticle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: i,
        x: 50 + (Math.random() - 0.5) * 60, // spread from center
        y: 50 + (Math.random() - 0.5) * 40,
        rotation: Math.random() * 360,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 6 + Math.random() * 8,
        delay: Math.random() * 0.3,
      });
    }
    return newParticles;
  }, []);

  const triggerCelebration = useCallback(
    (days: number) => {
      const msg = getMilestoneMessage(days);
      if (!msg) return;

      const colors = getColors(days);
      const particleCount = days >= 30 ? 40 : days >= 14 ? 30 : 20;

      setMessage(msg);
      setParticles(generateParticles(particleCount, colors));
      setIsVisible(true);

      // Auto-dismiss after animation
      const timer = setTimeout(() => {
        setIsVisible(false);
        onComplete?.();
      }, 2500);

      return () => clearTimeout(timer);
    },
    [generateParticles, onComplete],
  );

  // Detect milestone crossing
  useEffect(() => {
    if (showOverride !== undefined) {
      if (showOverride) triggerCelebration(streak);
      else setIsVisible(false);
      return;
    }

    // Check if we crossed a milestone
    const milestones = [7, 14, 21, 30, 60, 90, 100, 365];
    const crossedMilestone = milestones.find(
      (m) =>
        streak >= m && (previousStreak === undefined || previousStreak < m),
    );

    if (crossedMilestone) {
      triggerCelebration(crossedMilestone);
    }
  }, [streak, previousStreak, showOverride, triggerCelebration]);

  if (!isVisible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none",
        className,
      )}
      aria-live="polite"
      role="alert"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/20 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" />

      {/* Confetti particles */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <div
            key={p.id}
            className="absolute motion-safe:animate-confetti"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              transform: `rotate(${p.rotation}deg)`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Message card */}
      <div
        className={cn(
          "relative z-10 flex flex-col items-center gap-3 px-8 py-6",
          "bg-panel/95 backdrop-blur-xl rounded-3xl shadow-float",
          "border border-line",
          "motion-safe:animate-streak-milestone",
        )}
      >
        <div className="text-4xl animate-streak-glow">
          {streak >= 30 ? "🏆" : streak >= 14 ? "🔥" : "⭐"}
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-text tabular-nums">{streak}</p>
          <p className="text-sm font-semibold text-muted">днів поспіль</p>
        </div>
        {message && (
          <p className="text-base font-semibold text-brand-strong dark:text-brand text-center text-pretty">
            {message}
          </p>
        )}
      </div>
    </div>
  );
});

/**
 * Hook to manage streak celebration state.
 * Returns a trigger function and the celebration component.
 */
export function useStreakCelebration() {
  const [celebrationState, setCelebrationState] = useState<{
    streak: number;
    previousStreak?: number;
  } | null>(null);

  const trigger = useCallback((streak: number, previousStreak?: number) => {
    setCelebrationState({ streak, previousStreak });
  }, []);

  const dismiss = useCallback(() => {
    setCelebrationState(null);
  }, []);

  const CelebrationComponent = celebrationState ? (
    <StreakCelebration
      streak={celebrationState.streak}
      previousStreak={celebrationState.previousStreak}
      onComplete={dismiss}
      show
    />
  ) : null;

  return { trigger, dismiss, CelebrationComponent };
}
