/**
 * Sergeant Design System — Mobile UI Components
 *
 * Barrel export for all mobile UI primitives.
 * Import from '@/components/ui' for clean imports.
 *
 * UX Enhanced Components (Phase 1):
 * - Skeleton: Shimmer animation, SkeletonCard, SkeletonList
 * - Toast: Lucide icons, swipe-to-dismiss, progress bar
 * - EmptyState: Staggered animations, pre-configured variants
 * - AnimatedCounter: Smooth number transitions
 * - ProgressRing: SVG circular progress with Reanimated
 * - CelebrationModal: Confetti, haptic patterns, achievements
 * - AnimatedList: Staggered fade-in animations
 * - Tooltip: Long-press hints with auto-positioning
 */

// Core UI Components
export {
  BackButton,
  type BackButtonProps,
  type BackButtonVariant,
  type BackButtonSize,
} from "./BackButton";
export { Badge, type BadgeProps, type BadgeVariant } from "./Badge";
export { Banner, type BannerProps } from "./Banner";
export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./Button";
export {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
  type CardProps,
} from "./Card";
export {
  ConfirmDialog,
  ConfirmDialogProvider,
  useConfirm,
  type ConfirmDialogProps,
  type ConfirmDialogVariant,
} from "./ConfirmDialog";

export {
  FormField,
  FormSection,
  FormActions,
  type FormFieldProps,
  type FormSectionProps,
  type FormActionsProps,
} from "./FormField";

export {
  ProgressBar,
  ProgressCircle,
  ProgressSteps,
  type ProgressBarProps,
  type ProgressCircleProps,
  type ProgressStepsProps,
} from "./ProgressIndicator";
export { Input, type InputProps } from "./Input";
export { ListItem, type ListItemProps } from "./ListItem";
export { SectionHeading, type SectionHeadingProps } from "./SectionHeading";
export { Sheet, type SheetProps } from "./Sheet";
export { Stat, type StatProps } from "./Stat";
export { SwipeToAction, type SwipeToActionProps } from "./SwipeToAction";
export {
  Tabs,
  type TabsProps,
  type TabsItem,
  type TabsVariant,
  type TabsStyle,
  type TabsSize,
} from "./Tabs";

// UX Enhanced Components
export {
  Skeleton,
  SkeletonText,
  SkeletonAvatar,
  SkeletonCard,
  SkeletonList,
  type SkeletonProps,
  type SkeletonCardProps,
} from "./Skeleton";

export {
  PageSkeleton,
  InlineSkeleton,
  type PageSkeletonProps,
  type PageSkeletonVariant,
} from "./PageSkeleton";

export {
  LoadingOverlay,
  InlineLoader,
  FullPageLoader,
  type LoadingOverlayProps,
} from "./LoadingOverlay";

export {
  ToastProvider,
  ToastContainer,
  useToast,
  useToastWithDuration,
  type ToastType,
  type ToastAction,
  type ToastItem,
  type ToastApi,
  type ToastContainerProps,
} from "./Toast";

export {
  EmptyState,
  NoDataEmptyState,
  ErrorEmptyState,
  SearchEmptyState,
  type EmptyStateProps,
  type EmptyStateAction,
} from "./EmptyState";

export {
  AnimatedCounter,
  AnimatedPercentage,
  AnimatedCurrency,
  type AnimatedCounterProps,
} from "./AnimatedCounter";

export {
  ProgressRing,
  ProgressRingGroup,
  type ProgressRingProps,
  type ProgressRingVariant,
  type ProgressRingSize,
  type ProgressRingGroupItem,
} from "./ProgressRing";

export {
  CelebrationModal,
  useCelebration,
  type CelebrationModalProps,
  type CelebrationType,
  type ModuleTheme,
} from "./CelebrationModal";

export {
  AnimatedList,
  AnimatedListItem,
  AnimatedFadeIn,
  AnimatedSlideIn,
  AnimatedScale,
  type AnimatedListProps,
  type AnimatedListItemProps,
} from "./AnimatedList";

export {
  Tooltip,
  TooltipTrigger,
  TooltipLabel,
  type TooltipProps,
  type TooltipTriggerProps,
} from "./Tooltip";

// Phase 3 UX Components
export {
  StreakFlame,
  StreakBadge,
  type StreakFlameProps,
  type StreakFlameSize,
} from "./StreakFlame";

export {
  AnimatedCheckbox,
  HabitCheckbox,
  type AnimatedCheckboxProps,
  type CheckboxVariant,
  type CheckboxSize,
} from "./AnimatedCheckbox";

export {
  CustomRefreshControl,
  AnimatedRefreshIndicator,
  PullToRefreshHeader,
  useRefreshControl,
  usePullToRefresh,
  type PullToRefreshProps,
  type RefreshVariant,
} from "./PullToRefresh";

export {
  SwipeableRow,
  TransactionSwipeableRow,
  HabitSwipeableRow,
  commonActions,
  type SwipeableRowProps,
  type SwipeAction,
} from "./SwipeableRow";

export {
  CoachTip,
  CoachTipSpotlight,
  SmartCoachTip,
  useCoachTips,
  type CoachTipProps,
  type CoachTipSpotlightProps,
  type CoachTipVariant,
  type CoachTipPosition,
} from "./CoachTip";

export {
  FloatingActionButton,
  HubFAB,
  moduleActions,
  type FloatingActionButtonProps,
  type FABAction,
  type FABVariant,
  type FABSize,
} from "./FloatingActionButton";

export {
  KeyboardAccessory,
  AMOUNT_CHIPS_UAH,
  PORTION_CHIPS_GRAM,
  WEIGHT_CHIPS_KG,
  REP_CHIPS,
  WATER_CHIPS_ML,
  type KeyboardAccessoryProps,
  type QuickFillChip,
} from "./KeyboardAccessory";
