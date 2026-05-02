/**
 * Sergeant Design System — CelebrationModal (React Native)
 *
 * Mobile port of the web CelebrationModal for achievements, goals,
 * level-ups, streaks, and general success celebrations.
 *
 * @see apps/web/src/shared/components/ui/CelebrationModal.tsx — canonical source
 *
 * Features:
 * - Animated confetti particles with physics simulation
 * - Haptic feedback patterns for different celebration types
 * - Module-specific color theming
 * - Spring-based modal entrance animation
 * - Auto-close timer support
 * - Accessibility support with screen reader announcements
 */

import * as Haptics from "expo-haptics";
import { Check, Flame, Target, Trophy, Zap } from "lucide-react-native";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { Button } from "./Button";
import { AnimatedCounter } from "./AnimatedCounter";
import { ProgressRing, type ProgressRingVariant } from "./ProgressRing";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES & CONSTANTS
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
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  shape: "circle" | "square" | "star";
}

const MODULE_COLORS: Record<ModuleTheme, string[]> = {
  finyk: ["#10B981", "#14B8A6", "#059669", "#34D399"],
  fizruk: ["#14B8A6", "#0D9488", "#2DD4BF", "#0F766E"],
  routine: ["#F97066", "#FB923C", "#F59E0B", "#EF4444"],
  nutrition: ["#84CC16", "#A3E635", "#65A30D", "#BEF264"],
  default: ["#10B981", "#F97066", "#84CC16", "#14B8A6"],
};

const MODULE_BG_COLORS: Record<ModuleTheme, string> = {
  finyk: "#ecfdf5",
  fizruk: "#f0fdfa",
  routine: "#fff5f3",
  nutrition: "#f8fee7",
  default: "#f0fdf4",
};

function _cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFETTI SYSTEM
   ═══════════════════════════════════════════════════════════════════════════ */

function createConfettiParticle(
  id: number,
  colors: string[],
): ConfettiParticle {
  const shapes: ConfettiParticle["shape"][] = ["circle", "square", "star"];
  return {
    id,
    x: new Animated.Value(SCREEN_WIDTH / 2 + (Math.random() - 0.5) * 100),
    y: new Animated.Value(SCREEN_HEIGHT / 2 - 100),
    rotation: new Animated.Value(0),
    scale: new Animated.Value(0),
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 8 + Math.random() * 12,
    shape: shapes[Math.floor(Math.random() * shapes.length)],
  };
}

function ConfettiParticleView({ particle }: { particle: ConfettiParticle }) {
  const borderRadius =
    particle.shape === "circle"
      ? particle.size / 2
      : particle.shape === "star"
        ? 0
        : 2;

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: particle.size,
        height: particle.size,
        backgroundColor: particle.color,
        borderRadius,
        transform: [
          { translateX: particle.x },
          { translateY: particle.y },
          {
            rotate: particle.rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "720deg"],
            }),
          },
          { scale: particle.scale },
        ],
      }}
    />
  );
}

const CONFETTI_COUNTS = { low: 20, medium: 40, high: 60 } as const;

function useConfetti(theme: ModuleTheme, intensity: "low" | "medium" | "high") {
  const [particles, setParticles] = useState<ConfettiParticle[]>([]);
  const colors = MODULE_COLORS[theme];

  const triggerConfetti = useCallback(() => {
    const count = CONFETTI_COUNTS[intensity];
    const newParticles = Array.from({ length: count }, (_, i) =>
      createConfettiParticle(i, colors),
    );
    setParticles(newParticles);

    // Animate each particle
    newParticles.forEach((particle, index) => {
      const delay = index * 20;
      const targetX =
        SCREEN_WIDTH / 2 + (Math.random() - 0.5) * SCREEN_WIDTH * 0.8;
      const targetY = SCREEN_HEIGHT + 50;

      setTimeout(() => {
        Animated.parallel([
          // Pop in
          Animated.spring(particle.scale, {
            toValue: 1,
            useNativeDriver: true,
            damping: 10,
            stiffness: 200,
          }),
          // Fall down with physics
          Animated.timing(particle.y, {
            toValue: targetY,
            duration: 2000 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          // Drift horizontally
          Animated.timing(particle.x, {
            toValue: targetX,
            duration: 2000 + Math.random() * 1000,
            useNativeDriver: true,
          }),
          // Spin
          Animated.timing(particle.rotation, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
        ]).start();
      }, delay);
    });

    // Cleanup after animation
    setTimeout(() => setParticles([]), 4000);
  }, [colors, intensity]);

  return { particles, triggerConfetti };
}

/* ═══════════════════════════════════════════════════════════════════════════
   HAPTIC PATTERNS
   ═══════════════════════════════════════════════════════════════════════════ */

const triggerHapticPattern = async (type: CelebrationType) => {
  try {
    switch (type) {
      case "confetti":
      case "achievement":
        // Triple success burst
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 100);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }, 200);
        break;
      case "levelUp":
        // Rising pattern
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }, 80);
        setTimeout(async () => {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        }, 160);
        break;
      case "streak":
        // Fire burst
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        setTimeout(async () => {
          await Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }, 100);
        break;
      case "goal":
      case "success":
      default:
        await Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
        break;
    }
  } catch {
    // Haptics not available
  }
};

