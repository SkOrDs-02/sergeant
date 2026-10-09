/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { messages } from "@shared/i18n/uk";

/**
 * Шапка модуля (мова H, redesign v3): кнопка «назад» 44 px ліворуч, назва
 * модуля 26 / 700, під нею контекстний рядок 14 px другим сірим (період,
 * лічильник), праворуч слот дій (один вхід до Сержанта). Без ряду пігулок
 * модулів, без скла, без смужки акценту: колір модуля живе лише в даних.
 *
 *     <ModuleHeader
 *       left={<ModuleHeaderBackButton onClick={onBackToHub} />}
 *       right={<ModuleHeaderAssistantButton />}
 *       title="Фінік"
 *       subtitle="Жовтень"
 *     />
 */

export interface ModuleHeaderProps {
  title?: ReactNode | undefined;
  subtitle?: ReactNode | undefined;
  /**
   * Коротша версія `subtitle` для вузьких екранів (< `sm`): осмислений
   * короткий рядок замість обрізання крапками (VIS-1, аудит 2026-09).
   */
  subtitleShort?: string | undefined;
  left?: ReactNode | undefined;
  right?: ReactNode | undefined;
  /** Override the default title/subtitle body entirely. */
  titleSlot?: ReactNode | undefined;
  /** Модуль шапки: дає `view-transition-name` для морфу з хаба. */
  module?: ModuleAccent | undefined;
  className?: string | undefined;
}

const ICON_BUTTON =
  "shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-text hover:bg-panel transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export function ModuleHeader({
  title,
  subtitle,
  subtitleShort,
  left,
  right,
  titleSlot,
  module,
  className,
}: ModuleHeaderProps) {
  return (
    <div
      className={cn("shrink-0 z-40 relative safe-area-pt bg-bg", className)}
      style={
        module ? { viewTransitionName: `sgt-module-${module}` } : undefined
      }
    >
      <div className="flex min-h-[68px] items-center px-3 py-2 sm:px-4 gap-2">
        {left}
        <div className="min-w-0 flex-1">
          {titleSlot ?? (
            <>
              {title ? (
                // AI-CONTEXT: навмисно `<p>`, не заголовок - назва модуля це
                // хром оболонки, який у DOM-порядку йде ПЕРЕД сторінковим
                // `<h1>` і інвертував би структуру заголовків (#527).
                <p
                  data-testid="module-header-title"
                  className="text-style-headline text-text truncate"
                >
                  {title}
                </p>
              ) : null}
              {subtitle ? (
                // `block` обовʼязковий: `truncate` на інлайн-боксі не діє.
                <span className="block text-style-label text-muted truncate">
                  {subtitleShort ? (
                    <>
                      <span className="sm:hidden">{subtitleShort}</span>
                      <span className="hidden sm:inline">{subtitle}</span>
                    </>
                  ) : (
                    subtitle
                  )}
                </span>
              ) : null}
            </>
          )}
        </div>
        <span data-sync-status-slot className="contents" />
        {right}
      </div>
    </div>
  );
}

export interface ModuleHeaderIconButtonProps {
  onClick: () => void;
  ariaLabel: string;
  title?: string | undefined;
  children: ReactNode;
  className?: string | undefined;
}

/**
 * Кнопка-іконка 44 px у шапці модуля (назад, налаштування).
 */
export function ModuleHeaderIconButton({
  onClick,
  ariaLabel,
  title,
  children,
  className,
}: ModuleHeaderIconButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ICON_BUTTON, className)}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
    >
      {children}
    </button>
  );
}

export interface ModuleHeaderAssistantButtonProps {
  ariaLabel?: string;
  title?: string;
  className?: string;
}

/**
 * Sparkle button that opens the AI-assistant. Lives next to
 * module-specific chrome in the header `right` slot so the assistant is
 * one tap away from every module — mirrors the dashboard FAB without
 * adding another floating affordance on top of module-level FABs
 * (Фінік / Рутина quick-add).
 *
 * Sergeant v2 Phase 7 D5 — tapping no longer navigates to `/chat`; it
 * emits `openChat` on the hub bus so `useAppEffects` opens the bottom-
 * sheet overlay over the current module surface. The `/chat` route
 * remains mounted for deep-link / notification entry — see
 * `HubChatOverlay.tsx` for the rationale.
 */
