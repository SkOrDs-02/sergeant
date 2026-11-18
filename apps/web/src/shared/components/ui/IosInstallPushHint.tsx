import { messages } from "../../i18n/uk";
import { cn } from "../../lib/ui/cn";

const copy = messages.iosInstallHint;

/**
 * Підказка «встанови застосунок, щоб отримувати нагадування» для iPhone/iPad
 * у вкладці Safari, де push неможливий (`Notification` і `PushManager` є лише
 * у PWA з початкового екрана). Показується замість хибного тосту «дозволь у
 * налаштуваннях браузера» — такого пункту на iOS немає.
 *
 * `role="status"` (polite) — екранна читалка озвучує зʼявлення, а сам блок
 * лишається в потоці: жодного таймера автозакриття, зникає лише коли
 * людина піде з екрана.
 */
export function IosInstallPushHint({ className }: { className?: string }) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-panel border border-info/30 bg-info-soft px-3 py-2.5 text-info-soft-fg",
        className,
      )}
    >
      <p className="text-style-label font-semibold">{copy.title}</p>
      <p className="text-style-body mt-0.5">{copy.body}</p>
    </div>
  );
}
