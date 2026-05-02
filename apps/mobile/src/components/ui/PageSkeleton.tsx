/**
 * Sergeant Design System — PageSkeleton (React Native)
 *
 * Pre-composed full-page loading skeletons for consistent loading states
 * across all screens. Provides ready-to-use templates for common page
 * layouts to ensure a polished loading experience.
 *
 * Features:
 * - Multiple variants for different page types (list, detail, dashboard, form)
 * - Respects safe area insets
 * - Consistent with app theming (light/dark mode)
 * - Reduced motion support inherited from base Skeleton component
 *
 * Usage:
 * ```tsx
 * // Full page loading state
 * if (isLoading) return <PageSkeleton variant="list" />;
 *
 * // With header
 * if (isLoading) return <PageSkeleton variant="detail" showHeader />;
 * ```
 */

import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonAvatar,
} from "./Skeleton";

export type PageSkeletonVariant =
  | "list"
  | "detail"
  | "dashboard"
  | "form"
  | "cards";

export interface PageSkeletonProps {
  /** Layout variant. Defaults to "list". */
  variant?: PageSkeletonVariant;
  /** Show a header skeleton. Defaults to true. */
  showHeader?: boolean;
  /** Number of items/cards to show. Defaults to 5 for list, 4 for cards. */
  itemCount?: number;
  /** Additional class for the container. */
  className?: string;
  /** Accessible loading label announced to assistive tech. */
  accessibilityLabel?: string;
  /** Test ID for screen-level loading audits. */
  testID?: string;
}

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

function HeaderSkeleton() {
  return (
    <View className="px-4 py-3 border-b border-line dark:border-cream-700">
      <View className="flex-row items-center justify-between">
        <Skeleton className="h-8 w-40 rounded-lg" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </View>
    </View>
  );
}

function ListItemSkeleton({ index }: { index: number }) {
  // Vary widths for more natural appearance
  const titleWidths = ["w-3/4", "w-2/3", "w-4/5", "w-1/2", "w-5/6"];
  const subtitleWidths = ["w-1/2", "w-2/5", "w-3/5", "w-1/3", "w-2/3"];

  return (
    <View className="flex-row items-center gap-3 px-4 py-3">
      <SkeletonAvatar size={44} />
      <View className="flex-1 gap-2">
        <SkeletonText className={titleWidths[index % titleWidths.length]} />
        <SkeletonText
          className={cx("h-2.5", subtitleWidths[index % subtitleWidths.length])}
        />
      </View>
      <Skeleton className="h-6 w-16 rounded-lg" />
    </View>
  );
}

function ListSkeleton({ itemCount }: { itemCount: number }) {
  return (
    <View className="flex-1">
      {/* Search bar skeleton */}
      <View className="px-4 py-3">
        <Skeleton className="h-11 w-full rounded-2xl" />
      </View>

      {/* List items */}
      <View>
        {Array.from({ length: itemCount }).map((_, i) => (
          <ListItemSkeleton key={i} index={i} />
        ))}
      </View>
    </View>
  );
}

