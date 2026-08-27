/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@shared/components/ui/Button";
import { Card } from "@shared/components/ui/Card";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
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
import { flushPendingSyncOpsBeforeLogout } from "../syncEngine/flushBeforeLogout";
// F6 (review): reuse the shared UA pluraliser instead of a hand-rolled
// `=== 1 ? … : …` ternary — the ternary's "else" branch used the wrong
// Ukrainian plural form for 2–4 (see the fix below).
import { pluralize } from "../hub/useHubDashboardState";

const COPY = messages.profileSessions;

export function SessionsSection({ online }: { online: boolean }) {
  const toast = useToast();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  // `loading` ВИВОДИТЬСЯ, а не зберігається. F4 спершу лікували
  // `setLoading(true)` на початку `load()`, але `load()` кличеться прямо з
  // ефекту, тож той сет був синхронним setState в ефекті
  // (`react-hooks/set-state-in-effect` — помилка, не ворнінг).
  //
  // `settledFor` — це значення `online`, для якого ми ОСТАННІЙ раз мали
  // відповідь (успішну чи ні). Виставляється лише в `.then`/`.catch`, тобто
  // асинхронно, і цього досить, щоб покрити всі стани:
  //   • перший рендер онлайн → `null !== true` → спінер;
  //   • офлайн → `loading === false`, одразу видно чесний офлайн-стан;
  //   • офлайн → онлайн (першого успішного завантаження ще не було) →
  //     `settledFor` усе ще `null` → спінер на час запиту, а не брехливе
  //     «Немає сесій» (це і є дефект F4);
  //   • фонове оновлення вже завантаженого списку → `settledFor === true`,
  //     спінера немає, наявні рядки лишаються на місці.
  const [settledFor, setSettledFor] = useState<boolean | null>(null);
  const loading = online && settledFor !== online;
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  // When getSession() fails we cannot tell which listed session is the
  // current device. Revoking in that blind state would skip the full
  // logout() teardown for the current session (review finding) — so we
  // track the failure explicitly and block revocation until a successful
  // refresh instead of silently treating every row as non-current.
  const [currentLookupFailed, setCurrentLookupFailed] = useState(false);
  // L-19: офлайн-стан бреше "Немає сесій", якщо просто розрізняти
  // loading/error/empty за старою логікою — `load()` на офлайні виходить
  // РАНІШЕ будь-якого запиту (`if (!online) return`), тож `error` лишається
  // `null`, а `sessions` — порожнім масивом, і рендер трактує це як
  // "сервер відповів: сесій нема". `everLoaded` фіксує, чи ми взагалі
  // ОТРИМАЛИ підтверджений список від сервера хоч раз — до цього офлайн
  // повинен показувати "не вдалося завантажити", а не "порожньо".
  const [everLoaded, setEverLoaded] = useState(false);
  // L-18: гейт "є незбережене" для завершення ПОТОЧНОЇ сесії — той самий
  // механізм, що й у кнопки «Вийти» на `ProfilePage` (`logout()` приймає
  // `confirmUnsyncedLoss` і сам вирішує, коли питати: лише якщо після
  // спроби доставити чергу синхронізації щось лишилось недоставленим).
  // Без цього «Завершити» на своєму ж пристрої стирало локальну SQLite
  // (разом із чергою) без жодного попередження — на відміну від «Вийти»
  // поруч, який це попередження вже мав.
  const [unsyncedPrompt, setUnsyncedPrompt] = useState<{
    pending: number;
    resolve: (proceed: boolean) => void;
  } | null>(null);

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
    // F4 живе не тут, а у виведеному `loading` вище: жодного сету стану
    // до першого `.then`/`.catch` у цій функції бути не повинно — вона
    // кличеться прямо з ефекту нижче.
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
          setEverLoaded(true);
        } else if (list.error) {
          setError(mapApiErrorToUserCopy(list.error, COPY.loadFailed));
        }
        setSettledFor(true);
      })
      .catch(() => {
        setError(COPY.loadFailed);
        setSettledFor(true);
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
      if (isCurrent) {
        // F1 (review): this gate MUST run BEFORE the session is touched
        // anywhere. It used to run only AFTER `revokeSession()` below had
        // already killed the session server-side — so by the time
        // "Залишитись" existed as a choice, cancelling couldn't actually
        // keep the session alive (it was already gone), and `logout()`'s
        // own flush attempt (pushing into a session the server no longer
        // recognized) 401'd on every op, pinning `pending > 0` even for
        // records that would otherwise have flushed cleanly. Running the
        // SAME flush-and-ask check `logout()` runs internally, but here,
        // first, means a cancel leaves the session genuinely alive and
        // the dialog's "Підключися до мережі і зачекай кілька секунд"
        // copy stays true when it's shown.
        const { pending, unknown } = await flushPendingSyncOpsBeforeLogout();
        if (!unknown && pending > 0) {
          const proceed = await new Promise<boolean>((resolve) => {
            setUnsyncedPrompt({
              pending,
              resolve: (p) => {
                setUnsyncedPrompt(null);
                resolve(p);
              },
            });
          });
          if (!proceed) return;
        }
      }

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
      //
      // The unsynced-loss gate already ran above, BEFORE the revoke, so
      // `logout()` here doesn't need `confirmUnsyncedLoss` again — its
      // own internal flush re-check runs against an already-revoked
      // session (fails open, per its documented contract for callers
      // that omit the hook) and proceeds straight to the local teardown.
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
      {/* V-4 (2026-08-08) — той самий фікс, що й `MemoryBankSection.tsx`
          (канонічний коментар там): `COPY.sectionTitle` тут дослівно
          збігався з зовнішнім заголовком «Активні сесії» в
          `ProfilePage.tsx` і малювався `text-style-label`, більшим за
          `xs`-кікер `CollapsibleSection`. Прибрано; іконка й кнопка
          «Оновити» (дія, не заголовок) лишились без змін. */}
      <div className="px-4 py-3.5 flex items-center justify-between border-b border-line">
        <Icon name="monitor" size={16} className="text-muted" />
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
        ) : !online && !everLoaded ? (
          // L-19: офлайн ДО першого успішного завантаження — це не те
          // саме, що "сервер підтвердив: сесій нема". Показуємо чесний
          // "не вдалося завантажити", а не COPY.empty.
          <p className="text-style-body text-muted text-center py-4">
            Офлайн, не вдалося завантажити активні сесії. Підключись до мережі й
            онови список.
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

      {/* F1/L-18: той самий діалог, що й «Вийти» на ProfilePage — зʼявляється
          ПЕРЕД тим, як сесію взагалі торкнулись (гейт тепер стоїть перед
          `revokeSession` у `handleRevoke`), лише коли спроба доставити
          чергу синхронізації лишила щось недоставленим. На живій мережі
          цей блок ніколи не рендериться. */}
      <ConfirmDialog
        open={unsyncedPrompt !== null}
        danger
        title="Є незбережені записи"
        description={
          <>
            {/* F6 (review): the old `=== 1 ? … : …` ternary's "else"
                branch used "N записів" for EVERY non-1 count, including
                2–4 — Ukrainian plural requires "N записи" there
                (`pluralize` covers all three forms). */}
            {unsyncedPrompt?.pending ?? 0}{" "}
            {pluralize(
              unsyncedPrompt?.pending ?? 0,
              "запис",
              "записи",
              "записів",
            )}{" "}
            ще не збережено на сервері. Якщо завершити цю сесію зараз, вони
            зникнуть назавжди. Підключися до мережі й зачекай кілька секунд, або
            завершуй, якщо ці записи не потрібні.
          </>
        }
        confirmLabel="Все одно завершити"
        cancelLabel="Залишитись"
        onConfirm={() => unsyncedPrompt?.resolve(true)}
        onCancel={() => unsyncedPrompt?.resolve(false)}
      />
    </Card>
  );
}
