/**
 * Sergeant Design System — Toast (React Native)
 *
 * Mobile port of the web `Toast` primitive + its `useToast` hook. We
 * ship both halves in one file because they're tightly coupled — the
 * provider owns the queue / timers, and the container reads from the
 * same context to render the stack.
 *
 * @see apps/web/src/shared/components/ui/Toast.tsx — visual container
 * @see apps/web/src/shared/hooks/useToast.tsx — state + API hook
 *
 * Features (UX Enhanced):
 * - Lucide SVG icons for polished visual feedback
 * - Spring-based entrance animation with bounce effect
 * - Exit animation with fade-out and slide-up
 * - Haptic feedback on toast appearance
 * - Progress bar showing remaining time
 * - Swipe-to-dismiss gesture support
 *
 * Parity notes:
 * - Same `ToastType` enum (`success` / `error` / `info` / `warning`).
 * - Same `useToast` context API: `show(msg, type?, duration?, action?)
 *   => id`, `success / error / info / warning`, `dismiss(id)`, plus the
 *   `toasts` array.
 * - Same default durations (3500ms, 5000ms for error/warning).
 * - Same queue cap (last 5 toasts rendered — `slice(-4)` like web).
 */

import * as Haptics from "expo-haptics";
import {
  AlertCircle,
  CheckCircle,
  Info,
  X,
  XCircle,
} from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface ToastItem {
  id: number;
  msg: ReactNode;
  type: ToastType;
  action: ToastAction | null;
}

export interface ToastApi {
  show: (
    msg: ReactNode,
    type?: ToastType,
    duration?: number,
    action?: ToastAction,
  ) => number;
  success: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  error: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  info: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  warning: (msg: ReactNode, duration?: number, action?: ToastAction) => number;
  dismiss: (id: number) => void;
}

export interface ToastContextValue extends ToastApi {
  toasts: ToastItem[];
}

const ToastContext = createContext<ToastContextValue | null>(null);

