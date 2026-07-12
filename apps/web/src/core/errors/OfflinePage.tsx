/**
 * @scaffolded
 * @owner @Skords-01
 * @nextStep Register the `/offline` path in `StandaloneRoutes.tsx`
 *           (`apps/web/src/core/app/StandaloneRoutes.tsx`) and add the
 *           offline navigation-fallback to `apps/web/src/sw.ts` precache
 *           strategy. Once mounted, drop the tag.
 *
 * Canonical `/offline` surface. Intended to be shown by the service worker
 * when the browser can't reach the network and no cached page is available,
 * and mountable as a standalone route by `StandaloneRoutes`. Uses the
 * `<EmptyState>` primitive + `OfflineIllustration` so the page inherits
 * the design system's a11y, motion, and dark-mode recolouring contracts.
 *
 * The tone follows the brandbook voice: warning, not danger. "bg-warning"
 * reads as "we're paused, not broken" — data is queued, not lost
 * (per `docs/design/design-system.md` § 15 Offline).
 */
import { Button, EmptyState, Icon } from "@shared/components/ui";
import { OfflineIllustration } from "@assets/illustrations";
import { useOnlineStatus } from "@shared/hooks";

export function OfflinePage() {
  const online = useOnlineStatus();
  const statusMsg = online
    ? "Зʼєднання відновлено. Натисни «Спробувати ще», щоб продовжити."
    : "Немає інтернет-зʼєднання. Дані збережено локально.";
  return (
    <main className="min-h-svh flex items-center justify-center bg-bg px-6">
      {/* aria-live region announces connectivity changes to screen readers */}
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {statusMsg}
      </p>
      <EmptyState
        size="lg"
        variant="warning"
        eyebrow="Офлайн"
        illustration={<OfflineIllustration size={200} />}
        title="Немає зʼєднання"
        description={
          online
            ? "Зараз немає інтернету, але дані не загубляться — вони збережуться локально і синхронізуються, коли зʼєднання повернеться."
            : "Зʼєднання ще не повернулося. Дані збережуться локально і синхронізуються автоматично — зачекай хвильку або спробуй пізніше."
        }
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!online}
            onClick={() => {
              if (
                typeof navigator !== "undefined" &&
                navigator.onLine === false
              ) {
                return;
              }
              window.location.reload();
            }}
          >
            <Icon name="refresh-cw" size={16} />
            {online ? "Спробувати ще" : "Очікуємо мережу…"}
          </Button>
        }
        hint="Модулі Фінік, Фізрук, Рутина та Їжа зберігають дані офлайн — вони доступні навіть без мережі."
      />
    </main>
  );
}
