import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiQueryKeys } from "@sergeant/api-client/react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { formatDateFull } from "@shared/lib/time/formatDate";
import { messages } from "@shared/i18n/uk";
import { meApi } from "@shared/api";

const m = messages.accountDeletion;

interface PendingDeletionScreenProps {
  /** ISO-дата, після якої акаунт зникне. */
  scheduledPurgeAt: string;
  /** Вихід із акаунта: та сама пара `signOut` + teardown, що в профілі. */
  onLogout: () => Promise<void>;
}

/**
 * Екран-блокер для акаунта у вікні на скасування видалення.
 *
 * ЧОМУ блокер, а не банер поверх застосунку (рішення 3 спеки
 * docs/work/specs/user-deletion-grace-window.md): інакше людина місяць
 * вносила б дані в акаунт, приречений на видалення, а sync возив би їх на
 * сервер. Сервер тримає ту саму межу гейтом у `requireSession`, тож
 * застосунок за цим екраном однаково відповідав би 403.
 *
 * Вхід НЕ скасовує видалення сам собою: інакше його скасував би будь-хто
 * зі старою сесією на іншому пристрої, без наміру. Скасування це окреме
 * свідоме натискання тут.
 *
 * Завантажується ліниво (`RootLayout`): стан рідкісний, а оболонка сидить
 * на критичному шляху, стеля якого гейтиться окремо.
 */
export function PendingDeletionScreen({
  scheduledPurgeAt,
  onLogout,
}: PendingDeletionScreenProps) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [restoring, setRestoring] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const purgeDate = formatDateFull(new Date(scheduledPurgeAt));

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await meApi.restoreAccount();
      // Інвалідація, а не локальний стан: після скасування застосунок має
      // перемалюватись із сервера, і ключ вікна мусить перепитатись.
      await queryClient.invalidateQueries({
        queryKey: apiQueryKeys.me.deletionStatus(),
      });
      toast.success(m.restored);
    } catch {
      toast.error(m.restoreFailed, undefined, {
        label: m.retry,
        onClick: () => void handleRestore(),
      });
    } finally {
      setRestoring(false);
    }
  };

  const handleLogout = async () => {
    setLeaving(true);
    try {
      await onLogout();
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pending-deletion-title"
      className="fixed inset-0 z-modal flex items-center justify-center p-6 bg-bg/95 backdrop-blur-md"
    >
      <div className="w-full max-w-sm text-center">
        <div className="flex justify-center mb-4" aria-hidden>
          <Icon name="trash-2" className="w-10 h-10 text-danger-strong" />
        </div>

        <h1
          id="pending-deletion-title"
          className="text-style-title text-text mb-3"
        >
          {m.blockerTitle}
        </h1>

        <p className="text-style-body text-muted mb-2">
          {`${m.blockerBodyPrefix} ${purgeDate}. ${m.blockerBodyTail}`}
        </p>
        <p className="text-style-caption text-subtle mb-6">
          {m.blockerSubscription}
        </p>

        <div className="flex flex-col gap-3">
          <Button
            variant="primary"
            size="lg"
            onClick={() => void handleRestore()}
            loading={restoring}
            disabled={leaving}
          >
            {m.restore}
          </Button>
          <Button
            variant="ghost"
            size="lg"
            onClick={() => void handleLogout()}
            loading={leaving}
            disabled={restoring}
          >
            {m.leave}
          </Button>
        </div>
      </div>
    </div>
  );
}
