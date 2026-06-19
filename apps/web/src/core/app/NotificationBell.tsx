/**
 * Last validated: 2026-06-20
 * Status: Active
 *
 * C · Контроль (home redesign 2026-06): consolidates the system chrome
 * banners (SW update, PWA install) that previously stacked inline above
 * the dashboard into a single header bell with a count badge. The banners
 * were the loudest part of the «шум» on the home tab — a fresh install
 * could see an update + install row before any data was visible. Here they
 * become on-demand: the bell only renders when something is pending, and a
 * tap reveals the same actions inside a dropdown.
 *
 * Dropdown chrome (trigger a11y, outside-click + ESC close, focus return)
 * mirrors `ThemeSwitcher`'s `DropdownSwitcher` so the header keeps one
 * popover idiom. iOS-install and Trial banners stay inline for now — they
 * carry their own bespoke UX (step-by-step instructions / billing CTA).
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

const FOCUS_RING =
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export interface HubNotification {
  /** Stable id for the React key + analytics. */
  id: string;
  /** Lucide/Tabler icon token rendered in the row badge. */
  icon: string;
  title: string;
  description?: string;
  /** Primary action label (e.g. «Оновити», «Встановити»). */
  actionLabel: string;
  onAction: () => void;
  /** When present, renders a «Пізніше» dismiss affordance. */
  onDismiss?: () => void;
}

export interface NotificationBellProps {
  notifications: readonly HubNotification[];
}

export function NotificationBell({ notifications }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const count = notifications.length;

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click + ESC; focus returns to the trigger.
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

  // If the last pending notification clears while the menu is open (e.g. the
  // user installs the PWA → `canInstall` flips false), collapse the popover
  // so it doesn't linger empty.
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  if (count === 0) return null;

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Сповіщення: ${count}`}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative w-12 h-12 sm:w-11 sm:h-11 flex items-center justify-center rounded-xl",
          "text-muted hover:text-text hover:bg-panelHi transition-colors",
          FOCUS_RING,
        )}
      >
        <Icon name="bell" size="lg" />
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-strong text-white text-xs font-bold leading-[18px] text-center"
        >
          {count}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          // eslint-disable-next-line sergeant-design/no-cyrillic-jsx-literal -- single-use a11y label; i18n catalog reserves entries for strings on ≥2 surfaces
          aria-label="Сповіщення"
          className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-panel shadow-float p-1.5 z-50"
        >
          {notifications.map((n) => (
            <div
              key={n.id}
              role="menuitem"
              className="flex items-start gap-3 px-2.5 py-2.5 rounded-xl"
            >
              <span className="shrink-0 mt-0.5 w-8 h-8 inline-flex items-center justify-center rounded-md border border-line bg-panel/60">
                <Icon name={n.icon} size="md" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-style-label text-text leading-tight">
                  {n.title}
                </p>
                {n.description && (
                  <p className="text-xs text-muted leading-snug mt-0.5">
                    {n.description}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={() => {
                      n.onAction();
                      close();
                    }}
                    className="font-semibold"
                  >
                    {n.actionLabel}
                  </Button>
                  {n.onDismiss && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => n.onDismiss?.()}
                      className="text-muted hover:text-text"
                    >
                      {messages.actions.later}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
