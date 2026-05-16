/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Mount inside the top-level error boundary
 *           (`apps/web/src/core/App.tsx`) as the fallback for unrecoverable
 *           render-time exceptions, and register `/500` in
 *           `StandaloneRoutes.tsx`. Once a consumer renders it, drop the tag.
 *
 * Canonical `/500` (server-error) surface. Composed from the design-system
 * `<EmptyState>` primitive + `ServerErrorIllustration`, the same a11y and
 * motion guarantees ship here for free. Intended for the top-level error
 * boundary when an unrecoverable render-time exception happens inside the
 * app shell. The primary CTA reloads the current page instead of
 * navigating — a server 500 is often transient, and reloading is the
 * minimal action the user can take with the highest chance of recovery.
 */
import { Button, EmptyState, Icon } from "@shared/components/ui";
import { ServerErrorIllustration } from "@assets/illustrations";

export interface ServerErrorPageProps {
  /** Forward a `resetErrorBoundary()` if available. */
  onReset?: () => void;
}

export function ServerErrorPage({ onReset }: ServerErrorPageProps) {
  const reload = () => {
    if (onReset) {
      onReset();
    } else {
      window.location.reload();
    }
  };

  return (
    <main className="min-h-svh flex items-center justify-center bg-bg px-6">
      <EmptyState
        size="lg"
        variant="danger"
        eyebrow="500"
        illustration={<ServerErrorIllustration size={200} />}
        title="Щось пішло не так"
        description="Сервер тимчасово не зміг обробити запит. Спробуй оновити сторінку — зазвичай це допомагає."
        primaryAction={
          <Button type="button" variant="primary" size="lg" onClick={reload}>
            <Icon name="refresh-cw" size={16} />
            Оновити сторінку
          </Button>
        }
        hint="Якщо помилка повторюється — напиши нам, ми вже працюємо над цим."
      />
    </main>
  );
}
