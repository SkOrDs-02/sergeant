/**
 * ProgressIndicator — unified progress visualization components.
 *
 * Variants:
 * - ProgressBar: Linear progress bar
 * - ProgressCircle: Circular progress indicator
 * - ProgressSteps: Step-based progress (1 of N)
 *
 * All variants support:
 * - Animated transitions
 * - Customizable colors via theme
 * - Accessibility announcements
 * - Indeterminate mode (where applicable)
 */
import { useEffect } from "react";
import { Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { Check } from "lucide-react-native";

import { colors, semanticColors, brandColors } from "@/theme";

// ============================================================================
// ProgressBar
// ============================================================================

export interface ProgressBarProps {
  /** Progress value between 0 and 100 */
  value: number;
  /** Maximum value (default 100) */
  max?: number;
  /** Height in pixels */
  height?: number;
  /** Progress bar color */
  color?: string;
  /** Track background color */
  trackColor?: string;
  /** Show percentage label */
  showLabel?: boolean;
  /** Label position */
  labelPosition?: "inside" | "right" | "top";
  /** Indeterminate mode (animated) */
  indeterminate?: boolean;
  /** Additional className */
  className?: string;
  /** Test ID */
  testID?: string;
}

export function ProgressBar({
  value,
  max = 100,
  height = 8,
  color = semanticColors.success,
  trackColor = brandColors.cream[200],
  showLabel = false,
  labelPosition = "right",
  indeterminate = false,
  className = "",
  testID,
}: ProgressBarProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const indeterminatePosition = useSharedValue(0);

  const normalizedValue = Math.min(Math.max(value, 0), max);
  const percentage = Math.round((normalizedValue / max) * 100);

  useEffect(() => {
    if (indeterminate) {
      indeterminatePosition.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1000 }),
          withTiming(0, { duration: 1000 }),
        ),
        -1,
        false,
      );
    } else {
      progress.value = reduceMotion
        ? percentage
        : withSpring(percentage, { damping: 15, stiffness: 100 });
    }
  }, [
    percentage,
    indeterminate,
    reduceMotion,
    indeterminatePosition,
    progress,
  ]);

  const progressStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  const indeterminateStyle = useAnimatedStyle(() => ({
    width: "30%",
    left: `${indeterminatePosition.value * 70}%`,
  }));

  const renderLabel = () => {
    if (!showLabel) return null;
    return (
      <Text className="text-xs font-medium text-fg-muted">{percentage}%</Text>
    );
  };

  return (
    <View
      className={`${className}`}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max, now: normalizedValue }}
      accessibilityLabel={`Прогрес ${percentage} відсотків`}
    >
      {labelPosition === "top" && showLabel && (
        <View className="mb-1">{renderLabel()}</View>
      )}

      <View className="flex-row items-center gap-2">
        <View
          className="flex-1 rounded-full overflow-hidden"
          style={{ height, backgroundColor: trackColor }}
        >
          <Animated.View
            className="h-full rounded-full"
            style={[
              { backgroundColor: color },
              indeterminate ? indeterminateStyle : progressStyle,
              indeterminate && { position: "absolute" },
            ]}
          />
        </View>

        {labelPosition === "right" && showLabel && renderLabel()}
      </View>
    </View>
  );
}

// ============================================================================
// ProgressCircle
// ============================================================================

export interface ProgressCircleProps {
  /** Progress value between 0 and 100 */
  value: number;
  /** Circle size in pixels */
  size?: number;
  /** Stroke width */
  strokeWidth?: number;
  /** Progress color */
  color?: string;
  /** Track color */
  trackColor?: string;
  /** Show percentage in center */
  showLabel?: boolean;
  /** Custom center content */
  children?: React.ReactNode;
  /** Test ID */
  testID?: string;
}

export function ProgressCircle({
  value,
  size = 64,
  strokeWidth = 6,
  color = semanticColors.success,
  trackColor = brandColors.cream[200],
  showLabel = true,
  children,
  testID,
}: ProgressCircleProps) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);

  const percentage = Math.min(Math.max(Math.round(value), 0), 100);
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  useEffect(() => {
    progress.value = reduceMotion
      ? percentage
      : withSpring(percentage, { damping: 15, stiffness: 100 });
  }, [percentage, reduceMotion, progress]);

  const strokeDashoffset = circumference * (1 - percentage / 100);

  return (
    <View
      style={{ width: size, height: size }}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: percentage }}
      accessibilityLabel={`Прогрес ${percentage} відсотків`}
    >
      <Svg
        width={size}
        height={size}
        style={{ transform: [{ rotate: "-90deg" }] }}
      >
        {/* Track */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
        />
      </Svg>

      {/* Center content */}
      <View className="absolute inset-0 items-center justify-center">
        {children ??
          (showLabel && (
            <Text className="text-sm font-bold text-fg">{percentage}%</Text>
          ))}
      </View>
    </View>
  );
}