function DetailSkeleton() {
  return (
    <View className="flex-1 px-4 py-4 gap-4">
      {/* Hero/Image area */}
      <Skeleton className="h-48 w-full rounded-2xl" />

      {/* Title and subtitle */}
      <View className="gap-2">
        <SkeletonText className="h-7 w-3/4" />
        <SkeletonText className="h-4 w-1/2" />
      </View>

      {/* Stats row */}
      <View className="flex-row gap-3 py-2">
        <View className="flex-1 items-center gap-1">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <SkeletonText className="h-3 w-12" />
        </View>
        <View className="flex-1 items-center gap-1">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <SkeletonText className="h-3 w-12" />
        </View>
        <View className="flex-1 items-center gap-1">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <SkeletonText className="h-3 w-12" />
        </View>
      </View>

      {/* Content paragraphs */}
      <View className="gap-2 py-2">
        <SkeletonText className="w-full" />
        <SkeletonText className="w-full" />
        <SkeletonText className="w-4/5" />
        <SkeletonText className="w-full" />
        <SkeletonText className="w-2/3" />
      </View>

      {/* Action button */}
      <Skeleton className="h-12 w-full rounded-2xl mt-4" />
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <View className="flex-1 px-4 py-4 gap-4">
      {/* Welcome banner */}
      <View className="flex-row items-center gap-3 py-2">
        <SkeletonAvatar size={48} />
        <View className="flex-1 gap-1">
          <SkeletonText className="h-5 w-32" />
          <SkeletonText className="h-3 w-48" />
        </View>
      </View>

      {/* Quick stats row */}
      <View className="flex-row gap-3">
        <View className="flex-1 bg-cream-100 dark:bg-cream-800 rounded-2xl p-4 gap-2">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <SkeletonText className="h-3 w-20" />
        </View>
        <View className="flex-1 bg-cream-100 dark:bg-cream-800 rounded-2xl p-4 gap-2">
          <Skeleton className="h-8 w-16 rounded-lg" />
          <SkeletonText className="h-3 w-20" />
        </View>
      </View>

      {/* Module cards */}
      <SkeletonCard lines={2} showAvatar className="mb-2" />
      <SkeletonCard lines={3} className="mb-2" />
      <SkeletonCard lines={2} showAvatar />
    </View>
  );
}

function FormSkeleton() {
  return (
    <View className="flex-1 px-4 py-4 gap-5">
      {/* Form title */}
      <View className="gap-1">
        <SkeletonText className="h-6 w-48" />
        <SkeletonText className="h-3 w-64" />
      </View>

      {/* Form fields */}
      {[1, 2, 3, 4].map((i) => (
        <View key={i} className="gap-2">
          <SkeletonText className="h-3.5 w-24" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </View>
      ))}

      {/* Submit button */}
      <Skeleton className="h-12 w-full rounded-2xl mt-4" />
    </View>
  );
}

function CardsSkeleton({ itemCount }: { itemCount: number }) {
  return (
    <View className="flex-1 px-4 py-4 gap-3">
      {Array.from({ length: itemCount }).map((_, i) => (
        <SkeletonCard
          key={i}
          lines={i % 2 === 0 ? 2 : 3}
          showAvatar={i % 3 === 0}
        />
      ))}
    </View>
  );
}

export function PageSkeleton({
  variant = "list",
  showHeader = true,
  itemCount,
  className,
  accessibilityLabel = "Завантаження сторінки",
  testID = "page-skeleton",
}: PageSkeletonProps) {
  const resolvedCount = itemCount ?? (variant === "cards" ? 4 : 5);

  return (
    <SafeAreaView
      className={cx("flex-1 bg-bg dark:bg-bg", className)}
      edges={["top"]}
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      {showHeader && <HeaderSkeleton />}

      {variant === "list" && <ListSkeleton itemCount={resolvedCount} />}
      {variant === "detail" && <DetailSkeleton />}
      {variant === "dashboard" && <DashboardSkeleton />}
      {variant === "form" && <FormSkeleton />}
      {variant === "cards" && <CardsSkeleton itemCount={resolvedCount} />}
    </SafeAreaView>
  );
}

/**
 * Inline loading state for smaller components
 */
export function InlineSkeleton({
  accessibilityLabel = "Завантаження секції",
  testID = "inline-skeleton",
}: {
  accessibilityLabel?: string;
  testID?: string;
} = {}) {
  return (
    <View
      className="flex-row items-center gap-3 py-2"
      testID={testID}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      <Skeleton className="h-10 w-10 rounded-full" />
      <View className="flex-1 gap-1.5">
        <SkeletonText className="w-3/4" />
        <SkeletonText className="w-1/2 h-2.5" />
      </View>
    </View>
  );
}

export default PageSkeleton;
