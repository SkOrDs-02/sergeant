/**
 * Shared types and constants for the Hub Dashboard surface.
 *
 * Extracted from `HubDashboard.tsx` (T1 decomposition, Sprint 6).
 */

import type { DashboardModuleId, User } from "@sergeant/shared";

// ─────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────

export interface HubDashboardProps {
  onOpenModule: (module: string) => void;
  user: User | null;
  onShowAuth: () => void;
}

// ─────────────────────────────────────────────────────────────────────
// Re-export aliases used by sibling modules
// ─────────────────────────────────────────────────────────────────────

export type { DashboardModuleId, User };
