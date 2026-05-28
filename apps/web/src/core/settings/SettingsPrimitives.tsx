import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Card } from "@shared/components/ui/Card";
import { Switch } from "@shared/components/ui/Switch";
import { Skeleton, SkeletonText } from "@shared/components/ui/Skeleton";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import { messages } from "@shared/i18n/uk";

interface ChevronIconProps {
  expanded: boolean;
}

function ChevronIcon({ expanded }: ChevronIconProps) {
  return (
    <Icon
      name="chevron-right"
      size={16}
      className={cn(
        "transition-transform duration-200 shrink-0",
        expanded && "rotate-90",
      )}
    />
  );
}

/** Module names accepted by SettingsGroup (mirrors CardModule but decoupled). */
type SettingsModule = "finyk" | "fizruk" | "routine" | "nutrition";

/** Scoped bg-class for the icon badge — avoids global accent-rgb emission
 *  (Hard Rule #12). Each module has a registered `-soft` / `-soft-border`
 *  pair in the design token contract. */
const MODULE_ICON_BG: Record<SettingsModule, string> = {
  finyk: "bg-finyk-soft border-finyk-soft-border text-finyk",
  fizruk: "bg-fizruk-soft border-fizruk-soft-border text-fizruk",
  routine: "bg-routine-soft border-routine-soft-border text-routine",
  nutrition: "bg-nutrition-soft border-nutrition-soft-border text-nutrition",
};

export interface SettingsGroupProps {
  title: string;
  /**
   * Optional icon name (Lucide icon string). Replaces the deprecated
   * `emoji` prop. When combined with `module`, the icon badge uses the
   * module's soft-surface palette.
   */
  icon?: string;
  /**
   * @deprecated Use `icon` instead. Kept for call-site back-compat;
   * when both are provided `icon` wins.
   */
  emoji?: string;
  /** Module accent for the icon badge. Requires `icon` to be set. */
  module?: SettingsModule;
  children: ReactNode;
  defaultOpen?: boolean;
  /**
   * Optional id for hash-aware auto-open. When the URL hash matches
   * `#<anchorId>` (mounted or via `hashchange`), the group expands so
   * a deep-link from elsewhere (наприклад тап на неактивну Bento-картку,
   * що веде на `#settings-dashboard`) одразу показує користувачу
   * вкладений контент, а не просто згорнутий заголовок під sticky-хедером.
   */
  anchorId?: string;
}

function matchesHash(anchorId: string | undefined): boolean {
  if (!anchorId) return false;
  if (typeof window === "undefined") return false;
  return window.location.hash === `#${anchorId}`;
}