// ============================================================================
// ProgressSteps
// ============================================================================

export interface ProgressStepsProps {
  /** Current step (1-indexed) */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Step labels (optional) */
  labels?: string[];
  /** Active step color */
  activeColor?: string;
  /** Completed step color */
  completedColor?: string;
  /** Inactive step color */
  inactiveColor?: string;
  /** Orientation */
  orientation?: "horizontal" | "vertical";
  /** Show step numbers */
  showNumbers?: boolean;
  /** Size of step indicators */
  size?: "sm" | "md" | "lg";
  /** Test ID */
  testID?: string;
}

const STEP_SIZES = {
  sm: { indicator: 24, connector: 2, fontSize: 10 },
  md: { indicator: 32, connector: 3, fontSize: 12 },
  lg: { indicator: 40, connector: 4, fontSize: 14 },
};

export function ProgressSteps({
  currentStep,
  totalSteps,
  labels,
  activeColor = colors.accent,
  completedColor = semanticColors.success,
  inactiveColor = brandColors.cream[300],
  orientation = "horizontal",
  showNumbers = true,
  size = "md",
  testID,
}: ProgressStepsProps) {
  const sizeConfig = STEP_SIZES[size];
  const isHorizontal = orientation === "horizontal";

  const renderStep = (stepNumber: number) => {
    const isCompleted = stepNumber < currentStep;
    const isActive = stepNumber === currentStep;
    const backgroundColor = isCompleted
      ? completedColor
      : isActive
        ? activeColor
        : inactiveColor;

    return (
      <View
        key={stepNumber}
        className={`items-center ${isHorizontal ? "" : "flex-row gap-3"}`}
      >
        {/* Step indicator */}
        <View
          style={{
            width: sizeConfig.indicator,
            height: sizeConfig.indicator,
            borderRadius: sizeConfig.indicator / 2,
            backgroundColor,
          }}
          className="items-center justify-center"
          accessibilityRole="text"
          accessibilityLabel={`Крок ${stepNumber} з ${totalSteps}${labels?.[stepNumber - 1] ? `: ${labels[stepNumber - 1]}` : ""}`}
        >
          {isCompleted ? (
            <Check
              size={sizeConfig.indicator * 0.5}
              color="#ffffff"
              strokeWidth={3}
            />
          ) : showNumbers ? (
            <Text
              style={{ fontSize: sizeConfig.fontSize }}
              className={`font-semibold ${isActive ? "text-white" : "text-fg-muted"}`}
            >
              {stepNumber}
            </Text>
          ) : null}
        </View>

        {/* Label */}
        {labels?.[stepNumber - 1] && (
          <Text
            className={`text-xs mt-1 ${isActive ? "text-fg font-medium" : "text-fg-muted"} ${!isHorizontal ? "flex-1" : ""}`}
            numberOfLines={1}
          >
            {labels[stepNumber - 1]}
          </Text>
        )}
      </View>
    );
  };

  const renderConnector = (afterStep: number) => {
    const isCompleted = afterStep < currentStep;
    return (
      <View
        key={`connector-${afterStep}`}
        style={{
          [isHorizontal ? "height" : "width"]: sizeConfig.connector,
          [isHorizontal ? "flex" : "height"]: isHorizontal ? 1 : 20,
          backgroundColor: isCompleted ? completedColor : inactiveColor,
          marginHorizontal: isHorizontal ? 4 : 0,
          marginVertical: isHorizontal ? 0 : 4,
          alignSelf: isHorizontal ? "center" : undefined,
          marginLeft: !isHorizontal
            ? sizeConfig.indicator / 2 - sizeConfig.connector / 2
            : undefined,
        }}
      />
    );
  };

  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <View
      className={`${isHorizontal ? "flex-row items-center" : "gap-1"}`}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: totalSteps, now: currentStep }}
    >
      {steps.map((step, index) => (
        <View
          key={step}
          className={`${isHorizontal ? "flex-row items-center" : ""} ${index < steps.length - 1 && isHorizontal ? "flex-1" : ""}`}
        >
          {renderStep(step)}
          {index < steps.length - 1 && renderConnector(step)}
        </View>
      ))}
    </View>
  );
}

export default ProgressBar;
