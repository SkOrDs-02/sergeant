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
 *
 * Pulse живе на КОНТЕЙНЕРІ, а не на кожному Skeleton: 6 синхронних
 * animate-pulse — це 6 Animation-обʼєктів проти бюджету «max 2
 * concurrent» (Hard Rule #17), а візуально вони і так пульсують як
 * одне ціле. Один pulse на wrapper дає ідентичну картинку одним
 * обʼєктом (design-audit F8).
 */
export function PageLoader() {
  return (
    <div
      className="flex-1 flex flex-col px-4 py-4 gap-3 safe-area-pt-pb motion-safe:animate-pulse"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label={messages.loaders.pageLoading}
    >
      <div className="flex items-center gap-3">
        <Skeleton pulse={false} className="h-10 w-10 rounded-2xl" />
        <div className="flex-1 space-y-2">
          <Skeleton pulse={false} className="h-3.5 w-1/2" />
          <Skeleton pulse={false} className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton pulse={false} className="h-28 w-full" />
      <Skeleton pulse={false} className="h-20 w-full" />
      <Skeleton pulse={false} className="h-20 w-full" />
      <span className="sr-only">{messages.status.loading}</span>
    </div>
  );
}
