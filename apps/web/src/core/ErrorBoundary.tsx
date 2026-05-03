import { Component, type ErrorInfo, type ReactNode } from "react";
import { captureException } from "./observability/sentry";
import { isChunkLoadError, reloadOnceForChunkError } from "./lib/chunkReload";

interface FallbackProps {
  error: Error;
  resetError: () => void;
}

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((props: FallbackProps) => ReactNode);
}

interface ErrorBoundaryState {
  error: Error | null;
  copied: boolean;
}

/**
 * Витягуємо `requestId` з помилки, якщо помилка — `ApiError`-сумісна.
 * Не імпортуємо `ApiError` напряму, щоб не тягнути api-client у головний
 * бандл і зберегти duck-typing (помилки з SW/інших джерел теж можуть
 * мати `requestId`).
 */
function extractRequestId(error: unknown): string | undefined {
  if (error == null || typeof error !== "object") return undefined;
  const id = (error as { requestId?: unknown }).requestId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

/** 5xx або network-kind ApiError — кейси, де requestId максимально цінний. */
function isServerLikeError(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const status = (error as { status?: unknown }).status;
  if (typeof status === "number" && status >= 500 && status < 600) return true;
  const kind = (error as { kind?: unknown }).kind;
  return kind === "network" || kind === "parse";
}

/**
 * Лайтвейтний корневий ErrorBoundary — zero-cost у головному бандлі.
 *
 * Навмисно не використовує `Sentry.ErrorBoundary` з `@sentry/react`, бо той
 * статично підтягує весь SDK (~30–40 KB gzip) у initial chunk — див. правило
 * у `.agents/skills/sergeant-web-ui/SKILL.md`
 * (defer non-critical third-party libraries).
 *
 * `captureException` з `./sentry.js` — no-op, поки Sentry не завантажений
 * динамічним імпортом. Коли SDK буде готовий (див. `initSentry`), виклики
 * автоматично перенаправляться в реальний `Sentry.captureException`.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  resetError: () => void;
  copyRequestId: () => void;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, copied: false };
    this.resetError = () => this.setState({ error: null, copied: false });
    this.copyRequestId = () => {
      const id = extractRequestId(this.state.error);
      if (!id) return;
      const fallbackCopy = () => {
        try {
          const ta = document.createElement("textarea");
          ta.value = id;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          document.body.removeChild(ta);
        } catch {
          /* noop */
        }
      };
      const finish = () => {
        this.setState({ copied: true });
        setTimeout(() => this.setState({ copied: false }), 1500);
      };
      try {
        if (
          typeof navigator !== "undefined" &&
          navigator.clipboard?.writeText
        ) {
          navigator.clipboard.writeText(id).then(finish, () => {
            fallbackCopy();
            finish();
          });
          return;
        }
      } catch {
        /* fallthrough */
      }
      fallbackCopy();
      finish();
    };
  }

  static getDerivedStateFromError(error: Error) {
    // Stale-bundle recovery: якщо це `Failed to fetch dynamically imported
    // module` після деплою (нові хеші чанків), пробуємо одноразовий
    // `location.reload()` — cooldown через sessionStorage страхує від
    // нескінченного циклу, якщо це не stale-кеш, а реальна поломка.
    if (isChunkLoadError(error) && reloadOnceForChunkError()) {
      return { error: null, copied: false };
    }
    return { error, copied: false };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    if (isChunkLoadError(error)) return;
    // Lazy-forward: якщо Sentry SDK ще не підтягнувся, це no-op;
    // якщо вже підтягнувся — піде у Sentry.captureException.
    // Передаємо `requestId` як tag — Sentry склеїть подію з логом сервера.
    const requestId = extractRequestId(error);
    try {
      captureException(error, {
        contexts: { react: { componentStack: info?.componentStack } },
        tags: requestId ? { requestId } : undefined,
      });
    } catch {
      /* noop — error boundary не має ламатись через телеметрію */
    }
  }

  override render() {
    const { error, copied } = this.state;
    const { fallback: Fallback, children } = this.props;
    if (error) {
      if (typeof Fallback === "function") {
        return <Fallback error={error} resetError={this.resetError} />;
      }
      if (Fallback) return Fallback;
      // Default crash-recovery screen — shown when no custom fallback was
      // provided. Gives the user a clear "something went wrong" message
      // with a retry button instead of a blank white screen.
      const requestId = extractRequestId(error);
      const showRequestId = !!requestId && isServerLikeError(error);
      return (
        <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-text safe-area-pt-pb">
          <div className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-4">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-style-title text-text mb-1">Щось пішло не так</h1>
          <p className="text-sm text-muted mb-4 text-center max-w-xs">
            Виникла непередбачена помилка. Спробуй перезавантажити сторінку.
          </p>
          <pre className="text-xs text-danger/80 mb-4 max-w-lg w-full overflow-auto whitespace-pre-wrap wrap-break-word bg-panel rounded-xl p-3 border border-line">
            {error.message}
          </pre>
          {showRequestId && (
            <div
              className="mb-6 max-w-lg w-full bg-panel rounded-xl p-3 border border-line flex items-center gap-2"
              data-testid="error-request-id"
            >
              <span className="text-xs text-muted shrink-0">requestId:</span>
              <code className="text-xs text-text font-mono truncate flex-1">
                {requestId}
              </code>
              <button
                type="button"
                onClick={this.copyRequestId}
                aria-label="Скопіювати requestId"
                className="text-xs px-2 py-1 rounded-md bg-bg border border-line text-text hover:bg-panel/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              >
                {copied ? "Скопійовано" : "Копіювати"}
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={this.resetError}
              className="flex-1 px-5 py-2.5 rounded-2xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              Спробувати ще
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 px-5 py-2.5 rounded-2xl bg-panel border border-line text-text text-style-label shadow-card hover:shadow-float transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              Перезавантажити
            </button>
          </div>
        </div>
      );
    }
    return children;
  }
}
