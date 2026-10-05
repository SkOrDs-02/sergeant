import { Component, type ReactNode } from "react";
import { messages } from "@shared/i18n/uk";
import {
  extractRequestId,
  isServerLikeError,
  copyRequestIdToClipboard,
  makeCopyDoneCallback,
} from "./observability/requestId";
import { trackEvent, ANALYTICS_EVENTS } from "./observability/analytics";
import { isChunkLoadError, reloadOnceForChunkError } from "./lib/chunkReload";

interface ModuleErrorBoundaryProps {
  onBackToHub: () => void;
  children?: ReactNode;
}

interface ModuleErrorBoundaryState {
  error: Error | null;
  /** Rev-лічильник, який використовуємо як React `key`, щоб під час
   *  ретраю піддерево ремонтувалось чисто — простий `setState({error:null})`
   *  не завжди цього робить, якщо помилка була кинута у `useEffect`
   *  (той самий effect може повторно кинути). */
  retryRev: number;
  copied: boolean;
}

/**
 * Ловить помилки рендеру всередині lazy-модуля; дозволяє повернутися до хаба
 * без перезавантаження вкладки.
 *
 * Дві дії:
 *  - "Спробувати ще" — скидає `error` і через зміну `retryRev` як
 *    React-ключа примусово перемонтовує модульне піддерево;
 *  - "До вибору модуля" — повертає у хаб (логіка делегується parent-у).
 *
 * Збій завантаження чанка (`isChunkLoadError`) — окремий випадок: модуль —
 * singleton `React.lazy`, який назавжди кешує відхилений `import()`, тож
 * ремаунт (retry) повторно кидає ту саму помилку. Для нього замість
 * "Спробувати ще" показуємо "Перезавантажити" (`window.location.reload()`),
 * а `componentDidCatch` робить одне охоронюване авто-перезавантаження
 * (`reloadOnceForChunkError`, cooldown + MAX_RELOADS — як у ChunkErrorBoundary).
 */
export default class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { error: null, retryRev: 0, copied: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    // Авто-відновлення: одне охоронюване перезавантаження підтягує свіжий
    // HTML і хеші чанків. Коли guard відмовляє — render() дає ручну кнопку.
    if (isChunkLoadError(error)) reloadOnceForChunkError();
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleRetry = () => {
    this.setState((s) => ({
      error: null,
      retryRev: s.retryRev + 1,
      copied: false,
    }));
  };

  private handleBack = () => {
    this.setState({ error: null, copied: false });
    this.props.onBackToHub();
  };

  private handleCopyRequestId = () => {
    const id = extractRequestId(this.state.error);
    if (!id) return;
    const finish = makeCopyDoneCallback((update) => this.setState(update));
    // Fire the COPIED event from the copy-completion callback (not
    // synchronously before the async clipboard write resolves) so the
    // analytics signal tracks an actually-completed copy + the
    // "Скопійовано" flash, rather than every button press (cubic review).
    copyRequestIdToClipboard(id, () => {
      finish();
      try {
        trackEvent(ANALYTICS_EVENTS.ERROR_BOUNDARY_REQUEST_ID_COPIED, {
          scope: "module",
          request_id: id,
        });
      } catch {
        /* analytics must not break error recovery UI */
      }
    });
  };

  override render() {
    if (this.state.error) {
      const requestId = extractRequestId(this.state.error);
      const showRequestId = !!requestId && isServerLikeError(this.state.error);
      const isChunkError = isChunkLoadError(this.state.error);
      return (
        <div className="min-h-dvh bg-bg flex flex-col items-center justify-center p-6 text-text safe-area-pt-pb">
          <div className="w-12 h-12 rounded-2xl bg-danger/10 text-danger flex items-center justify-center mb-3">
            <svg
              width="24"
              height="24"
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
          <p className="text-style-body text-muted mb-2 text-center">
            {isChunkError
              ? messages.errors.generic.sectionFailed
              : messages.errors.generic.moduleFailed}
          </p>
          {import.meta.env.DEV && (
            <pre className="text-style-code text-danger-strong dark:text-danger mb-6 max-w-lg w-full overflow-auto whitespace-pre-wrap wrap-break-word">
              {this.state.error.message}
            </pre>
          )}
          {showRequestId && (
            <div
              className="mb-6 max-w-xs w-full bg-panel rounded-xl p-3 border border-line flex items-center gap-2"
              data-testid="module-error-request-id"
            >
              <span className="text-style-caption text-muted shrink-0">
                requestId:
              </span>
              <code className="text-style-code text-text font-mono truncate flex-1">
                {requestId}
              </code>
              <button
                type="button"
                onClick={this.handleCopyRequestId}
                aria-label={messages.errors.generic.copyRequestIdAria}
                className="text-style-label px-2 py-1 rounded-md bg-bg border border-line text-text hover:bg-panel/60 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
              >
                {this.state.copied
                  ? messages.toast.copied
                  : messages.errors.generic.copyRequestId}
              </button>
            </div>
          )}
          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
            {isChunkError ? (
              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 min-h-[44px] min-w-[44px] px-5 py-2.5 rounded-2xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter,box-shadow,opacity] focus-ring"
              >
                {messages.actions.reload}
              </button>
            ) : (
              <button
                type="button"
                onClick={this.handleRetry}
                className="flex-1 px-5 py-2.5 rounded-2xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
                aria-label={messages.actions.tryAgain}
              >
                {messages.sync.retryCta}
              </button>
            )}
            <button
              type="button"
              onClick={this.handleBack}
              className="flex-1 px-5 py-2.5 rounded-2xl bg-panel border border-line text-text text-style-label shadow-card hover:shadow-float transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45"
            >
              {messages.errors.generic.backToModulePicker}
            </button>
          </div>
        </div>
      );
    }
    // Зміна `retryRev` примусово ремонтує дерево — без цього useEffect
    // всередині модуля може повторно кинути ту ж саму помилку.
    return (
      <div key={this.state.retryRev} className="contents">
        {this.props.children}
      </div>
    );
  }
}
