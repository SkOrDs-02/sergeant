import { useCallback, useEffect, useMemo, useRef } from "react";
import { cn } from "@shared/lib/cn";
import { Icon } from "@shared/components/ui/Icon";
import { useDialogFocusTrap } from "@shared/hooks/useDialogFocusTrap";
import type { HubChatSession } from "./hubChatSessions";

interface HubChatHistoryDrawerProps {
  open: boolean;
  sessions: HubChatSession[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

function formatStamp(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (sameDay) return `${hh}:${mm}`;
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo} ${hh}:${mm}`;
}

function userMessageCount(s: HubChatSession): number {
  return s.messages.filter((m) => m.role === "user").length;
}

export function HubChatHistoryDrawer({
  open,
  sessions,
  activeId,
  onClose,
  onSelect,
  onCreate,
  onDelete,
}: HubChatHistoryDrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useDialogFocusTrap(open, panelRef, { onEscape: onClose });

  // Sort newest-first by updatedAt so a freshly-touched session jumps
  // to the top, matching iOS Messages and Telegram conventions.
  const sortedSessions = useMemo(
    () => sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleDelete = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      onDelete(id);
    },
    [onDelete],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex safe-area-pt-pb"
      role="dialog"
      aria-modal="true"
      aria-label="Історія чатів"
    >
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm motion-safe:animate-fade-in"
        onClick={onClose}
        aria-hidden
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        className="relative flex flex-col w-[85%] max-w-sm h-full bg-bg border-r border-line shadow-float motion-safe:animate-fade-in"
      >
        <div className="flex items-center justify-between gap-3 px-4 h-14 border-b border-line shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-8 h-8 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0"
              aria-hidden
            >
              <Icon name="sparkle" size={15} className="text-brand-500" />
            </div>
            <div className="text-base font-bold text-text">Бесіди</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
            aria-label="Закрити список бесід"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              onCreate();
            }}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-2xl border border-dashed border-line text-text hover:bg-panelHi hover:border-brand-500/40 hover:text-brand-strong transition-colors text-style-label"
          >
            <Icon name="plus" size={15} />
            Нова бесіда
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-1">
          {sortedSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 text-center text-muted text-xs py-10 px-4">
              <div
                className="w-12 h-12 rounded-2xl bg-panelHi flex items-center justify-center"
                aria-hidden
              >
                <Icon name="sparkle" size={20} className="text-subtle" />
              </div>
              {/* eslint-disable-next-line sergeant-design/no-bare-empty-text -- drawer-internal mini empty state inside scrollable list, full <EmptyState> tier would be visually too heavy here */}
              <div>Поки немає інших бесід.</div>
            </div>
          ) : (
            sortedSessions.map((s) => {
              const isActive = s.id === activeId;
              const msgs = userMessageCount(s);
              return (
                <div
                  key={s.id}
                  className={cn(
                    "group relative flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors",
                    isActive
                      ? "bg-brand-500/15 text-text"
                      : "hover:bg-panelHi text-text",
                  )}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onSelect(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelect(s.id);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-style-label truncate">{s.title}</div>
                    <div className="text-2xs text-muted mt-0.5 flex items-center gap-1.5">
                      <span>{formatStamp(s.updatedAt)}</span>
                      <span className="text-line" aria-hidden>
                        ·
                      </span>
                      <span>
                        {msgs} {msgs === 1 ? "повідомлення" : "повідомлень"}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, s.id)}
                    className="w-9 h-9 shrink-0 flex items-center justify-center rounded-xl text-subtle/60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 hover:text-danger hover:bg-danger/10 transition-[color,background-color,opacity]"
                    aria-label={`Видалити бесіду ${s.title}`}
                    title="Видалити"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
