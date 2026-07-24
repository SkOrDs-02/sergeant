/**
 * Status: Active
 *
 * Overflow "⋯" menu for the hub header. Folds the secondary controls
 * (theme, privacy status) out of the top-bar so the header keeps
 * to ≤5 affordances on mobile (mobile-audit A3). Calm mode moved to
 * Settings → Дашборд → Вигляд. The popover closes on
 * outside-click + Esc, returning focus to the trigger (same pattern as
 * `NotificationBell`). All visible copy arrives via `labels` props
 * (interpolated, never JSX-text) so the module stays clear of raw Cyrillic
 * literals.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { ThemeSwitcher } from "@shared/components/ui/ThemeSwitcher";
import { hapticTap } from "@shared/lib/adapters/haptic";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export interface HubHeaderMenuLabels {
  /** Accessible name + tooltip for the "⋯" trigger. */
  trigger: string;
  /** Accessible name for the popover menu. */
  menu: string;
  theme: string;
  privacy: string;
  privacyDetail: string;
}

export interface HubHeaderMenuProps {
  triggerClassName?: string | undefined;
  /** When provided, the privacy status row opens the detail sheet on tap. */
  onOpenPrivacy?: (() => void) | undefined;
  labels: HubHeaderMenuLabels;
}

export function HubHeaderMenu({
  triggerClassName,
  onOpenPrivacy,
  labels,
}: HubHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click + Esc; focus returns to the trigger.
  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      close();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, close]);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={labels.trigger}
        title={labels.trigger}
        onClick={() => setOpen((value) => !value)}
        className={cn(triggerClassName)}
      >
        <Icon name="more-horizontal" size="lg" />
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={labels.menu}
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-line bg-panel shadow-float p-2 z-50 space-y-1"
        >
          {/* Theme — reuses the shared segmented ThemeSwitcher primitive */}
          <div className="px-3 py-2">
            <span className="block text-style-label text-text mb-1.5">
              {labels.theme}
            </span>
            <ThemeSwitcher />
          </div>

          {/* Privacy — de-emphasised status row (data locality) that opens
              the detail sheet on tap. Gated on the handler so the row only
              shows where privacy context is wired. */}
          {onOpenPrivacy && (
            <PrivacyRow
              label={labels.privacy}
              detail={labels.privacyDetail}
              onOpen={() => {
                onOpenPrivacy();
                close();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}

function PrivacyRow({
  label,
  detail,
  onOpen,
}: {
  label: string;
  detail: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        onOpen();
      }}
      className={cn(
        "w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left text-text transition-colors motion-reduce:transition-none hover:bg-panelHi",
        FOCUS_RING,
      )}
    >
      <Icon
        name="shield"
        size="sm"
        className="shrink-0 mt-0.5 text-brand-strong dark:text-brand"
        aria-hidden
      />
      <span className="flex-1 min-w-0">
        <span className="block text-style-label leading-tight">{label}</span>
        <span className="block text-style-caption text-muted leading-snug mt-0.5">
          {detail}
        </span>
      </span>
    </button>
  );
}
