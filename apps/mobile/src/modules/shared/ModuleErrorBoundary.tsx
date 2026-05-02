/**
 * Sergeant — ModuleErrorBoundary (React Native)
 *
 * Per-module error boundary that catches errors in module trees and
 * displays a user-friendly fallback UI. Each module should wrap its
 * layout with this boundary to isolate failures and prevent the
 * entire app from crashing.
 *
 * Features:
 * - Module-specific error styling with branded colors
 * - Retry functionality
 * - Error reporting hook for analytics
 * - Reduced motion support
 * - Accessible error messages
 */

import { Component, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react-native";
import { router } from "expo-router";

import type { DashboardModuleId } from "@sergeant/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface ModuleErrorBoundaryProps {
  /** Module identifier for styling and error reporting */
  moduleId: DashboardModuleId;
  /** Children to render when no error */
  children: ReactNode;
  /** Called when an error is caught (for analytics/logging) */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Custom fallback component */
  fallback?: (props: {
    error: Error;
    retry: () => void;
    moduleId: DashboardModuleId;
  }) => ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

const MODULE_CONFIG: Record<
  DashboardModuleId,
  { name: string; accentClass: string; iconColor: string }
> = {
  finyk: { name: "Фінік", accentClass: "bg-finyk", iconColor: "#10b981" },
  fizruk: { name: "Фізрук", accentClass: "bg-fizruk", iconColor: "#14b8a6" },
  routine: { name: "Рутина", accentClass: "bg-routine", iconColor: "#f97066" },
  nutrition: {
    name: "Харчування",
    accentClass: "bg-nutrition",
    iconColor: "#84cc16",
  },
};

export class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  State
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);

    // Log error for debugging (remove in production)
    if (__DEV__) {
      console.error("[ModuleErrorBoundary]", this.props.moduleId, error);
      console.error(
        "[ModuleErrorBoundary] Component stack:",
        errorInfo.componentStack,
      );
    }
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleGoHome = (): void => {
    router.replace("/(tabs)");
  };

  render(): ReactNode {
    const { moduleId, children, fallback } = this.props;
    const { hasError, error } = this.state;

    if (!hasError || !error) {
      return children;
    }

    // Use custom fallback if provided
    if (fallback) {
      return fallback({ error, retry: this.handleRetry, moduleId });
    }

    const config = MODULE_CONFIG[moduleId] || MODULE_CONFIG.finyk;

    return (
      <ScrollView
        className="flex-1 bg-bg"
        contentContainerClassName="flex-1 p-5 justify-center"
      >
        <Card variant="default" padding="lg" className="items-center">
          {/* Error Icon */}
          <View
            className={`w-16 h-16 rounded-2xl ${config.accentClass}/10 items-center justify-center mb-4`}
          >
            <AlertTriangle size={32} color={config.iconColor} strokeWidth={2} />
          </View>

          {/* Error Title */}
          <Text className="text-lg font-bold text-fg text-center mb-2">
            Упс! Щось пішло не так
          </Text>

          {/* Error Description */}
          <Text className="text-sm text-fg-muted text-center leading-relaxed mb-4">
            Модуль «{config.name}» зіткнувся з помилкою.{"\n"}
            Спробуй перезавантажити або повернись на головну.
          </Text>

          {/* Error Details (Dev only) */}
          {__DEV__ && (
            <Pressable
              className="w-full mb-4"
              accessibilityRole="button"
              accessibilityLabel="Показати деталі помилки"
            >
              <View className="px-3 py-2 bg-danger/5 rounded-xl border border-danger/20">
                <View className="flex-row items-center gap-2 mb-1">
                  <Bug size={14} color="#ef4444" strokeWidth={2} />
                  <Text className="text-xs font-semibold text-danger">
                    Dev Info
                  </Text>
                </View>
                <Text
                  className="text-xs text-danger/80 font-mono"
                  numberOfLines={3}
                >
                  {error.message}
                </Text>
              </View>
            </Pressable>
          )}

          {/* Action Buttons */}
          <View className="flex-row gap-3 w-full">
            <Button
              variant="secondary"
              size="md"
              onPress={this.handleGoHome}
              leftIcon={<Home size={18} color="#78716c" strokeWidth={2} />}
              className="flex-1"
            >
              Головна
            </Button>
            <Button
              variant="primary"
              size="md"
              onPress={this.handleRetry}
              leftIcon={<RefreshCw size={18} color="#fff" strokeWidth={2} />}
              className="flex-1"
            >
              Спробувати
            </Button>
          </View>
        </Card>

        {/* Subtle hint */}
        <Text className="text-xs text-fg-subtle text-center mt-4">
          Якщо проблема повторюється, спробуй перезапустити застосунок
        </Text>
      </ScrollView>
    );
  }
}

/**
 * HOC to wrap a component with ModuleErrorBoundary
 */
export function withModuleErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  moduleId: DashboardModuleId,
  options?: Omit<ModuleErrorBoundaryProps, "moduleId" | "children">,
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ModuleErrorBoundary moduleId={moduleId} {...options}>
        <WrappedComponent {...props} />
      </ModuleErrorBoundary>
    );
  };
}
