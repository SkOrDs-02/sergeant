import type { ReactNode } from "react";
import { cn } from "@shared/lib/ui/cn";
import { Button } from "./Button";
import { SkeletonCard } from "./SkeletonCard";
import { messages } from "@shared/i18n/uk";

/**
 * Sergeant Design System — DataState
 *
 * Single-spot wrapper for the four canonical states a React Query (or
 * any query-like) result can be in: **loading**, **empty**, **error**,
 * **stale** (fresh data is visible but a background refetch is in
 * flight). Use it to enforce a consistent skeleton/empty/error policy
 * across modules instead of each page re-implementing its own
 * `if (isLoading) ... if (error) ... if (!data?.length) ...` ladder.
 *
 * **Why a wrapper instead of one-off conditionals?**
 *
 * The diagnostic in `docs/audits/2026-05-03-web-deep-dive/01-frontend-ergonomics.md`
 * §3.2 calls out that we have neither a system-wide skeleton policy nor
 * a uniform empty/error contract. Each page owns its own loading text,
 * empty-state copy, and retry button — drift is constant and AI agents
 * keep re-inventing the same affordances slightly differently.
 *
 * `<DataState>` collapses the contract to:
 *
 *   <DataState
 *     query={txQuery}                         // any RQ-shaped result
 *     skeleton={<TransactionListSkeleton />}  // shape-aware loader
 *     empty={<EmptyTx onAdd={openCreate} />}
 *     error={(err, retry) => <ErrorTx error={err} onRetry={retry} />}
 *     stale={(_data, isStale) => isStale && <StaleBadge />}
 *   >
 *     {(data) => <TransactionList items={data} />}
 *   </DataState>
 *
 * The wrapper also accepts the lower-level shape (`isLoading` /
 * `isError` / `data` / `error` / `refetch`) for hooks that don't expose
 * a full RQ object — see `useMonoTransactions` for the canonical
 * re-shape.
 *
 * **What it does NOT do.** This is purely presentational: it does not
 * fetch, retry on its own, or talk to React Query directly. The host
 * still owns the hook + key. That keeps the wrapper trivially testable
 * and avoids a second `useQuery` call hiding behind the JSX.
 */

/**
 * Minimal contract every consumer must satisfy. We intentionally avoid
 * a hard `UseQueryResult<T, E>` import because some callers only have
 * `{ data, isLoading, error }` (e.g. `useMonoTransactions`) and would
 * otherwise have to fake the rest of the React Query shape.
 */
export interface DataStateQueryLike<TData, TError = unknown> {
  data: TData | undefined;
  isLoading?: boolean;
  isPending?: boolean;
  isFetching?: boolean;
  isError?: boolean;
  error?: TError | null;
  refetch?: () => unknown;
}

export interface DataStateProps<TData, TError = unknown> {
  /**
   * React Query-shaped result. `data` may be `undefined` while
   * loading; `error` is read only if `isError` is `true` OR if `error`
   * is non-null (callers from non-RQ hooks set `error` directly).
   */
  query: DataStateQueryLike<TData, TError>;

  /**
   * Loading slot. Default is a generic `<SkeletonCard />`. Pass a
   * shape-aware skeleton (e.g. `<SkeletonTransactionRow />` repeated)
   * so the transition skeleton → real content reflows minimally.
   */
  skeleton?: ReactNode;

  /**
   * Empty slot — rendered when the query succeeded but returned a
   * "nothing to show" payload. By default we treat `undefined`,
   * `null`, `[]`, and `''` as empty. Override via `isEmpty(data)` if
   * your domain has a different notion (e.g. a `{ items: [] }` envelope).
   */
  empty?: ReactNode;

  /**
   * Custom emptiness check. Receives the resolved `data` and returns
   * `true` if the empty slot should be shown.
   */
  isEmpty?: (data: TData) => boolean;

