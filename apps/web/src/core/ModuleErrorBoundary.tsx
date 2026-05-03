import { Component, type ReactNode } from "react";

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
}

/**
 * Ловить помилки рендеру всередині lazy-модуля; дозволяє повернутися до хаба
 * без перезавантаження вкладки.
 *
 * Дві дії:
 *  - "Спробувати ще" — скидає `error` і через зміну `retryRev` як
 *    React-ключа примусово перемонтовує модульне піддерево;
 *  - "До вибору модуля" — повертає у хаб (логіка делегується parent-у).
 */
export default class ModuleErrorBoundary extends Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { error: null, retryRev: 0 };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  private handleRetry = () => {
    this.setState((s) => ({ error: null, retryRev: s.retryRev + 1 }));
  };

  private handleBack = () => {
    this.setState({ error: null });
    this.props.onBackToHub();
  };

  override render() {
    if (this.state.error) {
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
          <p className="text-sm text-muted mb-2 text-center">
            Помилка в модулі
          </p>
          <pre className="text-xs text-danger mb-6 max-w-lg w-full overflow-auto whitespace-pre-wrap break-words">
            {this.state.error.message}
          </pre>
          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs">
            <button
              type="button"
              onClick={this.handleRetry}
              className="flex-1 px-5 py-2.5 rounded-2xl bg-primary text-bg text-style-label shadow-card hover:brightness-110 transition-[filter,box-shadow,opacity] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
              aria-label="Спробувати ще раз"
            >
              Спробувати ще
            </button>
            <button
              type="button"
              onClick={this.handleBack}
              className="flex-1 px-5 py-2.5 rounded-2xl bg-panel border border-line text-text text-style-label shadow-card hover:shadow-float transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              До вибору модуля
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
