import { usePushNotifications } from "@shared/hooks/usePushNotifications";
import { Switch } from "@shared/components/ui/Switch";
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
            : "Цей браузер не підтримує push-сповіщення. Спробуй Chrome, Edge або Firefox. Нагадування всередині застосунку працюють і без них."}
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
              ? "Увімкнено: звички, тренування, бюджет"
              : "Вимкнено"}
        </div>
      </div>
      {/* Shared `Switch` (C4 web-audit) — the bespoke `bg-primary` track
          flipped to near-white in dark mode with a `bg-white` knob that
          vanished at that same position; `Switch`'s `-strong`/dark
          companion pair already solves that contrast. */}
      <Switch
        checked={subscribed}
        onChange={(next) => (next ? subscribe() : unsubscribe())}
        disabled={loading || blocked}
        aria-label={
          subscribed ? "Вимкнути push-сповіщення" : "Увімкнути push-сповіщення"
        }
      />
    </div>
  );
}
