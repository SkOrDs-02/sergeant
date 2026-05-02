/**
 * SpotlightQueue — Coordinates multiple FeatureSpotlight instances
 *
 * Only one spotlight should appear at a time. This context provider
 * manages a priority queue so spotlights display sequentially rather
 * than stacking on top of each other.
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";

interface QueueSlot {
  id: string;
  priority: number;
  timestamp: number;
}

interface SpotlightQueueContextValue {
  /** Request a slot in the queue. Returns slot ID for release. */
  requestSlot: (id: string, priority?: number) => string;
  /** Release a slot when spotlight is dismissed. */
  releaseSlot: (slotId: string) => void;
  /** Check if this spotlight ID is currently at the front of the queue. */
  isMyTurn: (id: string) => boolean;
  /** Check if any spotlight is currently active (for HintsOrchestrator). */
  isAnyActive: () => boolean;
}

const SpotlightQueueContext = createContext<SpotlightQueueContextValue | null>(
  null,
);

export function SpotlightQueueProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueSlot[]>([]);

  const requestSlot = useCallback((id: string, priority = 0): string => {
    const slotId = `${id}-${Date.now()}`;
    setQueue((prev) => {
      // Don't add duplicate IDs
      if (prev.some((slot) => slot.id === id)) {
        return prev;
      }
      const newSlot: QueueSlot = {
        id,
        priority,
        timestamp: Date.now(),
      };
      // Sort by priority (higher first), then by timestamp (earlier first)
      return [...prev, newSlot].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.timestamp - b.timestamp;
      });
    });
    return slotId;
  }, []);

  const releaseSlot = useCallback((slotId: string) => {
    const id = slotId.split("-").slice(0, -1).join("-");
    setQueue((prev) => prev.filter((slot) => slot.id !== id));
  }, []);

  const isMyTurn = useCallback(
    (id: string): boolean => {
      if (queue.length === 0) return false;
      return queue[0].id === id;
    },
    [queue],
  );

  const isAnyActive = useCallback((): boolean => {
    return queue.length > 0;
  }, [queue]);

  const value = useMemo(
    () => ({
      requestSlot,
      releaseSlot,
      isMyTurn,
      isAnyActive,
    }),
    [requestSlot, releaseSlot, isMyTurn, isAnyActive],
  );

  return (
    <SpotlightQueueContext.Provider value={value}>
      {children}
    </SpotlightQueueContext.Provider>
  );
}

/**
 * Hook to access the spotlight queue.
 * Returns no-op functions if used outside provider (graceful degradation).
 */
export function useSpotlightQueue(): SpotlightQueueContextValue {
  const ctx = useContext(SpotlightQueueContext);

  // Graceful fallback if no provider — spotlight works standalone
  if (!ctx) {
    return {
      requestSlot: (id: string) => id,
      releaseSlot: () => {},
      isMyTurn: () => true,
      isAnyActive: () => false,
    };
  }

  return ctx;
}
