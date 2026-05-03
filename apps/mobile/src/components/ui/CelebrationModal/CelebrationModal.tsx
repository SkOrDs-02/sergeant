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
import { memo, useCallback, useEffect, useRef, type ReactNode } from "react";
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { AnimatedCounter } from "../AnimatedCounter";
import { Button } from "../Button";
import { ProgressRing, type ProgressRingVariant } from "../ProgressRing";
import { ConfettiParticleView } from "./confetti/ConfettiParticleView";
import { useConfetti } from "./confetti/useConfetti";
import { MODULE_BG_COLORS, MODULE_COLORS } from "./constants";
import { triggerHapticPattern } from "./haptics";
import type { CelebrationModalProps, CelebrationType } from "./types";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
      triggerHapticPattern(type);

      AccessibilityInfo.announceForAccessibility(title);

      if (type === "confetti" || type === "achievement" || type === "levelUp") {
        triggerConfetti();
      }

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

      setTimeout(() => {
        Animated.spring(iconScale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 8,
          stiffness: 200,
        }).start();
      }, 150);
    } else {
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
