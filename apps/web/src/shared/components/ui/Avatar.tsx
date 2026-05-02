import { cn } from "../../lib/cn";

/**
 * Sergeant Design System — Avatar
 *
 * Circular avatar with:
 * - Image source (with lazy loading)
 * - Fallback to initials derived from `name`
 * - Optional status dot (online / busy / offline)
 *
 * Sizes mirror the Button size tokens: xs (24), sm (32), md (40), lg (48), xl (56).
 */

export type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
export type AvatarStatus = "online" | "busy" | "offline";

const sizeClasses: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-2xs",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
  xl: "h-14 w-14 text-lg",
};

const statusDotSizes: Record<AvatarSize, string> = {
  xs: "h-1.5 w-1.5 ring-1",
  sm: "h-2 w-2 ring-[1.5px]",
  md: "h-2.5 w-2.5 ring-2",
  lg: "h-3 w-3 ring-2",
  xl: "h-3.5 w-3.5 ring-2",
};

const statusDotColors: Record<AvatarStatus, string> = {
  online: "bg-success",
  busy: "bg-warning",
  offline: "bg-muted",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export interface AvatarProps {
  /** User display name — used for initials fallback and alt text. */
  name?: string;
  /** Image URL. When absent, initials are shown. */
  src?: string | null;
  size?: AvatarSize;
  status?: AvatarStatus;
  className?: string;
}

export function Avatar({
  name = "",
  src,
  size = "md",
  status,
  className,
}: AvatarProps) {
  const initials = getInitials(name);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "bg-panelHi border border-line font-semibold text-muted select-none",
        sizeClasses[size],
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={name || "Avatar"}
          loading="lazy"
          className="h-full w-full rounded-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}

      {status && (
        <span
          role="img"
          aria-label={status}
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-panel",
            statusDotSizes[size],
            statusDotColors[status],
          )}
        />
      )}
    </span>
  );
}
