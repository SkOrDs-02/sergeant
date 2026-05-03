import { usePushNotifications } from "@shared/hooks/usePushNotifications";
import { cn } from "@shared/lib/ui/cn";

interface PushNotificationToggleProps {
  className?: string;
}

export function PushNotificationToggle({
  className,
}: PushNotificationToggleProps) {
  const { supported, permission, subscribed, loading, subscribe, unsubscribe } =
    usePushNotifications();

  if (!supported) return null;

  const blocked = permission === "denied";

  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="min-w-0">
        <div className="text-style-label text-text">Push-сповіщення</div>
        <div className="text-xs text-subtle mt-0.5">
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
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
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
