/**
 * Sergeant Hub-core — ModuleErrorBoundary (React Native)
 *
 * Mobile port of the web per-module boundary. Isolates a single
 * lazy-loaded module's render crash from the rest of the hub, lets the
 * user retry the module sub-tree without a full reload, and offers a
 * "back to hub" escape hatch.
 *
 * @see apps/web/src/core/ModuleErrorBoundary.tsx — canonical source of truth
 *
 * Improvements (2026-04-28):
 * - Enhanced visual design with icon, semantic colors
 * - Animated entrance for better UX
 * - Haptic feedback on retry action
 * - Collapsible error details
 * - Dark mode support via semantic tokens
 */

import { Component, type ReactNode, useState, useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  ScrollView,
  Text,
  View,
  AccessibilityInfo,
} from "react-native";
import {
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Home,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { colors } from "@/theme";

interface ModuleErrorBoundaryProps {
  onBackToHub: () => void;
  moduleName?: string;
  children?: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
  retryRev: number;
}

/**
 * Fallback UI component with animations and improved design.
 */
function ErrorFallbackUI({
  error,
  moduleName,
  onRetry,
  onBack,
}: {
  error: Error;
  moduleName?: string;
  onRetry: () => void;
  onBack: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    // Entrance animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 100,
        useNativeDriver: true,
      }),
    ]).start();

    // Announce error to screen readers
    AccessibilityInfo.announceForAccessibility(
      moduleName
        ? `Помилка в модулі ${moduleName}. Спробуйте ще раз або поверніться до головної.`
        : "Виникла помилка. Спробуйте ще раз або поверніться до головної.",
    );
  }, [fadeAnim, scaleAnim, moduleName]);

  const title = moduleName
    ? `Модуль "${moduleName}" не вдалося завантажити`
    : "Щось пішло не так";

  const handleRetry = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onRetry();
  };

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack();
  };

  const toggleDetails = () => {
    Haptics.selectionAsync();
    setShowDetails((prev) => !prev);
  };

  return (
    <View className="flex-1 bg-bg items-center justify-center p-6">
      <Animated.View
        style={{
          opacity: fadeAnim,
          transform: [{ scale: scaleAnim }],
          width: "100%",
          maxWidth: 400,
        }}
      >
        <Card variant="default" padding="lg" className="items-center">
          {/* Icon */}
          <View className="w-16 h-16 items-center justify-center rounded-2xl bg-danger/10 mb-4">
            <AlertTriangle size={32} color={colors.danger} strokeWidth={1.5} />
          </View>

          {/* Title */}
          <Text
            className="text-lg font-bold text-fg text-center mb-2"
            accessibilityRole="header"
          >
            {title}
          </Text>

          {/* Description */}
          <Text className="text-sm text-fg-muted text-center mb-4 leading-relaxed">
            Не хвилюйтесь, ваші дані в безпеці. Спробуйте оновити сторінку або
            поверніться до головного екрану.
          </Text>

          {/* Error Details Collapsible */}
          <Pressable
            onPress={toggleDetails}
            accessibilityRole="button"
            accessibilityLabel={
              showDetails ? "Сховати деталі помилки" : "Показати деталі помилки"
            }
            className="flex-row items-center gap-1 mb-4 px-3 py-2 rounded-lg bg-surface-muted active:opacity-70"
          >
            <Text className="text-xs text-fg-muted">
              {showDetails ? "Сховати деталі" : "Показати деталі"}
            </Text>
            <ChevronDown
              size={14}
              color={colors.textMuted}
              style={{
                transform: [{ rotate: showDetails ? "180deg" : "0deg" }],
              }}
            />
          </Pressable>

          {showDetails && (
            <ScrollView
              className="max-h-32 w-full mb-4 p-3 rounded-lg bg-surface-muted"
              showsVerticalScrollIndicator={true}
            >
              <Text
                className="text-xs text-danger font-mono"
                selectable
                accessibilityLabel={`Деталі помилки: ${error.message}`}
              >
                {error.message}
              </Text>
              {error.stack && (
                <Text
                  className="text-[10px] text-fg-subtle font-mono mt-2"
                  selectable
                >
                  {error.stack.split("\n").slice(0, 5).join("\n")}
                </Text>
              )}
            </ScrollView>
          )}

          {/* Actions */}
          <View className="w-full gap-3">
            <Button
              variant="primary"
              size="lg"
              onPress={handleRetry}
              accessibilityLabel="Спробувати завантажити модуль знову"
              leftIcon={<RefreshCw size={18} color="#fff" strokeWidth={2} />}
            >
              Спробувати ще раз
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onPress={handleBack}
              accessibilityLabel="Повернутися до головного екрану"
              leftIcon={<Home size={18} color={colors.text} strokeWidth={2} />}
            >
              На головну
            </Button>
          </View>
        </Card>

        {/* Support hint */}
        <Text className="text-xs text-fg-subtle text-center mt-4">
          Якщо проблема повторюється, зверніться до підтримки
        </Text>
      </Animated.View>
    </View>
  );
}

export default class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { error: null, retryRev: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // TODO(phase-10): forward via `@sentry/react-native` once mobile
    // observability is wired up.
    try {
      console.error("[ModuleErrorBoundary] caught error", error, {
        moduleName: this.props.moduleName,
      });
    } catch {
      /* noop */
    }
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, retryRev: s.retryRev + 1 }));
  };

  private handleBack = () => {
    this.setState({ error: null });
    this.props.onBackToHub();
  };

  render() {
    const { error, retryRev } = this.state;
    const { moduleName } = this.props;

    if (error) {
      return (
        <ErrorFallbackUI
          error={error}
          moduleName={moduleName}
          onRetry={this.handleRetry}
          onBack={this.handleBack}
        />
      );
    }

    // Remount sub-tree on retry by using `retryRev` as the React key.
    return <View key={retryRev}>{this.props.children}</View>;
  }
}
