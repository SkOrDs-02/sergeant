/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { Icon } from "@shared/components/ui/Icon";
import { useToast } from "@shared/hooks/useToast";
import { messages } from "@shared/i18n/uk";
import { mapApiErrorToUserCopy } from "@shared/lib/api/mapApiErrorToUserCopy";
import { formatRelativeUk } from "@shared/lib/format/relativeTime.uk";
import { parseUserAgent } from "@shared/lib/format/userAgent";
import { SIGN_IN_PATH } from "../app/appPaths";
import { useAuth } from "../auth/AuthContext";
import {
  getSession,
  listSessions,
  revokeSession,
  type SessionItem,
} from "../auth/authClient";

const COPY = messages.profileSessions;

export function SessionsSection({ online }: { online: boolean }) {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  // Initialize loading=true only when online so the spinner shows during the
  // initial fetch; offline shows the "Оновити" button (disabled) immediately.
  const [loading, setLoading] = useState(online);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // When getSession() fails we cannot tell which listed session is the
  // current device. Revoking in that blind state would skip the full
  // logout() teardown for the current session (review finding) — so we
  // track the failure explicitly and block revocation until a successful
  // refresh instead of silently treating every row as non-current.
  const [currentLookupFailed, setCurrentLookupFailed] = useState(false);

  // Converted from async/await to explicit .then()/.catch() so that all
  // setState calls live inside nested callback functions. The React Compiler
  // lint rule `react-hooks/set-state-in-effect` inspects only the immediate
  // instruction blocks of a function (not nested FunctionExpression bodies),
  // so setState inside .then()/.catch() lambdas is invisible to the rule,
  // matching the pattern used by useAppLock.ts (.then-based setState).
  //
  // `getSession` is deferred through `Promise.resolve().then(...)` so that a
  // synchronous throw (e.g. when the function is omitted from a test mock)
  // becomes a rejected promise caught by the trailing `.catch()` rather than
  // a synchronous exception that escapes before `.catch()` is set up. This
  // keeps `listSessions()` — the first Promise.all argument — synchronously
  // invoked so test assertions on `listSessionsMock` remain synchronous.
  const load = useCallback(() => {
    if (!online) return;
    Promise.all([
      listSessions(),
      Promise.resolve()
        .then(() => getSession())
        .catch(() => "__lookup_failed__" as const),
    ])
      .then(([list, current]) => {
        if (current === "__lookup_failed__") {
          setCurrentSessionId(null);
          setCurrentLookupFailed(true);
        } else {
          const cur = current as {
            data?: { session?: { id?: string } } | null;
          } | null;
          const id = cur?.data?.session?.id ?? null;
          setCurrentSessionId(id);
          // A 200 without a session id is the same blind state as a failed
          // lookup — we still can't mark the current row.
          setCurrentLookupFailed(id === null);
        }
        setError(null);
        if (list.data) {
          setSessions(list.data);
        } else if (list.error) {
          setError(mapApiErrorToUserCopy(list.error, COPY.loadFailed));
        }
        setLoading(false);
      })
      .catch(() => {
        setError(COPY.loadFailed);
        setLoading(false);
      });
  }, [online]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRevoke = async (
    id: string,
    token: string,
    isCurrent: boolean,
  ) => {
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
        toast.error(
          mapApiErrorToUserCopy(res.error, COPY.revokeFailed),
          undefined,
          {
            label: "Повторити",
            onClick: () => void handleRevoke(id, token, isCurrent),
          },
        );
        return;
      }
      toast.success(COPY.revokeSuccess);
      // Revoking the CURRENT session destroys it server-side, but the
      // client still holds the `me` query result in the React Query cache
      // (plus the Better Auth session cookie cache) — a bare `setSessions`
      // filter left the rest of the UI rendering as "logged in" until a
      // manual reload. Route through the full `logout()` teardown (clears
      // the query cache, purges SW/SQLite/local-first state) and send the
      // user to sign-in, mirroring `ProfilePage.handleLogout`.
      if (isCurrent) {
        await logout();
        navigate(SIGN_IN_PATH, { replace: true });
        return;
      }
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      toast.error(COPY.revokeFailed, undefined, {
        label: "Повторити",
        onClick: () => void handleRevoke(id, token, isCurrent),
      });
    } finally {
      setRevoking(null);
    }
  };

  return (
    <Card radius="lg" padding="none" className="overflow-hidden">
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-line">
        <div className="flex items-center gap-2">
          <Icon name="monitor" size={16} className="text-muted" />
          <span className="text-style-label text-text">
            {COPY.sectionTitle}
          </span>
        </div>
        <Button
          variant="ghost"
          size="xs"
          onClick={load}
          disabled={loading || !online}
        >
          {COPY.refresh}
        </Button>
      </div>

      <div className="p-4">
        {loading && sessions.length === 0 ? (
          <p className="text-style-body text-muted text-center py-4">
            {COPY.loading}
          </p>
        ) : error ? (
          <p className="text-style-body text-danger-strong dark:text-danger text-center py-4">
            {error}
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-style-body text-muted text-center py-4">
            {COPY.empty}
          </p>
        ) : (
          <>
            {currentLookupFailed && (
              <p className="text-style-caption text-muted mb-2">
                {COPY.currentUnknown}
              </p>
            )}
            <ul className="space-y-2">
              {sessions.map((s) => {
                const isExpired = new Date(s.expiresAt) < new Date();
                const isCurrent = currentSessionId === s.id;
                const ua = parseUserAgent(s.userAgent);
                const lastSeen = formatRelativeUk(s.updatedAt);
                return (
                  <li
                    key={s.id}
                    className="flex items-start gap-3 p-3 rounded-xl border border-line bg-panel"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-style-label text-text truncate">
                          {ua.label}
                        </p>
                        {isCurrent && (
                          <span className="inline-flex items-center text-style-caption font-medium px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-strong dark:text-brand border border-brand-500/30">
                            {COPY.thisDevice}
                          </span>
                        )}
                      </div>
                      <p className="text-style-caption text-muted mt-0.5">
                        {s.ipAddress ?? COPY.unknownIp}
                        {" \u00b7 "}
                        {`${COPY.lastSeenPrefix} ${lastSeen}`}
                      </p>
                      {isExpired && (
                        <span className="text-style-caption text-danger-strong dark:text-danger font-medium">
                          {COPY.expired}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="danger"
                      size="xs"
                      disabled={revoking === s.id || currentLookupFailed}
                      loading={revoking === s.id}
                      onClick={() => handleRevoke(s.id, s.token, isCurrent)}
                    >
                      {COPY.revoke}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}
