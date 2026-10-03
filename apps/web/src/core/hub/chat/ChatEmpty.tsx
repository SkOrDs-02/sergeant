import { useSyncExternalStore } from "react";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";
import { messages } from "@shared/i18n/uk";
import {
  getActiveModules,
  type DashboardModuleId,
  VIBE_PICKS_KEY,
  ONBOARDING_DONE_KEY,
} from "@sergeant/shared";
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
   *
   * Без callback-а (гість: замість composer-а стоїть `ChatAuthGate`)
   * підказки лишаються прикладами запитань, а не кнопками: обіцянка
   * «текст вставиться у поле» вела в нікуди, бо поля немає.
   */
  onPickSuggestion?: ((text: string) => void) | undefined;
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
 * Subscribe to the two KV keys that drive `getActiveModules` and
 * re-snapshot whenever either changes (e.g. user edits vibe picks in
 * Hub Settings in another tab, or completes onboarding in the same session).
 *
 * `useSyncExternalStore` requires stable `subscribe` + `getSnapshot`
 * references, so we define them once at module scope.
 */
function subscribeActiveModules(onStoreChange: () => void): () => void {
  const unsubVibe = localStorageStore.onChange(VIBE_PICKS_KEY, onStoreChange);
  const unsubDone = localStorageStore.onChange(
    ONBOARDING_DONE_KEY,
    onStoreChange,
  );
  return () => {
    unsubVibe();
    unsubDone();
  };
}

// `useSyncExternalStore` requires `getSnapshot` to return a referentially
// stable value while the underlying data is unchanged. `getActiveModules`
// builds a fresh array on every call, which would make React see a new
// snapshot each render and spin into an infinite update loop. Cache the
// last result keyed by its serialized contents and only swap the reference
// when the active-module set actually changes.
let cachedKey = "\0";
let cachedModules: readonly DashboardModuleId[] = [];

function snapshotActiveModules(): readonly DashboardModuleId[] {
  const modules = getActiveModules(localStorageStore);
  const key = modules.join(",");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedModules = modules;
  }
  return cachedModules;
}

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
 *
 * Active-modules are subscribed via `useSyncExternalStore` so the chip
 * list re-renders live whenever the user's vibe picks or onboarding
 * state changes, rather than being frozen at mount time.
 */
export function ChatEmpty({ onPickSuggestion }: ChatEmptyProps) {
  const activeModules = useSyncExternalStore(
    subscribeActiveModules,
    snapshotActiveModules,
    snapshotActiveModules,
  );

  const visibleSuggestions = SUGGESTIONS.filter(
    (s) => activeModules.length === 0 || activeModules.includes(s.id),
  );

  return (
    <div
      data-testid="chat-empty"
      role="region"
      aria-label={messages.hub.chatEmptyAriaLabel}
      className="h-full flex flex-col items-center justify-center text-center gap-4 px-4 py-6"
    >
      <p className="text-style-title text-text">
        {messages.hub.chatEmptyTitle}
      </p>
      <p className="max-w-xs text-style-body text-muted leading-relaxed text-pretty">
        {onPickSuggestion
          ? messages.hub.chatEmptyDescription
          : messages.hub.chatEmptyDescriptionSignedOut}
      </p>
      {onPickSuggestion ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
          {visibleSuggestions.map((s) => (
            <button
              key={s.id}
              type="button"
              data-testid={`chat-empty-suggestion-${s.id}`}
              onClick={() => onPickSuggestion(s.prompt)}
              className="inline-flex items-start gap-2 px-3 py-2 rounded-xl bg-panel border border-line text-style-label text-text text-left hover:border-muted hover:bg-panelHi transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              <Icon
                name={s.icon}
                size="sm"
                className={cn("mt-0.5 shrink-0", s.accentClass)}
                aria-hidden
              />
              <span>{s.prompt}</span>
            </button>
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
          {visibleSuggestions.map((s) => (
            <li
              key={s.id}
              className="inline-flex items-start gap-2 px-3 py-2 rounded-xl border border-dashed border-line text-style-label text-muted text-left"
            >
              <Icon
                name={s.icon}
                size="sm"
                className={cn("mt-0.5 shrink-0", s.accentClass)}
                aria-hidden
              />
              <span>{s.prompt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
