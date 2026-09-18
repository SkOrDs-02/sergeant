/**
 * Shared types and constants for the Hub Dashboard surface.
 *
 * Extracted from `HubDashboard.tsx` (T1 decomposition, Sprint 6).
 */

import type {
  DashboardDensity,
  DashboardModuleId,
  User,
} from "@sergeant/shared";

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export interface HubDashboardProps {
  onOpenModule: (module: string) => void;
  user: User | null;
  onShowAuth: () => void;
}

// ─────────────────────────────────────────────────────────────────────
// Density Tailwind class maps
// ─────────────────────────────────────────────────────────────────────

/**
 * Tailwind class lookup for dashboard density. Static literals (not template
 * strings) so the JIT picks them up at build time.
 */
export const DENSITY_OUTER_SPACE: Record<DashboardDensity, string> = {
  compact: "space-y-3",
  comfortable: "space-y-4",
  spacious: "space-y-5",
};

export const DENSITY_BENTO_GAP: Record<DashboardDensity, string> = {
  compact: "gap-2",
  comfortable: "gap-3",
  spacious: "gap-4",
};

// ─────────────────────────────────────────────────────────────────────
// Re-export aliases used by sibling modules
// ─────────────────────────────────────────────────────────────────────

export type { DashboardDensity, DashboardModuleId, User };
