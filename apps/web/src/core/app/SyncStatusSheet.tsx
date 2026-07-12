/**
 * Status: Active
 *
 * Detail sheet for the global sync indicator (mobile-audit A6). Surfaces the
 * connection state, the outbox queue size, and any sync errors with a retry —
 * all read from the existing `useSyncStatus` state, no new sync backend.
 * Copy is kept in JS constants (interpolated, never JSX-text) so the module
 * stays clear of raw Cyrillic literals.
 */
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";

type RowTone = "ok" | "warn" | "err";

const TONE_CLS: Record<RowTone, string> = {
  ok: "text-subtle",
  warn: "text-warning-strong dark:text-warning",
  err: "text-danger-strong dark:text-danger",
};

const COPY = {
  title: "Синхронізація",
  description: "Стан збереження даних у хмару",
  network: "Мережа",
  online: "Онлайн",
  offline: "Офлайн",
  queue: "У черзі",
  queueEmpty: "Нічого не чекає",
  errors: "Помилки",
  errorsEmpty: "Немає",
  retry: "Повторити синхронізацію",
} as const;

export interface SyncStatusSheetProps {
  open: boolean;
  onClose: () => void;
  online: boolean;
  pending: number;
  deadLetter: number;
  onRetry?: (() => Promise<void>) | undefined;
}

export function SyncStatusSheet({
  open,
  onClose,
  online,
  pending,
  deadLetter,
  onRetry,
}: SyncStatusSheetProps) {
  const rows: { label: string; value: string; tone: RowTone }[] = [
    {
      label: COPY.network,
      value: online ? COPY.online : COPY.offline,
      tone: online ? "ok" : "warn",
    },
    {
      label: COPY.queue,
      value: pending > 0 ? String(pending) : COPY.queueEmpty,
      tone: pending > 0 ? "warn" : "ok",
    },
    {
      label: COPY.errors,
      value: deadLetter > 0 ? String(deadLetter) : COPY.errorsEmpty,
      tone: deadLetter > 0 ? "err" : "ok",
    },
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={COPY.title}
      description={COPY.description}
    >
      <div className="space-y-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-panelHi"
          >
            <span className="text-style-label text-text">{row.label}</span>
            <span
              className={cn(
                "text-style-caption font-semibold tabular-nums",
                TONE_CLS[row.tone],
              )}
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
      {deadLetter > 0 && onRetry && (
        <button
          type="button"
          onClick={() => {
            void onRetry();
            onClose();
          }}
          className={cn(
            "mt-3 w-full min-h-[44px] rounded-xl font-semibold transition-colors",
            "bg-brand-soft text-brand-strong dark:text-brand hover:bg-brand-soft-hover",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          {COPY.retry}
        </button>
      )}
    </Sheet>
  );
}
