/**
 * Sergeant Design System — UI primitives barrel.
 *
 * Prefer importing from `@shared/components/ui` instead of deep paths so
 * renames stay cheap and IDE autocomplete surfaces the full API:
 *
 *   import { Card, Button, IconButton, Badge } from "@shared/components/ui";
 *
 * Deep imports (`@shared/components/ui/Card`) still work and remain the
 * recommended pattern for large files where tree-shaking clarity matters.
 */

export { Badge } from "./Badge";
export type { BadgeProps, BadgeSize, BadgeTone, BadgeVariant } from "./Badge";

export { Banner } from "./Banner";
export type { BannerProps, BannerVariant } from "./Banner";

export { Button } from "./Button";
export type { ButtonProps, ButtonSize, ButtonVariant } from "./Button";

export { IconButton } from "./IconButton";
export type { IconButtonProps } from "./IconButton";

export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./Card";
export type {
  CardPadding,
  CardProps,
  CardRadius,
  CardTitleProps,
  CardVariant,
} from "./Card";

export { Avatar } from "./Avatar";
export type { AvatarProps, AvatarSize, AvatarStatus } from "./Avatar";

export { EmptyState, ModuleEmptyState } from "./EmptyState";
export type { EmptyStateProps, ModuleEmptyStateProps } from "./EmptyState";

export {
  FeatureSpotlight,
  useResetSpotlight,
  useSpotlightDismissed,
} from "./FeatureSpotlight";
export type { FeatureSpotlightProps } from "./FeatureSpotlight";

export {
  KeyboardShortcutsModal,
  useKeyboardShortcutsModal,
  ShortcutRegistryProvider,
  ShortcutRegistryContext,
  useRegisterShortcuts,
} from "./KeyboardShortcutsModal";
export type { KeyboardShortcut } from "./KeyboardShortcutsModal";

export {
  AnimatedNumber,
  AnimatedCurrency,
  AnimatedPercent,
} from "./AnimatedNumber";
export type {} from "./AnimatedNumber";

export { StreakProtection, useStreakRiskCheck } from "./StreakProtection";
export type { StreakProtectionProps } from "./StreakProtection";

export { QuickActionsMenu } from "./QuickActionsMenu";
export type { QuickAction } from "./QuickActionsMenu";

export { PageTransition } from "./PageTransition";
export type { TransitionDirection } from "./PageTransition";

export { PullToRefresh } from "./PullToRefresh";
export type { PullToRefreshProps, PullToRefreshVariant } from "./PullToRefresh";
export { PullToRefreshIndicator } from "./PullToRefreshIndicator";
export type { PullToRefreshIndicatorProps } from "./PullToRefreshIndicator";

export {
  AccentColorPicker,
  AccentColorPickerCard,
  useAccentColor,
} from "./AccentColorPicker";
export type { AccentColor } from "./AccentColorPicker";

export { FormField, Label } from "./FormField";
export type { FormFieldProps, LabelProps } from "./FormField";

export { Icon, ICON_NAMES } from "./Icon";
export type { IconName, IconProps } from "./Icon";

export { Input, Textarea } from "./Input";
export type {
  InputProps,
  InputSize,
  InputVariant,
  TextareaProps,
} from "./Input";

export { Prose } from "./Prose";
export type { ProseProps, ProseVariant } from "./Prose";

export { SectionHeader, SectionHeading } from "./SectionHeading";
export type {
  SectionHeadingProps,
  SectionHeadingSize,
  SectionHeadingVariant,
} from "./SectionHeading";

export { Segmented } from "./Segmented";
export type {
  SegmentedItem,
  SegmentedProps,
  SegmentedSize,
  SegmentedStyle,
  SegmentedVariant,
} from "./Segmented";

export { Select } from "./Select";
export type { SelectProps, SelectSize, SelectVariant } from "./Select";

export { Popover, PopoverDivider, PopoverItem } from "./Popover";
export type {
  PopoverItemProps,
  PopoverPlacement,
  PopoverProps,
  PopoverRole,
} from "./Popover";

export { ProgressRing } from "./ProgressRing";
export type {
  ProgressRingProps,
  ProgressRingSize,
  ProgressRingVariant,
} from "./ProgressRing";

export {
  Skeleton,
  SkeletonText,
  SkeletonTransactionRow,
  SkeletonBudgetBar,
  SkeletonHabitRow,
  SkeletonWorkoutSet,
  SkeletonMealCard,
} from "./Skeleton";
export type { SkeletonProps } from "./Skeleton";

export { SkeletonCard, SkeletonList } from "./SkeletonCard";
export type { SkeletonCardProps, SkeletonListProps } from "./SkeletonCard";

export { DataState } from "./DataState";
export type { DataStateProps, DataStateQueryLike } from "./DataState";

export { SkipLink } from "./SkipLink";
export type { SkipLinkProps } from "./SkipLink";

export { Spinner } from "./Spinner";
export type { SpinnerProps, SpinnerSize } from "./Spinner";

export { Switch } from "./Switch";
export type { SwitchProps } from "./Switch";

export { Stat } from "./Stat";
export type { StatProps, StatSize, StatVariant } from "./Stat";

export { Tabs } from "./Tabs";
export type {
  TabItem,
  TabsProps,
  TabsSize,
  TabsStyle,
  TabsVariant,
} from "./Tabs";

export { ToastContainer } from "./Toast";

export { Tooltip } from "./Tooltip";
export type { TooltipPlacement, TooltipProps, TooltipSize } from "./Tooltip";

export type { FormVariant, SmallMediumLarge } from "./types";

export {
  CelebrationModal,
  MiniSuccess,
  useCelebration,
} from "./CelebrationModal";
export type {
  CelebrationModalProps,
  CelebrationType,
  MiniSuccessProps,
  ModuleTheme,
} from "./CelebrationModal";

export { StreakCelebration, useStreakCelebration } from "./StreakCelebration";
export type { StreakCelebrationProps } from "./StreakCelebration";

export { AnimatedCheckbox, HabitCheckbox } from "./AnimatedCheckbox";
export type {
  AnimatedCheckboxProps,
  CheckboxSize,
  CheckboxVariant,
  HabitCheckboxProps,
} from "./AnimatedCheckbox";

export { StreakFlame, StreakBadge } from "./StreakFlame";
export type {
  StreakFlameProps,
  StreakFlameSize,
  StreakBadgeProps,
} from "./StreakFlame";

export {
  AnimatedList,
  AnimatedFadeIn,
  AnimatedSlideIn,
  AnimatedScale,
} from "./AnimatedList";
export type {
  AnimatedListProps,
  AnimatedFadeInProps,
  AnimationStyle,
} from "./AnimatedList";

export { FloatingActionButton } from "./FloatingActionButton";
export type {
  FloatingActionButtonProps,
  FABAction,
  FABSize,
  FABVariant,
} from "./FloatingActionButton";

export {
  KeyboardAccessory,
  AMOUNT_CHIPS_UAH,
  PORTION_CHIPS_GRAM,
  WEIGHT_CHIPS_KG,
  REP_CHIPS,
  WATER_CHIPS_ML,
} from "./KeyboardAccessory";
export type {
  KeyboardAccessoryProps,
  QuickFillChip,
} from "./KeyboardAccessory";

export {
  ScreenReaderAnnouncerProvider,
  useAnnounce,
} from "./ScreenReaderAnnouncer";
