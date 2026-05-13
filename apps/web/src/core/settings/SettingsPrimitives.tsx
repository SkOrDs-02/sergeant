import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Card } from "@shared/components/ui/Card";
import { Switch } from "@shared/components/ui/Switch";
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

export interface SettingsGroupProps {
  title: string;
  emoji?: string;
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
  emoji,
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
  return (
    <Card radius="lg" padding="none" className="overflow-hidden shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "w-full px-4 py-4 flex items-center justify-between gap-3",
          "hover:bg-panelHi/60 active:bg-panelHi transition-colors",
          open && "bg-panelHi/30",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          {emoji && (
            <span className="text-lg w-7 h-7 flex items-center justify-center rounded-xl bg-bg">
              {emoji}
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
    <div className="rounded-xl bg-bg/50 border border-line/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 w-full text-left group px-3 py-2.5",
          "hover:bg-panelHi/40 transition-colors",
        )}
      >
        <ChevronIcon expanded={open} />
        {/* eslint-disable-next-line sergeant-design/no-eyebrow-drift --
            Collapsible header uses `group-hover:text-text` interactive state +
            transition-colors, which SectionHeading can't express via its
            static tone tokens. */}
        <span className="text-xs font-bold text-muted uppercase tracking-wider group-hover:text-text transition-colors">
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
        "p-3 rounded-2xl border border-line/60 bg-panel/60 shadow-soft",
        "hover:border-brand/40 hover:bg-panelHi/60 active:bg-panelHi",
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
        className="relative w-full max-w-sm bg-panel border border-line rounded-2xl shadow-float p-6 z-10 motion-safe:animate-scale-in"
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
            className="text-style-label flex-1 py-3.5 rounded-xl border border-line text-muted hover:bg-panelHi hover:text-text transition-colors"
            onClick={onCancel}
          >
            {messages.actions.cancel}
          </button>
          <button
            type="button"
            className={cn(
              "text-style-label flex-1 py-3.5 rounded-xl text-white transition-colors shadow-soft",
              danger
                ? "bg-danger hover:bg-danger/90 active:bg-danger/80"
                : "bg-brand hover:bg-brand/90 active:bg-brand/80",
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
