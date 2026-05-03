import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import {
  Popover,
  PopoverDivider,
  PopoverItem,
} from "@shared/components/ui/Popover";
import { Tooltip } from "@shared/components/ui/Tooltip";

export interface HubChatHeaderProps {
  detailsOpen: boolean;
  onDetailsOpenChange: (open: boolean) => void;
  contextState: { status: string; ts: number };
  hasData: boolean;
  sessionInfo: { historyCount: number; chars: number };
  sessionsCount: number;
  onOpenHistory: () => void;
  onClearChat: () => void;
  onClose: () => void;
}

/**
 * Single-row, ChatGPT-style chat header: avatar + "Асистент ▾"
 * trigger (popover with status, "Усі бесіди", privacy line) |
 * "+ Нова" pill | ✕. All secondary affordances (info, history
 * list, module subtitle, Mono warning) collapse into the "Деталі"
 * popover behind the title.
 */
export function HubChatHeader({
  detailsOpen,
  onDetailsOpenChange,
  contextState,
  hasData,
  sessionInfo,
  sessionsCount,
  onOpenHistory,
  onClearChat,
  onClose,
}: HubChatHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 pb-3 shrink-0 border-b border-line">
      <Popover
        placement="bottom-start"
        open={detailsOpen}
        onOpenChange={onDetailsOpenChange}
        wrapperClassName="min-w-0 flex-1"
        className="min-w-[280px]! p-1.5"
        trigger={
          <span
            aria-label="Деталі асистента"
            className="flex items-center gap-2.5 min-w-0 w-full px-1.5 py-1 -mx-1.5 rounded-xl hover:bg-panelHi transition-colors cursor-pointer select-none"
          >
            <span
              className={cn(
                "relative w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center shrink-0",
                contextState.status === "building" &&
                  "motion-safe:animate-pulse",
              )}
              aria-hidden
            >
              <Icon name="sparkle" size={16} className="text-brand-500" />
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-bg",
                  contextState.status === "ready"
                    ? "bg-brand-500"
                    : contextState.status === "building"
                      ? "bg-warning"
                      : !hasData
                        ? "bg-warning"
                        : "bg-line",
                )}
                aria-hidden
              />
            </span>
            <span className="flex items-center gap-1 min-w-0">
              <span
                id="hub-chat-title"
                className="text-base font-bold text-text leading-snug truncate"
              >
                Асистент
              </span>
              <Icon
                name="chevron-down"
                size={14}
                className={cn(
                  "text-muted shrink-0 transition-transform duration-150",
                  detailsOpen && "rotate-180",
                )}
              />
            </span>
          </span>
        }
      >
        <div
          role="status"
          id="hub-chat-privacy"
          className="space-y-2 px-2 pt-2 pb-1"
        >
          <div className="flex items-center gap-2 text-xs text-text">
            <span
              className={cn(
                "inline-block w-2 h-2 rounded-full",
                contextState.status === "ready"
                  ? "bg-brand-500"
                  : contextState.status === "building"
                    ? "bg-warning motion-safe:animate-pulse"
                    : "bg-line",
              )}
              aria-hidden
            />
            <span className="font-semibold">
              {contextState.status === "building"
                ? "Готую контекст…"
                : contextState.status === "ready"
                  ? "Контекст готовий"
                  : "Очікую"}
            </span>
          </div>
          {!hasData && (
            <div className="px-2.5 py-2 bg-warning/10 border border-warning/30 rounded-xl text-2xs text-warning leading-snug">
              Mono не підключено — фінансовий контекст обмежений.
            </div>
          )}
          <p className="text-2xs text-subtle leading-snug">
            В контексті: {sessionInfo.historyCount} з останніх 10 повідомлень ·
            ~{Math.round(sessionInfo.chars / 100) / 10}k символів.
          </p>
          <p className="text-2xs text-muted leading-snug">
            Контекст (фінанси, тренування, звички, харчування) відправляється до
            AI.
          </p>
        </div>
        <PopoverDivider />
        <PopoverItem
          icon={<Icon name="list" size={14} />}
          onClick={() => {
            onDetailsOpenChange(false);
            onOpenHistory();
          }}
        >
          Усі бесіди ({sessionsCount})
        </PopoverItem>
      </Popover>
      <div className="flex items-center gap-1 shrink-0">
        <Tooltip content="Почати нову бесіду" placement="bottom-center">
          <button
            type="button"
            onClick={onClearChat}
            className="h-9 px-3 flex items-center gap-1.5 rounded-xl bg-brand-soft text-brand-strong dark:text-brand border border-brand-soft-border/50 hover:bg-brand-soft-hover transition-colors text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
            aria-label="Нова бесіда"
          >
            <Icon name="plus" size={14} />
            Нова
          </button>
        </Tooltip>
        <button
          type="button"
          onClick={onClose}
          className="w-9 h-9 flex items-center justify-center rounded-xl text-muted hover:text-text hover:bg-panelHi transition-colors"
          aria-label="Закрити асистента"
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    </div>
  );
}
