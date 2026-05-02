import { cn } from "@shared/lib/cn";

export interface SkipLinkProps {
  /** Fragment target without the leading `#`. Defaults to `main`. */
  targetId?: string;
  /** Visible label. Defaults to Ukrainian copy. */
  label?: string;
  className?: string;
}

/**
 * Canonical "skip to main content" link — the first interactive element
 * in document order. Keyboard-only and screen-reader users can jump
 * straight past the header / tabs / chrome to the primary `<main>`
 * region instead of tabbing through every nav item on every page load.
 *
 * Rendered visually-hidden by default; becomes visible when it gains
 * keyboard focus. Mount it as the FIRST child of the app shell so Tab
 * from the address bar lands on it immediately.
 */
export function SkipLink({
  targetId = "main",
  label = "Перейти до основного вмісту",
  className,
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        // Visually hidden until focused — do NOT use display:none or
        // visibility:hidden here, both remove the element from the
        // accessibility tree.
        "sr-only focus:not-sr-only",
        // When focused: promote to a pinned top-left pill that sits
        // above every surface in the app (modals, sheets, toasts all
        // live ≤ z-[200]).
        "focus:fixed focus:top-3 focus:left-3 focus:z-[300]",
        "focus:px-4 focus:py-2 focus:rounded-xl",
        "focus:border focus-visible:bg-panel focus-visible:text-text focus-visible:shadow-float focus-visible:border-line",
        "focus:text-sm focus:font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
        className,
      )}
    >
      {label}
    </a>
  );
}
