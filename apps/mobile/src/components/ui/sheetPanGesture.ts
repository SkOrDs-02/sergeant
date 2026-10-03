import { Gesture } from "react-native-gesture-handler";
import { runOnJS, withSpring, type SharedValue } from "react-native-reanimated";

const SPRING_CONFIG = {
  damping: 20,
  stiffness: 200,
  mass: 0.5,
};

const DISMISS_THRESHOLD = 100;
const VELOCITY_THRESHOLD = 500;

export interface SheetPanGestureOptions {
  translateY: SharedValue<number>;
  windowHeight: number;
  disableGestureDismiss: boolean;
  reduceMotion: boolean;
  onDismiss: () => void;
}

export function createSheetPanGesture({
  translateY,
  windowHeight,
  disableGestureDismiss,
  reduceMotion,
  onDismiss,
}: SheetPanGestureOptions) {
  return Gesture.Pan()
    .enabled(!disableGestureDismiss && !reduceMotion)
    .onUpdate((event) => {
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
              runOnJS(onDismiss)();
            }
          },
        );
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });
}