/* ═══════════════════════════════════════════════════════════════════════════
   CELEBRATION MODAL COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export interface CelebrationModalProps {
  type: CelebrationType;
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  theme?: ModuleTheme;
  value?: number | string;
  unit?: string;
  icon?: ReactNode;
  progress?: { current: number; max: number };
  rewards?: Array<{ icon: ReactNode; label: string }>;
  actionLabel?: string;
  onAction?: () => void;
  autoCloseMs?: number;
  confettiIntensity?: "low" | "medium" | "high";
}

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
  const { particles, triggerConfetti } = useConfetti(theme, confettiIntensity);
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const modalScale = useRef(new Animated.Value(0.8)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;
  const iconScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (open) {
      // Trigger haptics
      triggerHapticPattern(type);

      // Announce for screen readers
      AccessibilityInfo.announceForAccessibility(title);

      // Trigger confetti
      if (type === "confetti" || type === "achievement" || type === "levelUp") {
        triggerConfetti();
      }

      // Entrance animation
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(modalScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 12,
          stiffness: 150,
        }),
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Icon pop animation (delayed)
      setTimeout(() => {
        Animated.spring(iconScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 8,
          stiffness: 200,
        }).start();
      }, 150);
    } else {
      // Reset animations
      backdropOpacity.setValue(0);
      modalScale.setValue(0.8);
      modalOpacity.setValue(0);
      iconScale.setValue(0);
    }
  }, [
    open,
    type,
    title,
    backdropOpacity,
    modalScale,
    modalOpacity,
    iconScale,
    triggerConfetti,
  ]);

  // Auto-close timer
  useEffect(() => {
    if (!open || !autoCloseMs) return;
    const timer = setTimeout(onClose, autoCloseMs);
    return () => clearTimeout(timer);
  }, [open, autoCloseMs, onClose]);

  const handleAction = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onAction?.();
    onClose();
  }, [onAction, onClose]);

  const renderIcon = () => {
    if (icon) return icon;

    const iconColor = MODULE_COLORS[theme][0];
    const iconSize = 48;

    const iconMap: Record<CelebrationType, ReactNode> = {
      achievement: <Trophy size={iconSize} color={iconColor} strokeWidth={2} />,
      goal: <Target size={iconSize} color={iconColor} strokeWidth={2} />,
      levelUp: <Zap size={iconSize} color={iconColor} strokeWidth={2} />,
      streak: <Flame size={iconSize} color="#f97316" strokeWidth={2} />,
      success: (
        <View className="w-16 h-16 rounded-full bg-emerald-100 items-center justify-center">
          <Check size={32} color="#10b981" strokeWidth={3} />
        </View>
      ),
      confetti: <Trophy size={iconSize} color={iconColor} strokeWidth={2} />,
    };
    return iconMap[type];
  };

  const bgColor = MODULE_BG_COLORS[theme];

  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Confetti layer */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: SCREEN_WIDTH,
          height: SCREEN_HEIGHT,
        }}
      >
        {particles.map((particle) => (
          <ConfettiParticleView key={particle.id} particle={particle} />
        ))}
      </View>

      {/* Backdrop */}
      <Animated.View
        style={{
          flex: 1,
          opacity: backdropOpacity,
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
        className="bg-overlay"
      >
        <Pressable
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          onPress={onClose}
        />

        {/* Modal card */}
        <Animated.View
          style={{
            width: "100%",
            maxWidth: 340,
            backgroundColor: bgColor,
            borderRadius: 24,
            overflow: "hidden",
            transform: [{ scale: modalScale }],
            opacity: modalOpacity,
          }}
          className="shadow-2xl"
        >
          <View className="px-6 py-8 items-center gap-4">
            {/* Icon */}
            <Animated.View
              style={{ transform: [{ scale: iconScale }] }}
              className="mb-2"
            >
              {renderIcon()}
            </Animated.View>

            {/* Value display */}
            {value !== undefined && (
              <View className="flex-row items-baseline gap-1.5">
                {typeof value === "number" ? (
                  <AnimatedCounter
                    value={value}
                    className="text-4xl font-black text-fg"
                    haptic
                  />
                ) : (
                  <Text className="text-4xl font-black text-fg">{value}</Text>
                )}
                {unit && (
                  <Text className="text-lg font-semibold text-fg-muted">
                    {unit}
                  </Text>
                )}
              </View>
            )}

            {/* Title */}
            <Text className="text-xl font-bold text-fg text-center">
              {title}
            </Text>

            {/* Description */}
            {description && (
              <Text className="text-sm text-fg-muted text-center leading-relaxed max-w-[280px]">
                {description}
              </Text>
            )}

            {/* Progress bar */}
            {progress && (
              <View className="w-full items-center mt-2">
                <ProgressRing
                  value={progress.current}
                  max={progress.max}
                  size="md"
                  variant={
                    theme === "default"
                      ? "accent"
                      : (theme as ProgressRingVariant)
                  }
                />
                <Text className="text-xs text-fg-muted mt-2">
                  {progress.current} / {progress.max}
                </Text>
              </View>
            )}

            {/* Rewards */}
            {rewards && rewards.length > 0 && (
              <View className="flex-row flex-wrap justify-center gap-2 mt-2">
                {rewards.map((reward, idx) => (
                  <View
                    key={idx}
                    className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface dark:bg-cream-800 border border-line"
                  >
                    {reward.icon}
                    <Text className="text-sm font-medium text-fg">
                      {reward.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Action button */}
            <View className="mt-4 w-full">
              <Button
                variant="primary"
                size="lg"
                onPress={handleAction}
                className="w-full"
              >
                {actionLabel}
              </Button>
            </View>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   HOOK: useCelebration
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
        theme: "routine",
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
        autoCloseMs: 5500,
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
    success,
    achievement,
    goalCompleted,
    levelUp,
    streak,
    confetti,
    CelebrationComponent,
  };
}
