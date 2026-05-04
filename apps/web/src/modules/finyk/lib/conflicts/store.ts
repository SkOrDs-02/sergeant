/**
 * In-process typed store for sync-v2 conflicts on `finyk_manual_expenses`.
 *
 * Stage 5 PR #044 (`docs/planning/storage-roadmap.md`). Provides the UI
 * surface that the eventual sync-v2 client will populate when the
 * server's per-row apply-fn rejects a push with `reason='lww_conflict'`
 * або `reason='tombstoned'` для table=`finyk_manual_expenses`. The
 * scope is intentionally narrow — we surface only this one table because
 * it is the highest-touch finyk entity (manually-entered expenses are
 * the path users notice first when two devices race), and the
 * server-side LWW path on `applyFinykPerRowBlob` already gives us a
 * deterministic loser to show. Інші finyk-таблиці (`finyk_budgets`,
 * `finyk_subscriptions`, …) розділяють той же per-row blob apply-шлях,
 * але мають значно меншу частоту правок із двох пристроїв одночасно;
 * розширення скоупа — тривіальна композиція цього стора у наступних PR.
 *
 * Design choices:
 *
 * - **Module-level state, not React Context.** Conflicts can be
 *   recorded outside any React tree (e.g., from the sync-v2 push hook
 *   у фоні), and consumed from any component without prop-drilling.
 *   Pattern matches `apps/web/src/shared/lib/modules/hubBus.ts`.
 *
 * - **Dedup by `transaction_id`.** Server повертає одне рішення на
 *   рядок-конфлікт; повторний push того ж рядка просто оновлює запис
 *   (свіжіший `serverUpdatedAt`/`detectedAt`), не створює дубль у
 *   банері. Це навмисно: користувач має бачити «один конфлікт на одну
 *   транзакцію», незалежно від кількості невдалих push-у.
 *
 * - **Bounded queue.** Жорсткий cap у `MAX_CONFLICTS = 25`: malformed
 *   client / runaway push не може роздути LS / heap — старіші
 *   записи витискаються FIFO-чином. Banner-UI у PR #044 показує
 *   counter («N конфліктів»), а не повний список, тому FIFO-витискання
 *   не міняє UX.
 *
 * - **No persistence (yet).** Конфлікти живуть лише у пам'яті вкладки.
 *   Якщо юзер закриє таб до dismiss — конфлікт зникне, наступний push
 *   або pull (PR #044+) їх відновить. Persistence у `localStorage`
 *   додамо коли підключимо реальний sync-v2 client (поза скоупом #044).
 */

const MAX_CONFLICTS = 25;

export type FinykManualExpenseConflictReason = "lww_conflict" | "tombstoned";

export interface FinykManualExpenseConflict {
  /** PK of the conflicting row у `finyk_manual_expenses` (UUID v4). */
  readonly transactionId: string;
  /**
   * Server-reported rejection reason. `lww_conflict` означає, що
   * локальний `clientTs` старіший за серверний `updated_at` —
   * cloud має свіжішу версію. `tombstoned` означає, що рядок
   * soft-deleted на сервері, а ми спробували insert/update —
   * resurrection guard сработав.
   */
  readonly reason: FinykManualExpenseConflictReason;
  /**
   * Локальний snapshot `data_json` на момент push-у. Використовуємо
   * у UI для підказки «що ти намагався зберегти», коли користувач
   * вирішує — keep local чи accept server. Зберігаємо як string
   * (не parsed JSON), щоб дешево порівняти ідентичність по checksum
   * без re-stringify і не платити за allocation на кожному рендері.
   */
  readonly localDataJson: string;
  /**
   * `client_ts` push-у, який сервер відхилив (ISO-8601). Дозволяє UI
   * показати «спроба збереження о 12:34» — конкретніше за просто
   * `detectedAt`, який лише фіксує момент receipt-у відповіді.
   */
  readonly attemptedClientTs: string;
  /** Date.now() коли запис зайшов у store; рендер `≈ X хв тому`. */
  readonly detectedAt: number;
}

type Listener = () => void;

interface ConflictState {
  readonly conflicts: ReadonlyArray<FinykManualExpenseConflict>;
}

const EMPTY_STATE: ConflictState = { conflicts: [] };

let state: ConflictState = EMPTY_STATE;
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (err) {
      // Listener errors must NEVER prevent other listeners from firing,
      // and must NEVER break the publishing site. Re-throw async via
      // setTimeout(0) so the error still surfaces у Sentry without
      // blocking the store mutation.
      setTimeout(() => {
        throw err;
      }, 0);
    }
  });
}

/**
 * Record a new conflict, or replace the existing record for the same
 * `transactionId` (LWW on `detectedAt` — newest server response wins).
 *
 * Returns the new total conflict count after the operation; callers
 * (analytics, tests) typically don't care about the value but it
 * removes the need for an extra `getSnapshot().length` call.
 */
export function recordFinykManualExpenseConflict(
  conflict: FinykManualExpenseConflict,
): number {
  const filtered = state.conflicts.filter(
    (c) => c.transactionId !== conflict.transactionId,
  );
  // Push to tail; trim from head if cap exceeded. Tail-bias keeps the
  // most recent conflicts visible if banner UI ever shows a list.
  const next = [...filtered, conflict];
  const trimmed =
    next.length > MAX_CONFLICTS
      ? next.slice(next.length - MAX_CONFLICTS)
      : next;
  state = { conflicts: trimmed };
  notify();
  return trimmed.length;
}

/**
 * Drop a single conflict by `transactionId`. Used by the banner's
 * "keep local" / "accept server" actions — both paths terminate the
 * conflict for that row (the next push either writes through or no-ops).
 */
export function dismissFinykManualExpenseConflict(transactionId: string): void {
  const filtered = state.conflicts.filter(
    (c) => c.transactionId !== transactionId,
  );
  if (filtered.length === state.conflicts.length) return;
  state = { conflicts: filtered };
  notify();
}

/** Bulk-dismiss — used by "Закрити всі" button у банері. */
export function dismissAllFinykManualExpenseConflicts(): void {
  if (state.conflicts.length === 0) return;
  state = EMPTY_STATE;
  notify();
}

/**
 * Stable reference returned by `getSnapshot` — `useSyncExternalStore`
 * compares-by-identity and re-renders only when the reference changes.
 * Mutations always allocate a new state object, so this is safe.
 */
export function getFinykManualExpenseConflictsSnapshot(): ConflictState {
  return state;
}

/** Subscribe primitive — used directly by `useSyncExternalStore`. */
export function subscribeFinykManualExpenseConflicts(
  listener: Listener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Test-only escape hatch: clear store + drop subscribers. Production
 * code MUST NOT call this — it would silently desync any live banner.
 */
export function __resetFinykManualExpenseConflictsForTests(): void {
  state = EMPTY_STATE;
  listeners.clear();
}

export const FINYK_MANUAL_EXPENSE_CONFLICT_LIMIT = MAX_CONFLICTS;
