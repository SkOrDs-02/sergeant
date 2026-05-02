/**
 * Hub dashboard — per-module rendering config (icons, routes, colour
 * accents). The source of truth for ids and labels lives in
 * `@sergeant/shared/dashboard`; this file adds the mobile-only
 * view-model (Lucide icon, accent classes, deep-link route).
 */

import {
  Wallet,
  Dumbbell,
  CheckSquare,
  UtensilsCrossed,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import type { DashboardModuleId } from "@sergeant/shared";

/**
 * Valid Expo Router hrefs for each module's root tab. Literal strings
 * (not `as const` on the whole object) so expo-router's typed-href
 * inference picks them up correctly when passed to `router.push`.
 */
export const DASHBOARD_MODULE_ROUTES: Record<DashboardModuleId, string> = {
  finyk: "/(tabs)/finyk",
  fizruk: "/(tabs)/fizruk",
  routine: "/(tabs)/routine",
  nutrition: "/(tabs)/nutrition",
};

export interface DashboardModuleRenderConfig {
  /** User-facing short label rendered inside the row. */
  readonly label: string;
  /** Lucide icon component for the row's leading icon. */
  readonly Icon: LucideIcon;
  /** Icon color for the Lucide icon. */
  readonly iconColor: string;
  /** Tailwind class applied to the leading icon wrapper. */
  readonly iconBgClass: string;
  /** Tailwind class applied to the narrow accent bar on the left edge. */
  readonly accentClass: string;
  /** One-liner description rendered under the label. */
  readonly description: string;
}

/**
 * Presentation config per module. Kept minimal so the row component
 * stays trivially testable — anything dynamic (preview stats, signal
 * dots) flows through props.
 */
export const DASHBOARD_MODULE_RENDER: Record<
  DashboardModuleId,
  DashboardModuleRenderConfig
> = {
  finyk: {
    label: "Фінік",
    Icon: Wallet,
    iconColor: "#7c3aed",
    iconBgClass: "bg-brand-100",
    accentClass: "bg-finyk",
    description: "Транзакції та бюджети",
  },
  fizruk: {
    label: "Фізрук",
    Icon: Dumbbell,
    iconColor: "#0d9488",
    iconBgClass: "bg-teal-100",
    accentClass: "bg-fizruk",
    description: "Тренування та прогрес",
  },
  routine: {
    label: "Рутина",
    Icon: CheckSquare,
    iconColor: "#f97316",
    iconBgClass: "bg-coral-100",
    accentClass: "bg-routine",
    description: "Звички та щоденні цілі",
  },
  nutrition: {
    label: "Харчування",
    Icon: UtensilsCrossed,
    iconColor: "#84cc16",
    iconBgClass: "bg-lime-100",
    accentClass: "bg-nutrition",
    description: "КБЖВ та раціон",
  },
};

/** Modules rendered on the mobile dashboard. */
export const VISIBLE_DASHBOARD_MODULES: readonly DashboardModuleId[] = [
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
];
