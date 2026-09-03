/**
 * @status Active
 * @owner @Skords-01
 *
 * Canonical `/offline` surface, registered as a standalone route in
 * `StandaloneRoutes.tsx` (`OFFLINE_PATH`). The service worker's offline
 * navigation fallback (`sw/cache.ts`'s `setCatchHandler`, page-audit-10 F1)
 * already serves the precached SPA shell for any uncached navigation while
 * offline, so this page is reachable that way too — no separate SW change
 * needed once the client route exists. Uses the `<EmptyState>` primitive +
 * `OfflineIllustration` so the page inherits the design system's a11y,
 * motion, and dark-mode recolouring contracts.
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
  // AI-DANGER: усі чотири підписи мусять читати ОДИН стан. До 2026-09-03
  // сторінка суперечила сама собі: жива область для читача екрана казала
  // «Зʼєднання відновлено», а видимий опис поруч — «Зараз немає інтернету»,
  // бо тернарник опису стояв навиворіт. Обидві його гілки при цьому були
  // написані для офлайну, тобто копії для стану «мережа повернулась» не
  // існувало взагалі, а заголовок і надзаголовок лишались статичними
  // («Офлайн», «Немає зʼєднання») навіть тоді, коли кнопка вже пропонувала
  // «Спробувати ще» (browser-QA 2026-09-02).
  const copy = online
    ? {
        eyebrow: "Онлайн",
        title: "Зʼєднання відновлено",
        description:
          "Мережа знову є. Натисни «Спробувати ще», щоб повернутись туди, де ти зупинився.",
      }
    : {
        eyebrow: "Офлайн",
        title: "Немає зʼєднання",
        description:
          "Зараз немає інтернету, але дані не загубляться: вони збережуться локально і синхронізуються, коли зʼєднання повернеться.",
      };
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
        // Тон іде за станом: попередження, поки мережі немає, і спокійний
        // «готово», щойно вона повернулась.
        variant={online ? "success" : "warning"}
        eyebrow={copy.eyebrow}
        illustration={<OfflineIllustration size={200} />}
        title={copy.title}
        description={copy.description}
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
            {online ? "Спробувати ще" : "Очікування мережі…"}
          </Button>
        }
        hint="Модулі Фінік, Фізрук, Рутина та Їжа зберігають дані офлайн, вони доступні навіть без мережі."
      />
    </main>
  );
}
