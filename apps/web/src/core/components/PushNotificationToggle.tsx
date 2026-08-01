import { usePushNotifications } from "@shared/hooks/usePushNotifications";
import { cn } from "@shared/lib/ui/cn";

interface PushNotificationToggleProps {
  className?: string;
}

/**
 * iPadOS 13+ рапортує UA як десктопний Mac, тому окремо перевіряємо
 * дотиковий Mac. Точність тут не критична — від неї залежить лише текст
 * підказки, а не поведінка.
 */
function isIosLike(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

export function PushNotificationToggle({
  className,
}: PushNotificationToggleProps) {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } =
    usePushNotifications();

  // Мовчазне зникнення тоглу читається як «фічі не існує». На iOS
  // Web Push живе ЛИШЕ у PWA з початкового екрана (16.4+) — у вкладці
  // Safari `PushManager` відсутній, тож саме тут користувачу треба
  // сказати, що робити, а не ховати рядок.
  if (!supported) {
    return (
      <div className={cn("min-w-0", className)}>
        <div className="text-style-label text-text">Push-сповіщення</div>
        <p className="text-style-caption text-subtle mt-0.5">
          {isIosLike()
            ? "На iPhone та iPad сповіщення працюють лише у застосунку з початкового екрана: «Поділитися» → «На початковий екран», потім відкрий Sergeant звідти."
            : "Цей браузер не підтримує push-сповіщення. Спробуй Chrome, Edge або Firefox — нагадування всередині застосунку працюють і без них."}
        </p>
      </div>
    );
  }

  const blocked = permission === "denied";

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="text-style-label text-text">Push-сповіщення</div>
        <div className="text-style-caption text-subtle mt-0.5">
          {blocked
            ? "Заблоковано в налаштуваннях браузера"
            : subscribed
              ? "Увімкнено — звички, тренування, бюджет"
              : "Вимкнено"}
        </div>
      </div>
      <button
        type="button"
        disabled={loading || blocked}
        onClick={subscribed ? unsubscribe : subscribe}
        // `data-compact` opts the 24px track out of the global ≥44px
        // touch-target safety-net (which would otherwise stretch this
        // `rounded-full` switch into a 44px-tall capsule). The WCAG tap
        // target is restored via the centered `before:` pseudo below, which
        // extends the hit area to 44×44 without changing the visual size.
        data-compact
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          "before:content-[''] before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2",
          subscribed ? "bg-primary" : "bg-line",
          (loading || blocked) && "opacity-50 cursor-not-allowed",
        )}
        aria-label={
          subscribed ? "Вимкнути push-сповіщення" : "Увімкнути push-сповіщення"
        }
        aria-pressed={subscribed}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
            subscribed && "translate-x-5",
          )}
        />
      </button>
    </div>
  );
}
