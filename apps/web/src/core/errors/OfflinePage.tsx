/**
 * @status Active
 * @owner @Skords-01
 *
 * Canonical `/offline` surface. Shown by the service worker when the
 * browser can't reach the network and no cached page is available (the
 * "offline navigation-fallback" in the `sw.ts` precache strategy). Also
 * mountable as a standalone route by `StandaloneRoutes`. Uses the
 * `<EmptyState>` primitive + `OfflineIllustration` so the page inherits
 * the design system's a11y, motion, and dark-mode recolouring contracts.
 *
 * The tone follows the brandbook voice: warning, not danger. "bg-warning"
 * reads as "we're paused, not broken" — data is queued, not lost
 * (per `docs/design/design-system.md` § 15 Offline).
 */
import { Button, EmptyState, Icon } from "@shared/components/ui";
import { OfflineIllustration } from "@assets/illustrations";

export function OfflinePage() {
  return (
    <main className="min-h-svh flex items-center justify-center bg-bg px-6">
      <EmptyState
        size="lg"
        variant="warning"
        eyebrow="Офлайн"
        illustration={<OfflineIllustration size={200} />}
        title="Немає зʼєднання"
        description="Зараз немає інтернету, але дані не загубляться — вони збережуться локально і синхронізуються, коли зʼєднання повернеться."
        primaryAction={
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={() => {
              window.location.reload();
            }}
          >
            <Icon name="refresh-cw" size={16} />
            Спробувати ще
          </Button>
        }
        hint="Модулі Фінік, Фізрук, Рутина та Харчування зберігають дані офлайн — вони доступні навіть без мережі."
      />
    </main>
  );
}
