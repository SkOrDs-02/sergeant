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
  withTiming,
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

export function Sheet({
  open,
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
}: SheetProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const savedScrollPosition = useRef<number>(0);

  // Reanimated shared values
  const translateY = useSharedValue(0);
  const scrimOpacity = useSharedValue(0);

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

  // Reset animation values when sheet opens and restore scroll position
  useEffect(() => {
    if (open) {
      translateY.value = 0;
      scrimOpacity.value = withTiming(1, { duration: 200 });
      // Restore scroll position after a small delay to let the ScrollView render
      if (rememberScrollPosition && savedScrollPosition.current > 0) {
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            y: savedScrollPosition.current,
            animated: false,
          });
        }, 100);
      }
    }
  }, [open, translateY, scrimOpacity, rememberScrollPosition]);

  // Save scroll position when scrolling
  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (rememberScrollPosition) {
        savedScrollPosition.current = event.nativeEvent.contentOffset.y;
      }
    },
    [rememberScrollPosition],
  );

  // Percentage `maxHeight` on a RN View resolves against its parent's
  // height. Our panel sits inside a `KeyboardAvoidingView` that wraps
  // its content (no flex:1 / explicit height), so a `"90%"` string
  // would resolve against the panel's own content — not the viewport.
  // Mirror the web `max-h-[90vh]` by computing an absolute pixel value
  // off `useWindowDimensions()`.
  const heightFraction = Math.max(0.1, Math.min(1, maxHeight));
  const maxPanelHeight = Math.round(windowHeight * heightFraction);

  const handleClose = () => {
    scrimOpacity.value = withTiming(0, { duration: 150 });
    onClose();
  };

  // Animated styles - must be called unconditionally before any early returns
  const animatedPanelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedScrimStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(
        translateY.value,
        [0, DISMISS_THRESHOLD * 2],
        [0.4, 0],
        Extrapolation.CLAMP,
      ) * scrimOpacity.value,
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

  // Gesture handler for swipe-to-dismiss
  const panGesture = Gesture.Pan()
    .enabled(!disableGestureDismiss && !reduceMotion)
    .onUpdate((event) => {
      // Only allow dragging down (positive Y translation)
      if (event.translationY > 0) {
        translateY.value = event.translationY;
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.translationY > DISMISS_THRESHOLD ||
        event.velocityY > VELOCITY_THRESHOLD;

      if (shouldDismiss) {
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
        // Snap back to original position
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  // Bail out before rendering the Modal to keep children fully
  // unmounted while closed. Matches the web guard (`if (!open) return
  // null;`) and avoids keeping child state alive between opens.
  if (!open) return null;

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
        {/* Animated Scrim */}
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
                {/* Drag Indicator */}
                <View className="flex items-center pt-3 pb-1">
                  <GestureDetector gesture={panGesture}>
                    <Animated.View
                      style={[animatedIndicatorStyle, { borderRadius: 3 }]}
                      accessibilityLabel="Потягніть вниз щоб закрити"
                      accessibilityHint="Проведіть пальцем вниз для закриття панелі"
                    />
                  </GestureDetector>
                </View>

                {/* Header */}
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

                {/* Scrollable Content */}
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

                {/* Sticky Footer */}
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
