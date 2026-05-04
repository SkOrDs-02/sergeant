import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";

export interface NoBankBannerProps {
  onConnect: () => void;
  onContinueManually: () => void;
}

/**
 * Inline banner shown at the top of FinykApp when the user has no
 * connected Monobank token and has not yet opted into the explicit
 * "manual only" mode (`finyk_manual_only_v1`).
 *
 * Replaces the previous hard-gate — visiting Finyk directly used to
 * dead-end on `FinykLoginScreen` until the user pasted a token or
 * clicked «Почати без банку». That funnelled FTUX users into the bank
 * connection flow as if it were the only path; in reality manual
 * expenses + budgets cover the empty-state happy path on their own.
 *
 * The banner offers both actions side-by-side without blocking the
 * underlying Finyk UI, matching S4.4 of `docs/launch/ftux-sprint-plan.md`.
 */
export function NoBankBanner({
  onConnect,
  onContinueManually,
}: NoBankBannerProps) {
  return (
    <div
      className="mx-3 mt-3 mb-1 rounded-2xl border border-line bg-panel p-4 shadow-card"
      role="region"
      aria-label="Підключення Monobank"
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-xl bg-finyk/15 text-finyk-strong dark:text-finyk flex items-center justify-center"
          aria-hidden
        >
          <Icon name="credit-card" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-style-label text-text">Без банку?</h3>
          <p className="text-xs text-muted mt-1 leading-snug">
            Записуй витрати вручну — або підключи Monobank, щоб транзакції
            підтягувались автоматично. Підключити можна пізніше з Налаштувань.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="primary"
          module="finyk"
          size="sm"
          className="flex-1 min-h-[40px]"
          onClick={onConnect}
        >
          Підключити Monobank
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1 min-h-[40px]"
          onClick={onContinueManually}
        >
          Без банку — продовжити
        </Button>
      </div>
    </div>
  );
}
