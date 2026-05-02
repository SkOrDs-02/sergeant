import { useToast, type ToastType } from "@shared/hooks/useToast";
import { cn } from "@shared/lib/cn";
import { Icon, type IconName } from "./Icon";

const VARIANT: Record<ToastType, string> = {
  success: "bg-brand-700 text-white",
  error: "bg-danger-strong text-white",
  warning: "bg-warning-strong text-white",
  info: "bg-primary text-bg",
};

const ICON_WRAP: Record<ToastType, string> = {
  success: "motion-safe:animate-check-pop",
  error: "",
  warning: "",
  info: "",
};

const ICON_NAME: Record<ToastType, IconName> = {
  success: "check",
  error: "x-circle",
  warning: "alert-triangle",
  info: "alert-circle",
};

export function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[max(1.25rem,env(safe-area-inset-top,0px)+0.75rem)] left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none w-[min(92vw,24rem)]"
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto w-full px-4 py-3 rounded-2xl text-sm font-semibold shadow-float flex items-center gap-2.5",
            t.leaving
              ? "motion-safe:animate-toast-exit"
              : "motion-safe:animate-toast-enter",
            VARIANT[t.type] || VARIANT.info,
          )}
          role="alert"
        >
          <span
            className={cn(
              "shrink-0 inline-flex items-center justify-center",
              ICON_WRAP[t.type],
            )}
          >
            <Icon
              name={ICON_NAME[t.type]}
              size={16}
              strokeWidth={2.5}
              aria-hidden
            />
          </span>
          <span className="min-w-0 flex-1 leading-snug">{t.msg}</span>
          {t.action?.onClick && (
            <button
              type="button"
              onClick={() => {
                try {
                  t.action?.onClick();
                } finally {
                  dismiss(t.id);
                }
              }}
              className="shrink-0 px-2.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 transition-colors"
            >
              {t.action.label || "Дія"}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            className="shrink-0 opacity-70 hover:opacity-100 transition-opacity"
            aria-label="Закрити"
          >
            <Icon name="close" size={14} strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
