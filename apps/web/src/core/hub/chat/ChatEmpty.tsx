import { useMemo } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { getActiveModules, type DashboardModuleId } from "@sergeant/shared";
import { localStorageStore } from "../dashboard/dashboardStore";

export interface ChatEmptyProps {
  /**
   * Префіл composer-а текстом suggestion-у. Не шле повідомлення —
   * залишаємо контроль за користувачем (на відміну від quick-action
   * chip-ів у composer-і, де `isIncompletePrompt` визначає behaviour
   * на основі `: ` суфіксу).
   *
   * Hand-off контракту: HubChat прокидає `setInput` + focus у parent
   * `HubChatBody`, який пробрасує сюди один callback — щоб `ChatEmpty`
   * не знав ні про focus-ref-и, ні про typing-state composer-а.
   */
  onPickSuggestion: (text: string) => void;
}

interface Suggestion {
  /**
   * Стабільний id для key-ів і testid-ів — також сходиться з
   * `DashboardModuleId` так, щоб `active.has(s.id)` отримував
   * звужений тип і працював без `as`.
   */
  readonly id: DashboardModuleId;
  /** Іконка з нашого Icon-каталогу — лінкує до domain-модуля. */
  readonly icon: string;
  /** Tailwind-колір, що відповідає accent-у модуля. */
  readonly accentClass: string;
  /** Текст, який ми префілимо в composer на тап. */
  readonly prompt: string;
}

const SUGGESTIONS: readonly Suggestion[] = [
  {
    id: "finyk",
    icon: "credit-card",
    accentClass: "text-finyk",
    prompt: messages.hub.chatEmptySuggestionFinyk,
  },
  {
    id: "fizruk",
    icon: "dumbbell",
    accentClass: "text-fizruk",
    prompt: messages.hub.chatEmptySuggestionFizruk,
  },
  {
    id: "nutrition",
    icon: "utensils",
    accentClass: "text-nutrition",
    prompt: messages.hub.chatEmptySuggestionNutrition,
  },
  {
    id: "routine",
    icon: "check-circle",
    accentClass: "text-routine",
    prompt: messages.hub.chatEmptySuggestionRoutine,
  },
];

/**
 * Empty-state placeholder для `/chat`, який рендериться у
 * `HubChatBody`, коли в активній сесії ще немає жодного повідомлення.
 *
 * Не перекриває composer (parent — flex-1 scroll-area, composer
 * shrink-0 під ним). Сам блок — flex-column з 4 chip-suggestion-ами,
 * кожна з яких префілить composer відповідним prompt-ом + ставить
 * focus у поле (focus робить виклик через `setInput` → таймер →
 * `focusInputRef.current?.()` у `HubChat`).
 *
 * §A12 з docs/audits/2026-05-06-ux-roast-pr-plan.md.
 */
export function ChatEmpty({ onPickSuggestion }: ChatEmptyProps) {
  const visibleSuggestions = useMemo(() => {
    const active = new Set(getActiveModules(localStorageStore));
    return SUGGESTIONS.filter((s) => active.size === 0 || active.has(s.id));
  }, []);

  return (
    <div
      data-testid="chat-empty"
      role="region"
      aria-label={messages.hub.chatEmptyAriaLabel}
      className="h-full flex flex-col items-center justify-center text-center gap-4 px-4 py-6"
    >
      <p className="text-base font-semibold text-text">
        {messages.hub.chatEmptyTitle}
      </p>
      <p className="max-w-xs text-sm text-muted leading-relaxed text-pretty">
        {messages.hub.chatEmptyDescription}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
        {visibleSuggestions.map((s) => (
          <button
            key={s.id}
            type="button"
            data-testid={`chat-empty-suggestion-${s.id}`}
            onClick={() => onPickSuggestion(s.prompt)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-panel border border-line text-sm text-text text-left hover:border-muted hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45"
          >
            <Icon
              name={s.icon}
              size={14}
              className={s.accentClass}
              aria-hidden
            />
            <span className="truncate">{s.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
