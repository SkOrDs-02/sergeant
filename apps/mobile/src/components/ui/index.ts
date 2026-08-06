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

export { Input, type InputProps } from "./Input";
export { SectionHeading, type SectionHeadingProps } from "./SectionHeading";
export { Sheet, type SheetProps } from "./Sheet";
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
  ToastProvider,
  ToastContainer,
  useToast,
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
  Tooltip,
  TooltipTrigger,
  TooltipLabel,
  type TooltipProps,
  type TooltipTriggerProps,
} from "./Tooltip";