  /**
   * Error slot. Function form gets the error + a `retry` callback so
   * the same fallback can be reused across queries with different
   * `refetch` references.
   *
   * Note: when `query.refetch` is `undefined`, `retry` is a no-op so
   * the slot can render an unconditional "Спробувати ще" button.
   */
  error?: ReactNode | ((error: TError, retry: () => void) => ReactNode);

  /**
   * Stale slot — rendered alongside the children when fresh data is
   * already on screen but a background refetch is in flight. Useful
   * for unobtrusive "оновлюється…" badges that don't block content.
   */
  stale?: (data: TData, isStale: boolean) => ReactNode;

  /**
   * Body — receives the resolved `data` once the query is in the
   * success state and not empty.
   */
  children: (data: TData) => ReactNode;

  /** Outer wrapper class — applied around the rendered slot. */
  className?: string;
}

const DEFAULT_EMPTY: <T>(data: T) => boolean = (data) => {
  if (data === undefined || data === null) return true;
  if (Array.isArray(data)) return data.length === 0;
  if (typeof data === "string") return data.length === 0;
  return false;
};

/**
 * Default error fallback — kept intentionally minimal. Pages that
 * want module-tinted or shape-aware errors should pass a custom
 * `error={(err, retry) => ...}` slot.
 */
function DefaultErrorFallback<TError>({
  error,
  onRetry,
}: {
  error: TError;
  onRetry: () => void;
}) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Не вдалося завантажити дані.";
  return (
    <div
      role="alert"
      className="rounded-2xl border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger-strong dark:text-red-100"
    >
      <p className="font-semibold">{messages.errors.generic.title}</p>
      <p className="mt-1 text-xs opacity-90">{message}</p>
      <Button variant="secondary" size="xs" className="mt-3" onClick={onRetry}>
        {messages.sync.retryCta}
      </Button>
    </div>
  );
}

export function DataState<TData, TError = unknown>({
  query,
  skeleton,
  empty,
  isEmpty,
  error,
  stale,
  children,
  className,
}: DataStateProps<TData, TError>) {
  const {
    data,
    isLoading,
    isPending,
    isFetching,
    isError,
    error: queryError,
    refetch,
  } = query;

  const retry = (): void => {
    refetch?.();
  };

  // 1. **Error wins** — an explicit error short-circuits even if a
  //    cached `data` is present, because the cache may be stale and
  //    misleading.
  const hasError = isError === true || queryError != null;
  if (hasError) {
    const err = queryError as TError;
    const node =
      typeof error === "function"
        ? (error as (e: TError, r: () => void) => ReactNode)(err, retry)
        : (error ?? <DefaultErrorFallback error={err} onRetry={retry} />);
    return <div className={className}>{node}</div>;
  }

  // 2. **Loading** — only when we don't already have data. Falling
  //    back to React Query's `isPending` keeps support for v5 callers.
  const loading =
    (isLoading === true || isPending === true) && data === undefined;
  if (loading) {
    return (
      <div className={cn("min-h-0", className)}>
        {skeleton ?? <SkeletonCard />}
      </div>
    );
  }

  // 3. **Empty** — `data` resolved, but it's "nothing to show". We
  //    only render the empty slot when one is provided; otherwise we
  //    fall through to `children(data)` so callers can decide.
  if (data !== undefined && empty !== undefined) {
    const checker = (isEmpty ?? DEFAULT_EMPTY) as (d: TData) => boolean;
    if (checker(data)) {
      return <div className={className}>{empty}</div>;
    }
  }

  // 4. **Success** — render the body. If a `stale` slot is provided
  //    and a background refetch is happening (we have data AND
  //    `isFetching`), show it alongside the body.
  if (data !== undefined) {
    const isStale = isFetching === true;
    return (
      <div className={className}>
        {stale ? stale(data, isStale) : null}
        {children(data)}
      </div>
    );
  }

  // 5. **Indeterminate** — neither error, nor loading, nor data.
  //    Render nothing so we don't flash an empty placeholder.
  return null;
}
