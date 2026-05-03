import {
  memo,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "./Icon";
import { Button } from "./Button";
import { useFocusTrap } from "@shared/hooks/useFocusTrap";

/* ═══════════════════════════════════════════════════════════════════════════
   CELEBRATION MODAL — Success/Achievement/Level Up Modal System
   
   Варіанти:
   - achievement: Розблокування досягнення з трофеєм
   - goal: Завершення цілі (накопичено гроші, виконано workout)
   - levelUp: Підвищення рівня з progress bar
   - streak: Щоденний streak з мотиваційною копією
   - success: Загальний успіх з галочкою
   - confetti: Full-screen confetti при великих перемогах
   ═══════════════════════════════════════════════════════════════════════════ */

export type CelebrationType =
  | "achievement"
  | "goal"
  | "levelUp"
  | "streak"
  | "success"
  | "confetti";

export type ModuleTheme =
  | "finyk"
  | "fizruk"
  | "routine"
  | "nutrition"
  | "default";

interface ConfettiParticle {
  id: number;
  x: number;
  y: number;
  rotation: number;
  color: string;
  size: number;
  delay: number;
  shape: "circle" | "square" | "star";
}

const MODULE_COLORS: Record<ModuleTheme, string[]> = {
  finyk: ["#10B981", "#14B8A6", "#059669", "#34D399"],
  fizruk: ["#14B8A6", "#0D9488", "#2DD4BF", "#0F766E"],
  routine: ["#F97066", "#FB923C", "#F59E0B", "#EF4444"],
  nutrition: ["#84CC16", "#A3E635", "#65A30D", "#BEF264"],
  default: ["#10B981", "#F97066", "#84CC16", "#14B8A6"],
};

const MODULE_GRADIENTS: Record<ModuleTheme, string> = {
  finyk: "from-emerald-500/20 to-teal-500/10",
  fizruk: "from-teal-500/20 to-cyan-500/10",
  routine: "from-coral-500/20 to-orange-500/10",
  nutrition: "from-lime-500/20 to-green-500/10",
  default: "from-brand-500/20 to-emerald-500/10",
};

export interface CelebrationModalProps {
  /** Тип святкування */
  type: CelebrationType;
  /** Чи показувати модал */
  open: boolean;
  /** Callback закриття */
  onClose: () => void;
  /** Заголовок */
  title: string;
  /** Опис/підзаголовок */
  description?: string;
  /** Module theme for colors */
  theme?: ModuleTheme;
  /** Кількість/значення для відображення (streak days, level, amount) */
  value?: number | string;
  /** Одиниця виміру (днів, рівень, грн) */
  unit?: string;
  /** Іконка/емодзі для відображення */
  icon?: ReactNode;
  /** Показати прогрес бар (для levelUp) */
  progress?: { current: number; max: number };
  /** Нагороди/бонуси */
  rewards?: Array<{ icon: ReactNode; label: string }>;
  /** Текст кнопки */
  actionLabel?: string;
  /** Callback кнопки */
  onAction?: () => void;
  /** Автоматичне закриття через N мілісекунд */
  autoCloseMs?: number;
  /** Інтенсивність confetti (low, medium, high) */
  confettiIntensity?: "low" | "medium" | "high";
}

/**
 * Універсальний модал для святкувань та досягнень.
 * Автоматично генерує confetti, анімації та відповідний стиль залежно від типу.
 */
export const CelebrationModal = memo(function CelebrationModal({
  type,
  open,
  onClose,
  title,
  description,
  theme = "default",
  value,
  unit,
  icon,
  progress,
  rewards,
  actionLabel = "Чудово!",
  onAction,
  autoCloseMs,
  confettiIntensity = "medium",
}: CelebrationModalProps) {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const generateParticles = useCallback(
    (count: number) => {
      const colors = MODULE_COLORS[theme];
      const newParticles: ConfettiParticle[] = [];
      const shapes: ConfettiParticle["shape"][] = ["circle", "square", "star"];

      for (let i = 0; i < count; i++) {
        newParticles.push({
          id: i,
          x: 50 + (Math.random() - 0.5) * 80,
          y: 40 + (Math.random() - 0.5) * 60,
          rotation: Math.random() * 360,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 6 + Math.random() * 10,
          delay: Math.random() * 0.4,
          shape: shapes[Math.floor(Math.random() * shapes.length)],
        });
      }
      return newParticles;
    },
    [theme],
  );

  // Generate confetti on open
  useEffect(() => {
    if (!open) return;
    setIsExiting(false);

    const counts = { low: 15, medium: 30, high: 50 };
    const count =
      type === "confetti"
        ? counts[confettiIntensity] * 2
        : type === "achievement" || type === "levelUp"
          ? counts[confettiIntensity]
          : counts.low;

    setParticles(generateParticles(count));

    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(type === "confetti" ? [50, 30, 50] : [30]);
    }
  }, [open, type, confettiIntensity, generateParticles]);

  const handleClose = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
      onClose();
    }, 200);
  }, [onClose]);

  // Focus trap for accessibility — traps Tab within modal and handles Escape
  const modalRef = useFocusTrap<HTMLDivElement>(
    open && !isExiting,
    handleClose,
  );

  // Auto-close timer
  useEffect(() => {
    if (!open || !autoCloseMs) return;
    timerRef.current = setTimeout(() => {
      handleClose();
    }, autoCloseMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, autoCloseMs, handleClose]);

  const handleAction = useCallback(() => {
    onAction?.();
    handleClose();
  }, [onAction, handleClose]);

  if (!open && !isExiting) return null;

  const renderIcon = () => {
    if (icon) return icon;

    const iconMap: Record<CelebrationType, ReactNode> = {
      achievement: <span className="text-5xl animate-celebration-pop">🏆</span>,
      goal: <span className="text-5xl animate-celebration-pop">🎯</span>,
      levelUp: <span className="text-5xl animate-celebration-pop">⬆️</span>,
      streak: <span className="text-5xl animate-streak-glow">🔥</span>,
      success: (
        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center animate-success-ring">
          <Icon
            name="check"
            size={32}
            strokeWidth={3}
            className="text-success animate-check-draw"
          />
        </div>
      ),
      confetti: <span className="text-6xl animate-celebration-pop">🎉</span>,
    };
    return iconMap[type];
  };

  const renderValue = () => {
    if (!value) return null;

    return (
      <div className="flex items-baseline justify-center gap-1.5">
        <span className="text-4xl font-black text-text tabular-nums animate-tick-up">
          {value}
        </span>
        {unit && <span className="text-style-title text-muted">{unit}</span>}
      </div>
    );
  };

  const renderProgress = () => {
    if (!progress) return null;

    const percent = Math.min(
      100,
      Math.round((progress.current / progress.max) * 100),
    );

    return (
      <div className="w-full max-w-[200px] mx-auto">
        <div className="h-3 bg-panel-hi rounded-full overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              theme === "finyk" && "bg-finyk",
              theme === "fizruk" && "bg-fizruk",
              theme === "routine" && "bg-routine",
              theme === "nutrition" && "bg-nutrition",
              theme === "default" && "bg-brand",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="text-xs text-muted text-center mt-1.5">
          {progress.current} / {progress.max}
        </p>
      </div>
    );
  };

  const renderRewards = () => {
    if (!rewards?.length) return null;

    return (
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {rewards.map((reward, idx) => (
          <div
            key={idx}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-full",
              "bg-panel-hi border border-line",
              "animate-module-card",
            )}
            style={{ animationDelay: `${idx * 100 + 200}ms` }}
          >
            <span className="text-lg">{reward.icon}</span>
            <span className="text-style-label text-text">{reward.label}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-9999 flex items-center justify-center p-4",
        isExiting ? "animate-fade-out" : "animate-fade-in",
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="celebration-title"
    >
      {/* Backdrop */}
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-sm cursor-default"
        onClick={handleClose}
        aria-label="Закрити"
        tabIndex={-1}
      />

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
              borderRadius:
                p.shape === "circle" ? "50%" : p.shape === "star" ? "0" : "2px",
              transform: `rotate(${p.rotation}deg)`,
              animationDelay: `${p.delay}s`,
              clipPath:
                p.shape === "star"
                  ? "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)"
                  : undefined,
            }}
          />
        ))}
      </div>

      {/* Modal card */}
      <div
        ref={modalRef}
        className={cn(
          "relative z-10 w-full max-w-sm",
          "bg-panel/95 backdrop-blur-xl rounded-3xl shadow-float",
          "border border-line overflow-hidden",
          isExiting ? "animate-scale-out" : "animate-streak-milestone",
        )}
      >
        {/* Gradient background accent */}
        <div
          className={cn(
            "absolute inset-0 bg-linear-to-br pointer-events-none",
            MODULE_GRADIENTS[theme],
          )}
        />

        {/* Content */}
        <div className="relative px-6 py-8 flex flex-col items-center gap-4">
          {/* Icon */}
          <div className="mb-2">{renderIcon()}</div>

          {/* Value (if any) */}
          {renderValue()}

          {/* Title */}
          <h2
            id="celebration-title"
            className="text-style-title text-text text-center text-balance"
          >
            {title}
          </h2>

          {/* Description */}
          {description && (
            <p className="text-sm text-muted text-center text-pretty max-w-[280px]">
              {description}
            </p>
          )}

          {/* Progress bar (for levelUp) */}
          {renderProgress()}

          {/* Rewards */}
          {renderRewards()}

          {/* Action button */}
          <Button
            variant="primary"
            size="lg"
            onClick={handleAction}
            className={cn(
              "mt-4 min-w-[160px]",
              type === "confetti" && "animate-pulse",
            )}
          >
            {actionLabel}
          </Button>
        </div>
      </div>
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   HOOK: useCelebration — Керування станом святкувань
   ═══════════════════════════════════════════════════════════════════════════ */

