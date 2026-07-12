/**
 * Sergeant Design System — module-layout primitives.
 *
 * Shared shell for module entrypoints (Фінік / Фізрук / Рутина /
 * Харчування). Import from `@shared/components/layout` to keep deep
 * paths stable and autocomplete focused on the public surface.
 */

export { ModuleShell } from "./ModuleShell";
export type { ModuleShellProps } from "./ModuleShell";

export { ModuleAccentProvider, useModuleAccent } from "./ModuleAccentProvider";
export type { ModuleAccentProviderProps } from "./ModuleAccentProvider";

export {
  ModuleHeader,
  ModuleHeaderAssistantButton,
  ModuleHeaderBackButton,
  ModuleHeaderChevronButton,
  ModuleHeaderHubButton,
  ModuleHeaderIconButton,
  ModuleHeaderSettingsButton,
} from "./ModuleHeader";
export type {
  ModuleHeaderAssistantButtonProps,
  ModuleHeaderBackButtonProps,
  ModuleHeaderHubButtonProps,
  ModuleHeaderIconButtonProps,
  ModuleHeaderProps,
  ModuleHeaderSettingsButtonProps,
} from "./ModuleHeader";

export { ModuleSettingsDrawer } from "./ModuleSettingsDrawer";
export type { ModuleSettingsDrawerProps } from "./ModuleSettingsDrawer";

export { StorageErrorBanner } from "./StorageErrorBanner";
export type { StorageErrorBannerProps } from "./StorageErrorBanner";

// Sergeant v2 redesign (2026-05, PR-5) — mesh-gradient surface used by
// HubHomeView + 4 module shells (PR-6). Auto-degrades to solid base
// on `html.hc` + `prefers-reduced-motion: reduce`.
export { MeshBackground } from "./MeshBackground";
export type { MeshBackgroundProps } from "./MeshBackground";
