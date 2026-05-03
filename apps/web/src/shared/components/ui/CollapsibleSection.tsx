import { useState, useCallback, useRef, type ReactNode } from "react";
import { cn } from "../../lib/ui/cn";
import { Icon } from "./Icon";
import { SectionHeading, type SectionHeadingSize } from "./SectionHeading";
import { safeReadLS, safeWriteLS } from "../../lib/storage/storage";

export interface CollapsibleSectionProps {
  /** Unique key for persisting collapse state in localStorage. */
  storageKey: string;
  /** Section heading text. */
  title: ReactNode;
  /** Default state when no localStorage value exists. */
  defaultOpen?: boolean;
  /** SectionHeading size — defaults to "xs". */
  headingSize?: SectionHeadingSize;
  /**
   * Icon name (from the shared `Icon` set) rendered on the left of the
   * collapsed "pill" state. When omitted, the collapsed state renders
   * title-only — useful for sections without an obvious glyph.
   */
  collapsedIcon?: string;
  /**
   * Short preview / summary line shown inside the collapsed pill, below
   * the title. Typical content: a live count, freshness timestamp,
   * or a one-line CTA ("AI-порада оновлена", "3 інсайти").
   */
  collapsedSubtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/**
 * Section wrapper that collapses/expands its children and persists the
 * state in localStorage. Used on HubDashboard to let users collapse
 * the "Підказки" and "Аналітика" sections to reduce scroll depth.
 *
 * Two visual states:
 * - **Expanded** — minimal eyebrow heading + rotating chevron, so the
 *   section's own content dominates the viewport.
 * - **Collapsed** — full-width "pill" card (panel bg + border, icon,
 *   regular-case title, optional `collapsedSubtitle` preview, right
 *   chevron). Makes the collapsed row read as a purposeful, tappable
 *   entry point instead of a stray eyebrow with nothing under it.
 *
 * Collapse animation uses CSS `grid-template-rows` for smooth height
 * transitions (no JavaScript measurement needed).
 */
export function CollapsibleSection({
  storageKey,
  title,
  defaultOpen = true,
  headingSize = "xs",
  collapsedIcon,
  collapsedSubtitle,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(
    () => safeReadLS<boolean>(storageKey, defaultOpen) ?? defaultOpen,
  );
  const sectionRef = useRef<HTMLElement>(null);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(storageKey, next);
      if (next) {
        // After CSS transition (200ms) scroll so expanded content is visible.
        setTimeout(() => {
          sectionRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 210);
      }
      return next;
    });
  }, [storageKey]);

  return (
    <section ref={sectionRef} className={cn("space-y-2", className)}>
      {open ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 w-full text-left touch-target pointer-coarse:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 rounded-xl -ml-0.5 pl-0.5"
        >
          <Icon
            name="chevron-down"
            size={12}
            strokeWidth={2.5}
            className="text-subtle"
            aria-hidden
          />
          <SectionHeading as="span" size={headingSize} className="px-0!">
            {title}
          </SectionHeading>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-3 w-full text-left",
            "px-3.5 py-3 rounded-2xl",
            "bg-panel/70 hover:bg-panelHi border border-line/70",
            "transition-colors active:scale-[0.99]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
          )}
        >
          {collapsedIcon && (
            <span
              className={cn(
                "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                "bg-brand-500/10 text-brand-strong dark:text-brand",
              )}
              aria-hidden
            >
              <Icon name={collapsedIcon} size={18} strokeWidth={2} />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className="text-style-label block text-text leading-tight">
              {title}
            </span>
            {collapsedSubtitle && (
              <span className="block text-2xs text-muted mt-0.5 truncate">
                {collapsedSubtitle}
              </span>
            )}
          </span>
          <Icon
            name="chevron-right"
            size={16}
            strokeWidth={2}
            className="text-subtle shrink-0"
            aria-hidden
          />
        </button>
      )}

      {/* CSS grid row transition for smooth collapse */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