type CelebrationConfig = Omit<CelebrationModalProps, "open" | "onClose">;

export function useCelebration() {
  const [config, setConfig] = useState<CelebrationConfig | null>(null);

  const celebrate = useCallback((options: CelebrationConfig) => {
    setConfig(options);
  }, []);

  const dismiss = useCallback(() => {
    setConfig(null);
  }, []);

  // Shorthand helpers
  const success = useCallback(
    (title: string, description?: string) => {
      celebrate({ type: "success", title, description, autoCloseMs: 4500 });
    },
    [celebrate],
  );

  const achievement = useCallback(
    (
      title: string,
      description?: string,
      rewards?: CelebrationConfig["rewards"],
    ) => {
      celebrate({
        type: "achievement",
        title,
        description,
        rewards,
        autoCloseMs: 6000,
      });
    },
    [celebrate],
  );

  const goalCompleted = useCallback(
    (
      title: string,
      value: number | string,
      unit: string,
      theme?: ModuleTheme,
    ) => {
      celebrate({
        type: "goal",
        title,
        value,
        unit,
        theme,
        description: "Ціль досягнуто!",
        autoCloseMs: 5500,
      });
    },
    [celebrate],
  );

  const levelUp = useCallback(
    (
      level: number,
      progress?: { current: number; max: number },
      rewards?: CelebrationConfig["rewards"],
    ) => {
      celebrate({
        type: "levelUp",
        title: `Рівень ${level}!`,
        description: "Ти стаєш сильнішим!",
        value: level,
        unit: "рівень",
        progress,
        rewards,
        autoCloseMs: 6000,
      });
    },
    [celebrate],
  );

  const streak = useCallback(
    (days: number, message?: string) => {
      celebrate({
        type: "streak",
        title: message || `${days} днів поспіль!`,
        value: days,
        unit: "днів",
        description: days >= 30 ? "Ти справжня легенда!" : "Так тримати!",
        autoCloseMs: 5000,
      });
    },
    [celebrate],
  );

  const confetti = useCallback(
    (
      title: string,
      description?: string,
      intensity?: "low" | "medium" | "high",
    ) => {
      celebrate({
        type: "confetti",
        title,
        description,
        confettiIntensity: intensity || "high",
        autoCloseMs: 11000,
      });
    },
    [celebrate],
  );

  const CelebrationComponent = config ? (
    <CelebrationModal {...config} open={true} onClose={dismiss} />
  ) : null;

  return {
    celebrate,
    dismiss,
    // Shorthand methods
    success,
    achievement,
    goalCompleted,
    levelUp,
    streak,
    confetti,
    // Component to render
    CelebrationComponent,
  };
}

/* ═══════════════════════════════════════════════════════════════════════
   MINI SUCCESS TOAST — Малий toast з галочкою що пульсує
   ═══════════════════════════════════════════════════════════════════════ */

export interface MiniSuccessProps {
  show: boolean;
  message?: string;
  onComplete?: () => void;
  duration?: number;
}

export const MiniSuccess = memo(function MiniSuccess({
  show,
  message = "Готово!",
  onComplete,
  duration = 2000,
}: MiniSuccessProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);

    const timer = setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, duration);

    return () => clearTimeout(timer);
  }, [show, duration, onComplete]);

  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed top-[max(1.5rem,env(safe-area-inset-top)+0.75rem)] left-1/2 -translate-x-1/2",
        "z-9999 pointer-events-none",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-4 py-2.5 rounded-full",
          "bg-success-strong text-white shadow-float",
          "animate-toast-enter",
        )}
      >
        <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 animate-success-ring">
          <Icon
            name="check"
            size={12}
            strokeWidth={3}
            className="animate-check-draw"
          />
        </span>
        <span className="text-style-label">{message}</span>
      </div>
    </div>
  );
});