let idCounter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      timersRef.current = {};
    };
  }, []);

  const dismiss = useCallback<ToastApi["dismiss"]>((id) => {
    const timer = timersRef.current[id];
    if (timer) clearTimeout(timer);
    delete timersRef.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ToastApi["show"]>(
    (msg, type = "success", duration = 3500, action) => {
      const id = ++idCounter;
      const safeAction: ToastAction | null =
        action &&
        typeof action === "object" &&
        typeof action.onPress === "function"
          ? { label: String(action.label || "Дія"), onPress: action.onPress }
          : null;
      setToasts((prev) => [
        ...prev.slice(-4),
        { id, msg, type, action: safeAction },
      ]);
      timersRef.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  const success = useCallback<ToastApi["success"]>(
    (msg, duration, action) => show(msg, "success", duration, action),
    [show],
  );
  const error = useCallback<ToastApi["error"]>(
    (msg, duration, action) => show(msg, "error", duration ?? 5000, action),
    [show],
  );
  const info = useCallback<ToastApi["info"]>(
    (msg, duration, action) => show(msg, "info", duration, action),
    [show],
  );
  const warning = useCallback<ToastApi["warning"]>(
    (msg, duration, action) => show(msg, "warning", duration ?? 5000, action),
    [show],
  );

  const value = useMemo<ToastContextValue>(
    () => ({ show, success, error, info, warning, dismiss, toasts }),
    [show, success, error, info, warning, dismiss, toasts],
  );

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

const VARIANT_BG: Record<ToastType, string> = {
  success: "bg-success",
  error: "bg-danger",
  warning: "bg-warning",
  info: "bg-info",
};

const VARIANT_ICON: Record<ToastType, typeof CheckCircle> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertCircle,
  info: Info,
};

/** Haptic pattern for each toast type */
const VARIANT_HAPTIC: Record<ToastType, Haptics.NotificationFeedbackType> = {
  success: Haptics.NotificationFeedbackType.Success,
  error: Haptics.NotificationFeedbackType.Error,
  warning: Haptics.NotificationFeedbackType.Warning,
  info: Haptics.NotificationFeedbackType.Success,
};

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

interface ToastRowProps {
  toast: ToastItem;
  duration: number;
  onDismiss: (id: number) => void;
}

function ToastRow({ toast, duration, onDismiss }: ToastRowProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const progressBar = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  const IconComponent = VARIANT_ICON[toast.type] ?? VARIANT_ICON.info;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Trigger haptic feedback
    Haptics.notificationAsync(VARIANT_HAPTIC[toast.type]).catch(() => {});

    // Entrance animation with spring effect
    if (reduceMotion) {
      progress.setValue(1);
      translateY.setValue(0);
      scale.setValue(1);
    } else {
      Animated.parallel([
        Animated.spring(progress, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
        }),
        Animated.spring(scale, {
          toValue: 1,
          useNativeDriver: true,
          damping: 15,
          stiffness: 150,
        }),
      ]).start();
    }

    // Progress bar countdown
    Animated.timing(progressBar, {
      toValue: 0,
      duration: duration,
      useNativeDriver: false,
    }).start();
  }, [
    progress,
    translateY,
    scale,
    progressBar,
    duration,
    reduceMotion,
    toast.type,
  ]);

  const animatedStyle = useMemo<
    Animated.WithAnimatedValue<StyleProp<ViewStyle>>
  >(
    () => ({
      opacity: progress,
      transform: [{ translateY }, { scale }],
    }),
    [progress, translateY, scale],
  );

  // Swipe-to-dismiss gesture
  const swipeGesture = Gesture.Pan().onEnd((event) => {
    if (event.translationY < -30 || Math.abs(event.translationX) > 100) {
      // Dismiss on swipe up or horizontal swipe
      Animated.parallel([
        Animated.timing(progress, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -50,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => onDismiss(toast.id));
    }
  });

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View
        accessibilityRole="alert"
        style={animatedStyle}
        className={cx(
          "w-full overflow-hidden rounded-2xl shadow-xl",
          VARIANT_BG[toast.type] ?? VARIANT_BG.info,
        )}
      >
        <View className="flex-row items-center gap-3 px-4 py-3.5">
          <View className="w-6 h-6 items-center justify-center">
            <IconComponent size={22} color="white" strokeWidth={2.5} />
          </View>
          <View className="flex-1">
            {typeof toast.msg === "string" ? (
              <Text className="text-white text-sm font-semibold leading-5">
                {toast.msg}
              </Text>
            ) : (
              toast.msg
            )}
          </View>
          {toast.action ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                  () => {},
                );
                try {
                  toast.action?.onPress();
                } finally {
                  onDismiss(toast.id);
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-white/20 active:bg-white/30"
            >
              <Text className="text-white text-sm font-semibold">
                {toast.action.label}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Закрити"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(
                () => {},
              );
              onDismiss(toast.id);
            }}
            className="w-8 h-8 items-center justify-center rounded-full bg-white/10 active:bg-white/20"
          >
            <X size={16} color="white" strokeWidth={2.5} />
          </Pressable>
        </View>
        {/* Progress bar indicator - thicker and more visible */}
        <View className="h-1.5 bg-black/10 overflow-hidden">
          <Animated.View
            style={{
              width: progressBar.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
              height: "100%",
            }}
            className="bg-white/60 rounded-r-full"
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

export interface ToastContainerProps {
  /** Extra classes applied to the outer stack wrapper. */
  className?: string;
}

/** Track toast durations for progress bar */
const toastDurations = new Map<number, number>();

export function ToastContainer({ className }: ToastContainerProps) {
  const { toasts, dismiss } = useToast();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <GestureHandlerRootView
      style={{
        position: "absolute",
        top: insets.top,
        left: 0,
        right: 0,
        zIndex: 50,
      }}
    >
      <View
        accessibilityLiveRegion="polite"
        pointerEvents="box-none"
        className={cx("items-center px-4 pt-4", className)}
      >
        <View className="w-full max-w-md gap-2.5">
          {toasts.map((toast) => (
            <ToastRow
              key={toast.id}
              toast={toast}
              duration={toastDurations.get(toast.id) ?? 3500}
              onDismiss={dismiss}
            />
          ))}
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

// Hook to track durations for progress bar
export function useToastWithDuration() {
  const toast = useToast();
  const showWithDuration = useCallback(
    (
      msg: ReactNode,
      type: ToastType = "success",
      duration = 3500,
      action?: ToastAction,
    ) => {
      const id = toast.show(msg, type, duration, action);
      toastDurations.set(id, duration);
      // Cleanup after toast is dismissed
      setTimeout(() => toastDurations.delete(id), duration + 1000);
      return id;
    },
    [toast],
  );
  return { ...toast, show: showWithDuration };
}