export function ModuleHeaderAssistantButton({
  ariaLabel = "Відкрити Сержанта",
  title,
  className,
}: ModuleHeaderAssistantButtonProps = {}) {
  return (
    <button
      type="button"
      onClick={() => {
        hapticTap();
        emitHubBus("openChat", { message: null, autoSend: false });
      }}
      className={cn(ICON_BUTTON, className)}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {/* Шеврони Сержанта — той самий гліф, що `Icon name="sergeant"`
            (Icon.paths.status.tsx), вписаний руками з тієї ж причини, що й
            іконки перемикача нижче: не тягнути реєстр Icon у шапку. Іскра
            тут пережила прохід F2 анти-слоп аудиту 2026-09-01 саме тому,
            що не проходила через реєстр і не ловилась грепом за назвою. */}
        <circle cx="12" cy="3.5" r="1.6" fill="currentColor" stroke="none" />
        <path d="M5 11l7-4 7 4" />
        <path d="M5 16l7-4 7 4" />
        <path d="M5 21l7-4 7 4" />
      </svg>
    </button>
  );
}

export interface ModuleHeaderBackButtonProps {
  onClick: () => void;
  /** Видимий підпис біля шеврона. За замовчуванням лише шеврон 44 px. */
  label?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * "Back" button — steps back one in-app entry (`useHubNavigation.goBackOrHub`
 * falls back to the hub itself when there's no history to step through).
 * Always reads "Назад": the adjacent {@link ModuleHeaderHubButton} is the
 * dedicated always-hub affordance, so this button no longer needs to lie
 * about its destination on a fresh/deep-link entry (round-2 UI audit X3 —
 * users landing on a deep link never saw a way to reach the hub because
 * this button rendered but the label/behavior split was implicit).
 */
export function ModuleHeaderBackButton({
  onClick,
  label,
  ariaLabel = "Назад",
  className,
}: ModuleHeaderBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        // `h-11 min-h-[44px]` — round-2 UI audit X3 requires this pair
        // (back + hub) meet the 44px touch-target floor explicitly, even
        // though other module-header icon buttons in this file stayed at
        // 40px (pre-existing, out of scope here).
        ICON_BUTTON,
        "-ml-1 gap-1.5",
        label && "w-auto px-2",
        className,
      )}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {label ? <span className="text-style-label">{label}</span> : null}
    </button>
  );
}

export interface ModuleHeaderHubButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Dedicated "always go to hub" icon button — pairs with
 * {@link ModuleHeaderBackButton} so a one-tap hub exit is reachable from any
 * navigation depth, including a cold-start deep link where `goBackOrHub`
 * would otherwise be the only exit and history-dependent (round-2 UI audit
 * X3, owner decision 2026-07-12).
 */
export function ModuleHeaderHubButton({
  onClick,
  ariaLabel = "На хаб",
  className,
}: ModuleHeaderHubButtonProps) {
  return (
    <ModuleHeaderIconButton
      onClick={onClick}
      ariaLabel={ariaLabel}
      className={className}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V9.5" />
      </svg>
    </ModuleHeaderIconButton>
  );
}

/**
 * Plain chevron-only back button (no label). Used inside a module when a
 * sub-page (e.g. Atlas, Exercise) wants to return to the module's own
 * dashboard rather than the global hub.
 */
export function ModuleHeaderChevronButton({
  onClick,
  ariaLabel = "Назад",
  className,
}: {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ICON_BUTTON, "-ml-1", className)}
      aria-label={ariaLabel}
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}

export interface ModuleHeaderSettingsButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  title?: string;
  className?: string;
}

/**
 * Gear-icon button in module headers that deep-links to the module's
 * Settings section in the hub. PR-2 UX-roast 2026-Q2.
 */
export function ModuleHeaderSettingsButton({
  onClick,
  ariaLabel = messages.modules.openSettings,
  title,
  className,
}: ModuleHeaderSettingsButtonProps) {
  return (
    <ModuleHeaderIconButton
      onClick={onClick}
      ariaLabel={ariaLabel}
      title={title ?? ariaLabel}
      className={className}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    </ModuleHeaderIconButton>
  );
}
