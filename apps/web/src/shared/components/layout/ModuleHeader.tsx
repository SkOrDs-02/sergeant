/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useState, type ReactNode } from "react";
import type { ModuleAccent } from "@sergeant/design-tokens";
import { cn } from "@shared/lib/ui/cn";
import { hapticTap } from "@shared/lib/adapters/haptic";
import { emitHubBus } from "@shared/lib/modules/hubBus";
import { ModuleSwitcherSheet } from "./ModuleSwitcherSheet";

/**
 * Шапка модуля (мова H, redesign v3.1): ліворуч «додому» 44 px (на вкладених
 * сторінках перед ним «назад» на сторінку вище), назва модуля 26 / 700, під
 * нею лише контекстний рядок 14 px другим сірим (період, лічильник),
 * праворуч один вхід до Сержанта. З `switcher` назва стає кнопкою «Назва ⌄»,
 * що відкриває аркуш «Модулі» (`ModuleSwitcherSheet`).
 *
 *     <ModuleHeader
 *       module="finyk"
 *       switcher="finyk"
 *       onOpenSettings={onOpenSettings}
 *       left={<ModuleHeaderHubButton onClick={onGoToHub} />}
 *       right={<ModuleHeaderAssistantButton />}
 *       title="Фінік"
 *     />
 */

export interface ModuleHeaderProps {
  title?: ReactNode | undefined;
  subtitle?: ReactNode | undefined;
  left?: ReactNode | undefined;
  right?: ReactNode | undefined;
  /** Override the default title/subtitle body entirely. */
  titleSlot?: ReactNode | undefined;
  /** Модуль шапки: дає `view-transition-name` для морфу з хаба. */
  module?: ModuleAccent | undefined;
  /** Поточний модуль перемикача: назва стає кнопкою, що відкриває аркуш «Модулі». */
  switcher?: ModuleAccent | undefined;
  /** Останній рядок аркуша «Модулі»: налаштування поточного модуля. */
  onOpenSettings?: (() => void) | undefined;
  className?: string | undefined;
}

const ICON_BUTTON =
  "shrink-0 w-11 h-11 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg text-text hover:bg-panel transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-bg";

export function ModuleHeader({
  title,
  subtitle,
  left,
  right,
  titleSlot,
  module,
  switcher,
  onOpenSettings,
  className,
}: ModuleHeaderProps) {
  const [switcherOpen, setSwitcherOpen] = useState(false);
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
              {/* AI-CONTEXT: назва навмисно `<p>` / `<button>`, не заголовок -
                  це хром оболонки, який у DOM-порядку йде ПЕРЕД сторінковим
                  `<h1>` і інвертував би структуру заголовків (#527). */}
              {title && switcher ? (
                <button
                  type="button"
                  data-testid="module-header-title"
                  aria-haspopup="dialog"
                  aria-expanded={switcherOpen}
                  onClick={() => {
                    hapticTap();
                    setSwitcherOpen(true);
                  }}
                  className="-ml-1 flex min-h-[44px] max-w-full items-center gap-1 rounded-lg px-1 text-style-headline text-text focus-ring"
                >
                  <span className="truncate">{title}</span>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-subtle"
                    aria-hidden
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>
              ) : title ? (
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
                  {subtitle}
                </span>
              ) : null}
            </>
          )}
        </div>
        <span data-sync-status-slot className="contents" />
        {right}
      </div>
      {switcher ? (
        <ModuleSwitcherSheet
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          current={switcher}
          onOpenSettings={onOpenSettings}
        />
      ) : null}
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
 * Кнопка-іконка 44 px у шапці модуля (додому).
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

export interface ModuleHeaderHubButtonProps {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Dedicated "always go to hub" icon button — pairs with
 * the contextual back on nested pages, so a one-tap hub exit is reachable
 * from any navigation depth, including a cold-start deep link (round-2 UI
 * audit X3, owner decision 2026-07-12). On a module overview it is the only
 * left action (redesign v3.1).
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
