/**
 * Last validated: 2026-08-17
 * Status: Active
 *
 * Small presentational helpers extracted out of `FinykApp.tsx` (Hard Rule
 * #18 headroom — the shell was already near the 600-line
 * skipBlankLines+skipComments cap before the receipt-scan entry points
 * landed). No behavior change from the original inline definitions.
 */
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import type { SyncTone } from "./components/SyncIndicator";

export function FinykHeaderIcon(): React.ReactElement {
  // F1-style ink glyph (BentoCard): icon sits inline with the title row as
  // a colored glyph, not boxed in a tinted square container.
  return (
    <span
      className="shrink-0 text-success-strong dark:text-success"
      aria-hidden
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
      >
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    </span>
  );
}

interface SyncPillProps {
  syncTone: SyncTone;
}

export function SyncPill({ syncTone }: SyncPillProps): React.ReactElement {
  return (
    <div
      className={cn(
        // На вузьких екранах здоровий «ок»-стан ховаємо повністю: header-рядок
        // фіксованої ширини (Назад + Хаб + око + асистент + налаштування) не
        // лишає місця, і pill виштовхував/перекривав заголовок модуля. Стани,
        // що вимагають уваги, лишаються видимими скрізь — див. `needsAttention`
        // у `SyncIndicator.getSyncTone`.
        syncTone.needsAttention ? "flex" : "hidden sm:flex",
        "items-center gap-1.5 select-none shrink-0",
        "text-style-caption px-1.5 sm:px-2 py-0.5 rounded-full border",
        "transition-colors duration-base",
        syncTone.pill,
      )}
      role="status"
      aria-label={`Стан синхронізації: ${syncTone.text}`}
    >
      {/* Іконка — другий, не-кольоровий канал стану: сама крапка одна на
          вузьких екранах (текст ховається `hidden sm:inline`) не дає зрячим
          людям розрізнити 5 станів без кольору. */}
      <Icon name={syncTone.icon} size="xs" className="shrink-0" />
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", syncTone.dot)} />
      <span className="hidden sm:inline">{syncTone.text}</span>
    </div>
  );
}

interface AuthErrorBannerProps {
  authError: string;
  /**
   * Відкриває Налаштування Hub на секції Фініка (`FinykWebhookServiceSection`
   * — форма перепідключення токена). До фіксу PR-F2 (аудит 2026-09-13) CTA
   * тут кликав `onBackToHub` («Назад»), хоча підпис обіцяв Налаштування —
   * людина верталась у Hub і мусила самостійно шукати шлях назад до Фініка.
   */
  onOpenSettings?: (() => void) | undefined;
  onOpenAuth: () => void;
  setAuthError: (msg: string) => void;
}

export function AuthErrorBanner({
  authError,
  onOpenSettings,
  onOpenAuth,
  setAuthError,
}: AuthErrorBannerProps): React.ReactElement {
  // Той самий банер несе і «потрібен акаунт» (сесійний 401 аноніма): під
  // заголовком про токен і з кнопкою «Оновити токен» людина з цілим токеном
  // ішла його перегенеровувати.
  const needsAccount =
    authError === messages.finyk.monoConnectErrors.accountRequired;
  // Offset clears the in-flow ModuleHeader stack: safe-area-pt + 68px title
  // row (min-h-[68px], ModuleHeader.tsx) + ~40px ModuleSwitcher row.
  return (
    <div
      role="alert"
      className="fixed top-[calc(108px+env(safe-area-inset-top,0)+8px)] left-4 right-4 z-50 max-w-lg mx-auto"
    >
      <div className="bg-warning/15 border border-warning/40 rounded-2xl px-4 py-3 flex items-start gap-3 shadow-card">
        <Icon
          name="alert-triangle"
          size={18}
          className="shrink-0 mt-0.5 text-warning-strong dark:text-warning"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-style-label text-text">
            {needsAccount ? "Потрібен вхід" : "Токен потребує оновлення"}
          </p>
          <p className="text-style-caption text-muted mt-0.5">{authError}</p>
          {needsAccount ? (
            <button
              type="button"
              onClick={onOpenAuth}
              className="touch-target focus-ring rounded-xl text-style-caption text-primary mt-2 hover:underline"
            >
              Увійти
            </button>
          ) : (
            onOpenSettings && (
              <button
                type="button"
                onClick={onOpenSettings}
                className="touch-target focus-ring rounded-xl text-style-caption text-primary mt-2 hover:underline"
              >
                Оновити токен у Налаштуваннях
              </button>
            )
          )}
        </div>
        <button
          type="button"
          onClick={() => setAuthError("")}
          className="touch-target focus-ring rounded-xl text-muted hover:text-text transition-colors shrink-0"
          aria-label="Закрити"
        >
          <Icon name="close" size="md" aria-hidden />
        </button>
      </div>
    </div>
  );
}
