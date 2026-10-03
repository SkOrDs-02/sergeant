/**
 * Last validated: 2026-07-20
 * Status: Active
 *
 * Thin `@tanstack/react-virtual` wrapper replacing `react-virtuoso`
 * for fixed-height-ish lists (S10-T2 bundle cut).
 */

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@shared/lib/ui/cn";

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Estimated row height in px (used for initial layout). */
  estimateSize: number | ((index: number) => number);
  /** Fixed viewport height. Omit when using an external scroll parent. */
  height?: number | string;
  /** External scroll element (e.g. PullToRefresh scroll parent). */
  scrollElement?: HTMLElement | null;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
  getItemKey?: (index: number, item: T) => string | number;
  children: (item: T, index: number) => ReactNode;
}

export function VirtualList<T>({
  items,
  estimateSize,
  height,
  scrollElement,
  overscan = 8,
  className,
  style,
  getItemKey,
  children,
}: VirtualListProps<T>) {
  const internalRef = useRef<HTMLDivElement | null>(null);
  const getScrollElement = () => scrollElement ?? internalRef.current;

  // eslint-disable-next-line react-hooks/incompatible-library -- useVirtualizer returns measurement callbacks that React Compiler cannot safely memoize; this is a known @tanstack/react-virtual + React Compiler interop constraint.
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement,
    estimateSize:
      typeof estimateSize === "function" ? estimateSize : () => estimateSize,
    overscan,
    // Conditional spread avoids passing `getItemKey: undefined` which
    // @tanstack/react-virtual rejects under `exactOptionalPropertyTypes`.
    ...(getItemKey
      ? {
          getItemKey: (index: number) => {
            const item = items[index];
            return item === undefined ? index : getItemKey(index, item);
          },
        }
      : {}),
  });

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollElement ? undefined : internalRef}
      className={cn("overflow-y-auto", className)}
      style={{
        height: scrollElement ? undefined : height,
        ...style,
      }}
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (item === undefined) return null;
          return (
            <div
              key={virtualRow.key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {children(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