export function SettingsGroup({
  title,
  icon,
  emoji,
  module,
  children,
  defaultOpen = false,
  anchorId,
}: SettingsGroupProps) {
  const [open, setOpen] = useState<boolean>(
    () => defaultOpen || matchesHash(anchorId),
  );
  useEffect(() => {
    if (!anchorId) return;
    const onHashChange = () => {
      if (matchesHash(anchorId)) setOpen(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [anchorId]);

  // `icon` wins over the deprecated `emoji` prop.
  const resolvedIcon = icon ?? undefined;
  const resolvedEmoji = !resolvedIcon ? emoji : undefined;

  // Scoped module bg class — uses registered token pair, never raw RGB
  // (Hard Rule #12). Guard with ?. so noUncheckedIndexedAccess is satisfied.
  const moduleBg = module != null ? (MODULE_ICON_BG[module] ?? "") : "";

  return (
    <Card
      prominence="glass"
      radius="r-lg"
      padding="none"
      className="overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full px-4 py-4 flex items-center justify-between gap-3",
          "hover:bg-surface-strong-glass active:bg-surface-soft-glass transition-colors",
          open && "bg-surface-soft-glass",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {resolvedIcon && (
            <span
              className={cn(
                "rounded-r-md p-1.5 border flex items-center justify-center shrink-0",
                moduleBg ||
                  "bg-surface-soft-glass border-surface-line text-muted-v2",
              )}
            >
              <Icon name={resolvedIcon} size={18} />
            </span>
          )}
          {resolvedEmoji && (
            <span className="text-lg w-7 h-7 flex items-center justify-center rounded-xl bg-bg">
              {resolvedEmoji}
            </span>
          )}
          <span className="text-base font-semibold text-text">{title}</span>
        </div>
        <ChevronIcon expanded={open} />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line/60 px-4 py-5 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface SettingsSubGroupProps {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}

export function SettingsSubGroup({
  title,
  children,
  defaultOpen = false,
}: SettingsSubGroupProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen);
  return (
    <div className="rounded-xl bg-surface-soft-glass border border-surface-line overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 w-full text-left group px-3 py-3",
          "hover:bg-surface-strong-glass transition-colors",
        )}
      >
        <ChevronIcon expanded={open} />
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
            Collapsible header uses `group-hover:text-brand-strong` interactive
            state + transition-colors, which SectionHeading can't express via
            its static tone tokens. Resting tone is `text-text` (stone-900) —
            the previous `text-muted` resting tone read as light-on-light in
            the warm light theme over the soft-glass card (user report
            2026-05-26 / `ui-layout-styling-fixes`). */}
        <span className="text-xs font-bold text-text uppercase tracking-wider group-hover:text-brand-strong transition-colors">
          {title}
        </span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-3 pb-3 pt-1 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

export interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: ToggleRowProps) {
  return (
    <label
      // PR-37 ux-roast 2026-Q3 / §3.1: row reads as plain copy on the
      // section background — користувачі скаржаться, що тумблери губляться
      // на тлі. Тепер це явна tappable картка з бордером і фоном, явним
      // hover/active-стейтом, по всій ширині.
      className={cn(
        "flex items-center justify-between gap-4 cursor-pointer group min-h-[44px]",
        "p-3 rounded-2xl border border-line/60 bg-surface-soft-glass shadow-soft",
        "hover:border-brand/40 hover:bg-surface-strong-glass active:bg-surface-soft-glass",
        "transition-[background-color,border-color]",
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="text-style-label text-text group-hover:text-brand-strong transition-colors">
          {label}
        </span>
        {description && (
          <p className="text-xs text-subtle mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <Switch checked={checked} onChange={onChange} />
      </div>
    </label>
  );
}

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  danger,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(open, panelRef, { onEscape: onCancel });

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-md motion-safe:animate-fade-in"
        onClick={onCancel}
        aria-label={messages.actions.close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        className={cn(
          "relative w-full max-w-sm p-6 z-10 motion-safe:animate-scale-in",
          // v2 glass surface — auto-upgrades to opaque in HC (theme.css
          // §HC v2 overrides: --surface-glass → rgba(255,255,255,1) /
          // rgba(32,28,25,1) dark-HC). No separate `html.hc &` needed.
          "bg-surface-glass backdrop-blur-xl border border-surface-line",
          "rounded-r-2xl shadow-card-v2",
        )}
      >
        <h2
          id="confirm-modal-title"
          className="text-style-title text-text leading-tight"
        >
          {title}
        </h2>
        {body && (
          <p className="text-sm text-muted mt-3 leading-relaxed">{body}</p>
        )}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            className="text-style-label flex-1 py-3.5 rounded-xl border border-line text-muted hover:bg-surface-strong-glass hover:text-text transition-colors"
            onClick={onCancel}
          >
            {messages.actions.cancel}
          </button>
          <button
            type="button"
            className={cn(
              "text-style-label flex-1 py-3.5 rounded-xl text-white transition-colors shadow-soft",
              danger
                ? "bg-danger-strong hover:bg-danger/90 active:bg-danger/80"
                : "bg-brand-strong hover:bg-brand/90 active:bg-brand/80",
            )}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface SectionSkeletonProps {
  /**
   * Minimum height in pixels. Mirrors the real section's collapsed-state
   * height so the Suspense fallback does not cause Cumulative Layout
   * Shift when the lazy chunk resolves and the real section paints.
   *
   * Per-section values are owned by the caller — each `<Suspense>`
   * boundary in `HubSettingsPage` passes the height it knows for its
   * section. A default of 72 px matches the closed-header shape of
   * `<SettingsGroup>` (icon badge + title row + chrome padding).
   */
  minH?: number;
  /**
   * Aria label for the placeholder card. Visible-text-only screen
   * readers see this in place of the real section title until the lazy
   * chunk resolves. Defaults to a generic "loading section" string.
   */
  ariaLabel?: string;
}

/**
 * Stable height-placeholder for a `<Suspense>`-deferred `<SettingsGroup>`
 * (Initiative 0017 Sprint 1.1 — per-section lazy in HubSettingsPage).
 *
 * Shape mirrors the closed-state `<SettingsGroup>` header chrome —
 * icon badge slot + title bar + chevron — so the swap from fallback to
 * real section is visually a no-op for the user. Shimmer (not pulse)
 * matches the "premium loading" feel chosen by the design tokens, and
 * collapses to a static block under `prefers-reduced-motion: reduce`
 * (handled inside `Skeleton`).
 *
 * Always `aria-hidden`-effective: the placeholder is decorative; the
 * meaningful announcement is the section's real heading once it loads.
 * `ariaLabel` is exposed only for the rare case where the placeholder
 * remains on screen long enough for screen readers to focus it — the
 * fallback is then announced as "loading <ariaLabel>" rather than
 * leaking the skeleton chrome.
 */
export function SectionSkeleton({
  minH = 72,
  ariaLabel,
}: SectionSkeletonProps) {
  const style: CSSProperties = { minHeight: `${minH}px` };
  return (
    <Card
      prominence="glass"
      radius="r-lg"
      padding="none"
      className="overflow-hidden"
      role="status"
      aria-label={ariaLabel ?? messages.loaders.loadingSection}
      aria-busy="true"
      style={style}
    >
      <div className="w-full px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Skeleton shimmer className="w-9 h-9 rounded-r-md shrink-0" />
          <SkeletonText shimmer className="w-1/3 max-w-[180px]" />
        </div>
        <Skeleton shimmer className="w-4 h-4 rounded-sm shrink-0" />
      </div>
    </Card>
  );
}
