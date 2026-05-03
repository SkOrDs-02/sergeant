import { useCallback, useEffect, useState } from "react";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import {
  listSessions,
  revokeSession,
  type SessionItem,
} from "../auth/authClient";
import { formatDate, parseUA } from "./sessions";

export function SessionsSection({ online }: { online: boolean }) {
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!online) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listSessions();
      if (res.data) {
        setSessions(res.data);
      } else if (res.error) {
        setError(res.error.message ?? "Не вдалося завантажити сесії");
      }
    } catch {
      setError("Не вдалося завантажити сесії");
    } finally {
      setLoading(false);
    }
  }, [online]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevoke = async (id: string, token: string) => {
    setRevoking(id);
    try {
      // Better Auth's `/revoke-session` endpoint validates the body with
      // `z.object({ token: z.string() })` (see
      // `node_modules/better-auth/dist/api/routes/session.mjs`). Passing
      // `{ id }` lands as `body.token === undefined` and surfaces as a
      // user-visible toast: `[body.token] Invalid input: expected
      // string, received undefined`. We use the session's `token`
      // (already returned by `listSessions`) as the identifier.
      const res = await revokeSession({ token });
      if (res.error) {
        toast.error(res.error.message ?? "Не вдалося завершити сесію");
        return;
      }
      toast.success("Сесію завершено");
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error("Не вдалося завершити сесію");
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <Icon name="monitor" size={16} className="text-muted" />
          <span className="text-style-label text-text">Активні сесії</span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={load}
          disabled={loading || !online}
        >
          Оновити
        </Button>
      </div>

      <div className="p-4">
        {loading && sessions.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Завантаження…</p>
        ) : error ? (
          <p className="text-sm text-danger text-center py-4">{error}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Немає сесій</p>
        ) : (
          <ul className="space-y-2">
            {sessions.map((s) => {
              const isExpired = new Date(s.expiresAt) < new Date();
              return (
                <li
                  key={s.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-line bg-panel"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text truncate">
                      {parseUA(s.userAgent)}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {s.ipAddress ?? "IP невідомий"}
                      {" \u00b7 "}
                      {formatDate(s.createdAt)}
                    </p>
                    {isExpired && (
                      <span className="text-2xs text-danger font-medium">
                        Закінчилась
                      </span>
                    )}
                  </div>
                  <Button
                    variant="danger"
                    size="xs"
                    disabled={revoking === s.id}
                    loading={revoking === s.id}
                    onClick={() => handleRevoke(s.id, s.token)}
                  >
                    Завершити
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
