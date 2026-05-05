// Quick action chips для HubChat (spec §2).
//
// - top-level показує до 6 chip-ів + кнопку "Ще";
// - "Ще" відкриває розширений inline-список (без modal — щоб не ламати
//   focus trap і keyboard inset на mobile);
// - повний prompt → одразу `onSend(prompt)`;
// - неповний prompt (`isIncompletePrompt`) → `onPrefill(prompt)` + focus
//   на input (фокус робить викликаючий компонент через ref);
// - в `loading` або `offline` AI-залежні chip-и disabled.

import { useState } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import {
  type AssistantCapability,
  type CapabilityModule,
  getQuickActionCapabilities,
  isActiveQuickActionModule,
  isIncompletePrompt,
  pickTopQuickActions,
  sortQuickActionsForModule,
} from "@sergeant/shared";
import { messages } from "@shared/i18n/uk";

interface ChatQuickActionsProps {
  /** Активний модуль (з URL hash). `null` — генеричний топ. */
  activeModule: CapabilityModule | null;
  /** Чи в стрімі / завантаженні відповіді. Disable-ить усі chip-и. */
  loading: boolean;
  /** Стан мережі. Якщо false — disable-ить `requiresOnline`. */
  online: boolean;
  /** Викликається для повних prompt-ів — одразу шле повідомлення. */
  onSend: (prompt: string) => void;
  /**
   * Викликається для неповних prompt-ів (закінчуються на `: `):
   * вставляє текст в input і фокусує поле.
   */
  onPrefill: (prompt: string) => void;
}

const MAX_VISIBLE = 6;

const QUICK_ACTIONS = getQuickActionCapabilities();

function chipClassName({
  disabled,
  active,
  hubLike,
}: {
  disabled: boolean;
  active: boolean;
  hubLike: boolean;
}): string {
  return cn(
    "inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 transition-colors",
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45",
    active
      ? "bg-brand-500/10 border border-brand-500/40 text-brand-600 hover:bg-brand-500/15"
      : hubLike
        ? "bg-panel border border-line text-text hover:border-muted"
        : "bg-panel border border-line text-subtle hover:text-text hover:border-muted",
    disabled && "opacity-40 cursor-not-allowed",
  );
}

const HUB_LIKE: ReadonlySet<CapabilityModule> = new Set([
  "cross",
  "analytics",
  "utility",
  "memory",
]);

export function ChatQuickActions({
  activeModule,
  loading,
  online,
  onSend,
  onPrefill,
}: ChatQuickActionsProps) {
  const [expanded, setExpanded] = useState(false);

  const topActions = pickTopQuickActions(
    QUICK_ACTIONS,
    activeModule,
    MAX_VISIBLE,
  );
  const allSorted = sortQuickActionsForModule(QUICK_ACTIONS, activeModule);
  const moreActions = allSorted.slice(MAX_VISIBLE);

  const handleClick = (a: AssistantCapability) => {
    if (isIncompletePrompt(a.prompt)) {
      onPrefill(a.prompt);
    } else {
      onSend(a.prompt);
    }
  };

  const renderChip = (a: AssistantCapability) => {
    const requiresOnline = a.requiresOnline ?? true;
    const disabled = loading || (requiresOnline && !online);
    const reason = !online && requiresOnline ? "Потрібне з'єднання" : undefined;
    const shortLabel = a.shortLabel ?? a.label;
    return (
      <button
        key={a.id}
        type="button"
        data-testid={`chat-quick-action-${a.id}`}
        onClick={() => handleClick(a)}
        disabled={disabled}
        title={reason || a.description || a.label}
        aria-label={a.label}
        className={chipClassName({
          disabled,
          active: isActiveQuickActionModule(a, activeModule),
          hubLike: HUB_LIKE.has(a.module),
        })}
      >
        <Icon name={a.icon} size={13} aria-hidden />
        <span className="hidden sm:inline">{a.label}</span>
        <span className="sm:hidden">{shortLabel}</span>
      </button>
    );
  };

  return (
    <div
      className="px-4 pt-2 pb-1 shrink-0"
      role="group"
      aria-label={messages.hub.chatQuickActions}
    >
      <div className="flex gap-2 overflow-x-auto scrollbar-hide">
        {topActions.map(renderChip)}
        {moreActions.length > 0 && (
          <button
            type="button"
            data-testid="chat-quick-actions-more"
            onClick={() => setExpanded((v) => !v)}
            disabled={loading}
            aria-expanded={expanded}
            aria-controls="chat-quick-actions-more-list"
            className={chipClassName({
              disabled: loading,
              active: false,
              hubLike: true,
            })}
          >
            <Icon
              name={expanded ? "chevron-up" : "chevron-down"}
              size={13}
              aria-hidden
            />
            {expanded ? "Згорнути" : "Ще"}
          </button>
        )}
      </div>

      {expanded && moreActions.length > 0 && (
        <div
          id="chat-quick-actions-more-list"
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {moreActions.map(renderChip)}
        </div>
      )}
    </div>
  );
}
