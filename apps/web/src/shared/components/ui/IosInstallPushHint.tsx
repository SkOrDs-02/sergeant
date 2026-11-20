import { useEffect } from "react";
import { messages } from "../../i18n/uk";
import { markIosInstallHintInlineShown } from "../../lib/platform/iosInstallHintVisit";
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
  // О-1 (а): рядок у дзвонику хаба не показує ту саму підказку вдруге за
  // візит (`core/app/useIosInstallHint.ts`).
  useEffect(() => {
    markIosInstallHintInlineShown();
  }, []);
  return (
    <div
      role="status"
      className={cn(
        "rounded-panel border border-info/30 bg-info-soft px-3 py-2.5 text-info-soft-fg",
        className,
      )}
    >
      <p className="text-style-label">{copy.title}</p>
      {/* AI-NOTE: caption навмисно — це опис під назвою, як опис рядка-тумблера
          в «Сповіщеннях» (`ToggleRow`: label + caption). Два короткі речення
          під заголовком, а не абзац, який читають окремо; body робив тіло
          більшим за заголовок і блок удвічі вищим за мокап. */}
      <p className="text-style-caption mt-0.5 leading-relaxed">{copy.body}</p>
    </div>
  );
}
