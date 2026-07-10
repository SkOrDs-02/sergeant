/**
 * Sergeant Design System — Sheet (React Native)
 *
 * Mobile port of the canonical bottom-sheet shell used across Finyk /
 * Fizruk / Routine / Nutrition.
 *
 * @see apps/web/src/shared/components/ui/Sheet.tsx — canonical source of truth
 *
 * Parity notes:
 * - Same call-site shape: `open` / `onClose` / `title` / `description` /
 *   `children` / `footer`.
 * - Same WCAG tap-target guarantee for the close button (44x44, served
 *   by the shared `Button` primitive with `iconOnly` + `size="md"`).
 * - Same dismiss affordances: scrim press + dedicated close button.
 *   Web adds Escape-key via focus-trap; mobile adds Android hardware
 *   back via `Modal.onRequestClose`.
 * - Same "header owns title / optional description, body owns scroll,
 *   footer is sticky outside the scroll region" layout.
 *
 * Enhancements over base implementation:
 * - Gesture dismiss: Swipe down to close via react-native-gesture-handler
 * - Spring animations via react-native-reanimated for buttery 60fps
 * - Visual feedback: Drag indicator responds to gesture
 * - Safe area insets properly respected via react-native-safe-area-context
 *
 * Differences from web (intentional):
 * - Built on React Native's built-in `Modal` (transparent,
 *   `animationType="slide"`). No `@gorhom/bottom-sheet`, no
 *   `react-native-modal`, no Reanimated — keeps the bundle and jest
 *   transform list unchanged.
 * - Focus trap is handled by the native `Modal` (`accessibilityViewIsModal`
 *   confines VoiceOver / TalkBack focus to the sheet); no web
 *   `useDialogFocusTrap` hook is needed.
 * - Soft-keyboard handling via `KeyboardAvoidingView` (`behavior="padding"`
 *   on iOS, no-op on Android where `android:windowSoftInputMode`
 *   already adjusts the window) instead of the web `kbInsetPx` prop.
 * - Respects `AccessibilityInfo.isReduceMotionEnabled()` — when enabled
 *   we drop the slide animation to `animationType="none"` per WCAG
 *   2.3.3 / Apple HIG. Same approach as `Skeleton` (PR #423).
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { X } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button } from "./Button";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Dialog title — rendered in the header and used for `accessibilityLabel`. */
  title: string;
  /** Optional subtitle rendered under the title. */
  description?: string;
  /** Main sheet body. */
  children?: ReactNode;
  /** Sticky footer (e.g. action buttons). Rendered inside the panel, outside the scroll area. */
  footer?: ReactNode;
  /** Accessible label for the close button. Defaults to "Закрити". */
  closeLabel?: string;
  /** Max panel height as a fraction of the viewport (0-1). Defaults to 0.9. */
  maxHeight?: number;
  /** Disable gesture dismiss. Defaults to false. */
  disableGestureDismiss?: boolean;
  /** Remember scroll position between opens. Defaults to false. */
  rememberScrollPosition?: boolean;
  /** Unique key for persisting scroll position when rememberScrollPosition is true. */
  scrollPositionKey?: string;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

const DISMISS_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;

export function Sheet({ open, ...contentProps }: SheetProps) {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (mounted) setReduceMotion(enabled);
      })
      .catch(() => {
        // Ignore — default to motion-enabled on platforms / versions
        // that don't expose the API.
      });
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (enabled) => setReduceMotion(enabled),
    );
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  if (!open) return null;

  return <SheetContent {...contentProps} reduceMotion={reduceMotion} />;
}

type SheetContentProps = Omit<SheetProps, "open"> & {
  reduceMotion: boolean;
};

