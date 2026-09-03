/**
 * @status Active
 * @owner @Skords-01
 *
 * Canonical `/500` (server-error) surface. Composed from the design-system
 * `<EmptyState>` primitive + `ServerErrorIllustration`, the same a11y and
 * motion guarantees ship here for free. Mounted as the top-level
 * `<ErrorBoundary>` fallback (`main.tsx`) for unrecoverable render-time
 * exceptions, and also registered as a directly-navigable standalone route
 * (`SERVER_ERROR_PATH` in `StandaloneRoutes.tsx`). The primary CTA reloads
 * the current page instead of navigating — a server 500 is often transient,
 * and reloading is the minimal action the user can take with the highest
 * chance of recovery.
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
      {/* aria-live region announces the server error to screen readers */}
      <p
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      >
        Помилка сервера. Щось пішло не так, спробуй оновити сторінку.
      </p>
      <EmptyState
        size="lg"
        variant="danger"
        eyebrow="500"
        illustration={<ServerErrorIllustration size={200} />}
        title="Щось пішло не так"
        description="Сервер тимчасово не зміг обробити запит. Спробуй оновити сторінку, зазвичай це допомагає."
        primaryAction={
          <Button type="button" variant="primary" size="lg" onClick={reload}>
            <Icon name="refresh-cw" size={16} />
            Оновити сторінку
          </Button>
        }
        // §2: «ми» тут жива команда, до якої людину і просять написати, а не
        // голос застосунку (той самий випадок, що в `NotFoundPage`).
        //
        // Але «ми ВЖЕ ПРАЦЮЄМО над цим» звідси прибрано: це статичний рядок на
        // будь-яку 500-ку, включно з тією, якої ніхто ще не бачив, тобто
        // обіцянка без підстав (browser-QA 2026-09-02). Лишається те, що
        // справді залежить від нас, і воно настає ПІСЛЯ повідомлення.
        // eslint-disable-next-line sergeant-design/ukrainian-copy -- голос команди, не продукту
        hint="Якщо помилка повторюється, напиши нам, і ми розберемось."
      />
    </main>
  );
}
