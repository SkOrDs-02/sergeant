/**
 * Sergeant Design System — ConfirmDialog (React Native)
 *
 * Enhanced mobile confirmation dialog with:
 * - Animated entrance/exit via react-native-reanimated
 * - Haptic feedback on actions
 * - Imperative API via useConfirm hook
 * - Multiple visual variants (default, destructive, warning, info)
 * - Proper accessibility roles and announcements
 *
 * @see apps/web/src/shared/components/ui/ConfirmDialog.tsx
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  type AccessibilityRole,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  useReducedMotion,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import {
  AlertTriangle,
  Info,
  HelpCircle,
  Trash2,
  type LucideIcon,
} from "lucide-react-native";

import { colors } from "@/theme";
import { Button } from "./Button";

const ALERT_DIALOG_ROLE = "alertdialog" as AccessibilityRole;

export type ConfirmDialogVariant =
  | "default"
  | "destructive"
  | "warning"
  | "info";

export interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** @deprecated Use variant="destructive" instead */
  danger?: boolean;
  /** Visual variant of the dialog */
  variant?: ConfirmDialogVariant;
  /** Custom icon component */
  icon?: LucideIcon;
  /** Hide the cancel button */
  hideCancel?: boolean;
  /** Show loading state on confirm button */
  loading?: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  testID?: string;
}

const VARIANT_CONFIG: Record<
  ConfirmDialogVariant,
  {
    icon: LucideIcon;
    iconColor: string;
    iconBg: string;
    confirmVariant: "primary" | "destructive" | "warning" | "secondary";
  }
> = {
  default: {
    icon: HelpCircle,
    iconColor: colors.info,
    iconBg: `${colors.info}15`,
    confirmVariant: "primary",
  },
  destructive: {
    icon: Trash2,
    iconColor: colors.danger,
    iconBg: `${colors.danger}15`,
    confirmVariant: "destructive",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: colors.warning,
    iconBg: `${colors.warning}15`,
    confirmVariant: "warning",
  },
  info: {
    icon: Info,
    iconColor: colors.info,
    iconBg: `${colors.info}15`,
    confirmVariant: "primary",
  },
};

export function ConfirmDialog({
  open,
  title = "Підтвердити дію",
  description,
  confirmLabel = "Підтвердити",
  cancelLabel = "Скасувати",
  danger = false,
  variant: variantProp,
  icon: iconProp,
  hideCancel = false,
  loading = false,
  onConfirm,
  onCancel,
  testID = "confirm-dialog",
}: ConfirmDialogProps) {
  const reduceMotion = useReducedMotion();

  // Support legacy `danger` prop
  const variant = variantProp ?? (danger ? "destructive" : "default");
  const config = VARIANT_CONFIG[variant];
  const IconComponent = iconProp ?? config.icon;

  const handleConfirm = useCallback(() => {
    if (variant === "destructive") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onConfirm?.();
  }, [variant, onConfirm]);

  const handleCancel = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel?.();
  }, [onCancel]);

  if (!open) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={handleCancel}
      statusBarTranslucent
    >
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(200)}
        exiting={reduceMotion ? undefined : FadeOut.duration(150)}
        className="flex-1 items-center justify-center px-6 bg-overlay"
      >
        {/* Scrim */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={handleCancel}
          testID={`${testID}-scrim`}
          className="absolute inset-0"
        />

        {/* Card */}
        <Animated.View
          entering={
            reduceMotion
              ? undefined
              : SlideInDown.springify().damping(20).stiffness(300)
          }
          exiting={reduceMotion ? undefined : SlideOutDown.duration(200)}
          accessibilityViewIsModal
          accessibilityRole={ALERT_DIALOG_ROLE}
          accessibilityLabel={title}
          className="w-full max-w-sm bg-surface rounded-2xl overflow-hidden shadow-xl"
          testID={testID}
        >
          {/* Icon */}
          <View className="items-center pt-6 pb-3">
            <View
              className="w-14 h-14 rounded-full items-center justify-center"
              style={{ backgroundColor: config.iconBg }}
            >
              <IconComponent
                size={28}
                color={config.iconColor}
                strokeWidth={2}
              />
            </View>
          </View>

          {/* Content */}
          <View className="px-6 pb-4 gap-2">
            <Text className="text-lg font-semibold text-fg text-center">
              {title}
            </Text>
            {typeof description === "string" ||
            typeof description === "number" ? (
              <Text className="text-sm text-fg-muted text-center leading-relaxed">
                {description}
              </Text>
            ) : description ? (
              <View>{description}</View>
            ) : null}
          </View>

          {/* Actions */}
          <View className="flex-row gap-3 px-6 pb-6">
            {!hideCancel && (
              <Button
                variant="secondary"
                size="lg"
                onPress={handleCancel}
                className="flex-1"
                testID={`${testID}-cancel`}
              >
                {cancelLabel}
              </Button>
            )}
            <Button
              variant={config.confirmVariant}
              size="lg"
              onPress={handleConfirm}
              loading={loading}
              disabled={loading}
              className="flex-1"
              testID={`${testID}-confirm`}
            >
              {confirmLabel}
            </Button>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ============================================================================
// Imperative API via Context
// ============================================================================

interface ConfirmOptions {
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmDialogVariant;
  icon?: LucideIcon;
  hideCancel?: boolean;
  /** Show loading state on confirm button during async operations */
  loading?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * Provider for imperative confirm dialogs.
 * Wrap your app with this to use the `useConfirm` hook.
 */
export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>({
    open: false,
    resolve: () => {},
  });

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        ...options,
        open: true,
        resolve,
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve(true);
    setState((prev) => ({ ...prev, open: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve(false);
    setState((prev) => ({ ...prev, open: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.resolve]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        description={state.description}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        variant={state.variant}
        icon={state.icon}
        hideCancel={state.hideCancel}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        testID="confirm-dialog-provider"
      />
    </ConfirmContext.Provider>
  );
}

/**
 * Hook to show confirmation dialogs imperatively.
 *
 * @example
 * const confirm = useConfirm();
 *
 * async function handleDelete() {
 *   const confirmed = await confirm({
 *     title: "Видалити звичку?",
 *     description: "Цю дію неможливо скасувати.",
 *     confirmLabel: "Видалити",
 *     variant: "destructive",
 *   });
 *   if (confirmed) {
 *     deleteHabit(id);
 *   }
 * }
 */
export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within ConfirmDialogProvider");
  }
  return context.confirm;
}

export default ConfirmDialog;