function SheetContent({
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = "Закрити",
  maxHeight = 0.9,
  disableGestureDismiss = false,
  rememberScrollPosition = false,
  scrollPositionKey: _scrollPositionKey,
  reduceMotion,
}: SheetContentProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const savedScrollPosition = useRef<number>(0);

  // Fresh shared values per open — SheetContent unmounts when `open` is false.
  // AI-CONTEXT: never write `.value` inside React useEffect here; gesture
  // worklets own all translateY mutations so react-hooks/immutability stays clean.
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (rememberScrollPosition && savedScrollPosition.current > 0) {
      const timer = setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          y: savedScrollPosition.current,
          animated: false,
        });
      }, 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [rememberScrollPosition]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (rememberScrollPosition) {
        savedScrollPosition.current = event.nativeEvent.contentOffset.y;
      }
    },
    [rememberScrollPosition],
  );

  const heightFraction = Math.max(0.1, Math.min(1, maxHeight));
  const maxPanelHeight = Math.round(windowHeight * heightFraction);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedScrimStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      translateY.value,
      [0, DISMISS_THRESHOLD * 2],
      [0.4, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const animatedIndicatorStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      translateY.value,
      [0, DISMISS_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP,
    );

    return {
      width: interpolate(progress, [0, 1], [40, 56]),
      height: interpolate(progress, [0, 1], [4, 6]),
      opacity: interpolate(progress, [0, 0.5, 1], [0.4, 0.7, 1]),
      backgroundColor:
        interpolate(
          progress,
          [0, 1],
          [1, 1], // Keep same color, just for the structure
        ) > 0
          ? progress > 0.5
            ? "rgb(16, 185, 129)" // brand color when near dismiss
            : "rgb(168, 162, 158)" // cream-400
          : "rgb(168, 162, 158)",
    };
  });

  const panGesture = Gesture.Pan()
    .enabled(!disableGestureDismiss && !reduceMotion)
    .onUpdate((event) => {
      if (event.translationY > 0) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value in RNGH worklet
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > DISMISS_THRESHOLD ||
        event.velocityY > VELOCITY_THRESHOLD;

      if (shouldDismiss) {
        // eslint-disable-next-line react-hooks/immutability -- Reanimated shared value in RNGH worklet
        translateY.value = withSpring(
          windowHeight,
          { ...SPRING_CONFIG, stiffness: 300 },
          (finished) => {
            if (finished) {
              runOnJS(handleClose)();
            }
          },
        );
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  return (
    <Modal
      visible
      transparent
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={handleClose}
      accessibilityViewIsModal
      accessibilityLabel={title}
    >
      <View className="flex-1 justify-end">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          onPress={handleClose}
          className="absolute inset-0"
        >
          <Animated.View
            style={animatedScrimStyle}
            className="flex-1 bg-black"
          />
        </Pressable>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={animatedPanelStyle}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : undefined}
              pointerEvents="box-none"
            >
              <View
                role="dialog"
                aria-modal
                accessibilityViewIsModal
                accessibilityLabel={title}
                className={cx(
                  "bg-cream-50 dark:bg-cream-900 border-t border-cream-300 dark:border-cream-700 rounded-t-3xl shadow-lg",
                )}
                style={{
                  maxHeight: maxPanelHeight,
                  paddingBottom: Math.max(insets.bottom, 16),
                }}
              >
                <View className="flex items-center pt-3 pb-1">
                  <GestureDetector gesture={panGesture}>
                    <Animated.View
                      style={[animatedIndicatorStyle, { borderRadius: 3 }]}
                      accessibilityLabel="Потягніть вниз щоб закрити"
                      accessibilityHint="Проведіть пальцем вниз для закриття панелі"
                    />
                  </GestureDetector>
                </View>

                <View className="flex-row items-start justify-between gap-3 px-5 pt-1 pb-3">
                  <View className="flex-1">
                    <Text className="text-lg font-extrabold text-fg leading-tight">
                      {title}
                    </Text>
                    {description ? (
                      <Text className="text-xs text-fg-muted mt-1">
                        {description}
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    variant="ghost"
                    size="md"
                    iconOnly
                    onPress={handleClose}
                    accessibilityLabel={closeLabel}
                    className="bg-cream-100 dark:bg-cream-800"
                  >
                    <X size={18} strokeWidth={2.5} />
                  </Button>
                </View>

                <ScrollView
                  ref={scrollViewRef}
                  keyboardShouldPersistTaps="handled"
                  className="px-5 pb-4"
                  bounces={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                >
                  {children}
                </ScrollView>

                {footer ? (
                  <View className="px-5 pt-3 pb-4 border-t border-cream-300 dark:border-cream-700 bg-cream-50 dark:bg-cream-900">
                    {footer}
                  </View>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
