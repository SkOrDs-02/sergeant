/**
 * Shared SVG icon system.
 *
 * Centralizes the inline SVGs that appear in 5+ places across the app. Usage:
 *
 *     import { Icon } from "@shared/components/ui";
 *     <Icon name="chevron-right" size={18} />
 *
 * Adding a new icon: append it to the appropriate `Icon.paths.*.tsx`
 * sibling file (system / status / domain / content) and export the path
 * map. Initiative 0001 Phase 2 split the original 660-LOC monolith into
 * cohesive groups so each file stays under 200 LOC and reads as a
 * focused glyph atlas. The merged map is built once at module-init time;
 * `IconName` derives from it so all callers stay strongly typed.
 */

import type { ReactNode, SVGAttributes } from "react";
import { SYSTEM_PATHS } from "./Icon.paths.system";
import { STATUS_PATHS } from "./Icon.paths.status";
import { DOMAIN_PATHS } from "./Icon.paths.domain";
import { CONTENT_PATHS } from "./Icon.paths.content";

const PATHS = {
  ...SYSTEM_PATHS,
  ...STATUS_PATHS,
  ...DOMAIN_PATHS,
  ...CONTENT_PATHS,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

/**
 * Tight 5-step scale (matches the Tailwind text-xs/sm/base/lg/xl ramp so an
 * icon and its adjacent label visually align without ad-hoc numeric tweaks).
 * Numeric `size` is still accepted for one-off cases (e.g. dense lists)
 * and existing callers, but new code should prefer the tokens.
 */
export const ICON_SIZES = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
} as const;

export type IconSizeToken = keyof typeof ICON_SIZES;
export type IconSize = IconSizeToken | number;

function resolveIconSize(size: IconSize): number {
  return typeof size === "number" ? size : ICON_SIZES[size];
}

export interface IconProps extends Omit<
  SVGAttributes<SVGSVGElement>,
  "name" | "title"
> {
  name: IconName | (string & {});
  /**
   * Pixel size — accepts a numeric value (e.g. `18`) or a scale token
   * (`xs`/`sm`/`md`/`lg`/`xl`). Defaults to `lg` (20px), which preserves
   * the previous numeric default of `20`.
   */
  size?: IconSize;
  strokeWidth?: number;
  title?: string;
}

/**
 * Icon component. If `title` is provided, icon is announced to AT; otherwise
 * it is hidden via aria-hidden.
 */
export function Icon({
  name,
  size = "lg",
  strokeWidth = 2,
  className,
  title,
  ...rest
}: IconProps) {
  const body = (PATHS as Record<string, ReactNode>)[name];
  if (!body) {
    if (import.meta.env?.DEV) {
      console.warn(`[Icon] unknown name: ${name}`);
    }
    return null;
  }
  const px = resolveIconSize(size);
  const labelProps: SVGAttributes<SVGSVGElement> = title
    ? { role: "img", "aria-label": title }
    : { "aria-hidden": true };
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...labelProps}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {body}
    </svg>
  );
}

export const ICON_NAMES = Object.keys(PATHS);
