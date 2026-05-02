import { useCallback, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/cn";
import { trackEvent, ANALYTICS_EVENTS } from "../observability/analytics";

/**
 * PermissionsPrompt — фінальний інтерстиціал онбордингу. Пояснює, які
 * дозволи браузера буде використовувати Sergeant і коли. Запит дозволу
 * робиться інлайново (Notification.requestPermission, getUserMedia
 * audio/video) — кожен браузерний модальник з\'являється лише після
 * явного "Дозволити", щоб не був заблокований heuristic-ами Chrome
 * проти запитів одразу при завантаженні сторінки.
 *
 * Контракт із гайдлайнами:
 * - Skip-кнопка завжди доступна; PR не блокує користувача.
 * - Запит фактично робиться через рідні Web API (browser drives the
 *   prompt UI). Ми лише трекаємо PERMISSION_REQUESTED / GRANTED / DENIED.
 * - У capacitor-білді (`VITE_TARGET === "capacitor"`) Web API недоступні
 *   або поводяться інакше, тож кнопки рендеряться, але повертають
 *   "denied"-fallback без помилки. Native push має інший шлях
 *   (registerPush у mobile-shell), яким керує `usePushNotifications`.
 */

type PermissionId = "push" | "microphone" | "camera";
type PermissionUiState =
  | "idle"
  | "asking"
  | "granted"
  | "denied"
  | "unsupported";

interface PermissionRowMeta {
  id: PermissionId;
  title: string;
  reason: string;
  icon: React.ReactNode;
}

const ROWS: readonly PermissionRowMeta[] = [
  {
    id: "push",
    title: "Сповіщення",
    reason:
      "Нагадування про звички, тренування та щотижневий дайджест. Без цього нагадування не приходитимуть.",
    icon: <Icon name="bell" size={22} aria-hidden />,
  },
  {
    id: "microphone",
    title: "Мікрофон",
    reason:
      "Голосове введення в чаті і швидке додавання витрат / їжі без клавіатури.",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="8" y1="22" x2="16" y2="22" />
      </svg>
    ),
  },
  {
    id: "camera",
    title: "Камера",
    reason: "Сканер штрихкодів продуктів і фото страв для AI-аналізу калорій.",
    icon: (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
];

async function requestPushPermission(): Promise<PermissionUiState> {
  if (typeof Notification === "undefined") return "unsupported";
  try {
    const r = await Notification.requestPermission();
    if (r === "granted") return "granted";
    return "denied";
  } catch {
    return "denied";
  }
}

async function requestMediaPermission(
  kind: "audio" | "video",
): Promise<PermissionUiState> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    return "unsupported";
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === "audio" ? { audio: true } : { video: true },
    );
    // Release immediately — onboarding не записує, лише питає дозвіл.
    stream.getTracks().forEach((t) => t.stop());
    return "granted";
  } catch {
    return "denied";
  }
}

async function requestPermission(id: PermissionId): Promise<PermissionUiState> {
  switch (id) {
    case "push":
      return requestPushPermission();
    case "microphone":
      return requestMediaPermission("audio");
    case "camera":
      return requestMediaPermission("video");
  }
}

export function PermissionsPrompt({
  onComplete,
  onBack,
}: {
  onComplete: (granted: PermissionId[]) => void;
  onBack: () => void;
}) {
  const [states, setStates] = useState<Record<PermissionId, PermissionUiState>>(
    {
      push: "idle",
      microphone: "idle",
      camera: "idle",
    },
  );

  const handleAllow = useCallback(async (id: PermissionId) => {
    setStates((s) => ({ ...s, [id]: "asking" }));
    trackEvent(ANALYTICS_EVENTS.PERMISSION_REQUESTED, { permission: id });
    const next = await requestPermission(id);
    setStates((s) => ({ ...s, [id]: next }));
    if (next === "granted") {
      trackEvent(ANALYTICS_EVENTS.PERMISSION_GRANTED, { permission: id });
    } else if (next === "denied") {
      trackEvent(ANALYTICS_EVENTS.PERMISSION_DENIED, { permission: id });
    }
  }, []);

  const handleContinue = useCallback(() => {
    const granted = (Object.keys(states) as PermissionId[]).filter(
      (id) => states[id] === "granted",
    );
    onComplete(granted);
  }, [states, onComplete]);

  return (
    <div className="flex flex-col items-center text-center space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-text">Дозволи</h2>
        <p className="text-xs text-muted leading-relaxed max-w-xs mx-auto">
          Щоб усе працювало, Sergeant може попросити кілька дозволів браузера.
          Можна пропустити — увімкнеш у налаштуваннях, коли знадобиться.
        </p>
      </div>

      <ul className="w-full space-y-2 text-left">
        {ROWS.map((row) => {
          const state = states[row.id];
          return (
            <li
              key={row.id}
              className="flex items-start gap-3 p-3 rounded-2xl border border-line bg-panelHi"
            >
              <div className="w-10 h-10 shrink-0 rounded-xl bg-brand-500/10 text-brand-strong dark:text-brand flex items-center justify-center">
                {row.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-text">
                  {row.title}
                </div>
                <div className="text-xs text-muted mt-0.5 leading-snug">
                  {row.reason}
                </div>
              </div>
              <div className="shrink-0 self-center">
                {state === "granted" ? (
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold text-success-strong"
                    aria-live="polite"
                  >
                    <Icon name="check" size={14} aria-hidden />
                    Готово
                  </span>
                ) : state === "denied" ? (
                  <span
                    className="text-xs font-semibold text-muted"
                    aria-live="polite"
                  >
                    Заблоковано
                  </span>
                ) : state === "unsupported" ? (
                  <span className="text-xs text-subtle">—</span>
                ) : (
                  <Button
                    type="button"
                    onClick={() => handleAllow(row.id)}
                    variant="primary"
                    size="sm"
                    disabled={state === "asking"}
                    className={cn(state === "asking" && "opacity-60")}
                    aria-label={`Дозволити ${row.title.toLowerCase()}`}
                  >
                    {state === "asking" ? "…" : "Дозволити"}
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="w-full flex gap-2">
        <Button
          type="button"
          onClick={onBack}
          variant="ghost"
          size="lg"
          className="w-auto px-4"
          aria-label="Назад"
        >
          <Icon name="chevron-left" size={16} />
        </Button>
        <Button
          type="button"
          onClick={handleContinue}
          variant="primary"
          size="lg"
          className="flex-1"
        >
          Продовжити
          <Icon name="chevron-right" size={16} />
        </Button>
      </div>
      <button
        type="button"
        onClick={handleContinue}
        className="w-full text-xs text-muted hover:text-text transition-colors py-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/45 rounded"
      >
        Пропустити
      </button>
    </div>
  );
}
