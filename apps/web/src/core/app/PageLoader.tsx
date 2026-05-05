import { Skeleton } from "@shared/components/ui/Skeleton";
import { messages } from "@shared/i18n/uk";

/**
 * Skeleton-плейсхолдер, який використовується як Suspense fallback для
 * lazy-модулів. Замінив текстовий "Завантаження…" на скелетон, що
 * імітує реальну структуру хабу: шапка + 3 картки. Це різко скорочує
 * перцептивне очікування (немає порожнього екрану) й усуває CLS у
 * момент, коли модуль фактично приїжджає.
 *
 * motion-safe: `animate-pulse` вимикається при `prefers-reduced-motion`.
 */
export function PageLoader() {
  return (
    <div
      className="flex-1 flex flex-col px-4 py-4 gap-3 safe-area-pt-pb"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={messages.loaders.pageLoading}
    >
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-2xl motion-safe:animate-pulse" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/2 motion-safe:animate-pulse" />
          <Skeleton className="h-3 w-1/3 motion-safe:animate-pulse" />
        </div>
      </div>
      <Skeleton className="h-28 w-full motion-safe:animate-pulse" />
      <Skeleton className="h-20 w-full motion-safe:animate-pulse" />
      <Skeleton className="h-20 w-full motion-safe:animate-pulse" />
      <span className="sr-only">{messages.status.loading}</span>
    </div>
  );
}
