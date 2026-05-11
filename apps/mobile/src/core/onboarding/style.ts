import type { DashboardModuleId } from "@sergeant/shared";

export function cx(
  ...classes: Array<string | false | null | undefined>
): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Emoji glyph per module id. Matches the glyphs used by the mobile
 * tab bar (`app/(tabs)/_layout.tsx`) and `DASHBOARD_MODULE_RENDER` on
 * the hub dashboard so onboarding, tab bar and status row all show
 * the same icon for a given module.
 */
export const CHIP_GLYPH: Record<DashboardModuleId, string> = {
  finyk: "💰",
  fizruk: "🏋",
  routine: "✅",
  nutrition: "🍽",
};
