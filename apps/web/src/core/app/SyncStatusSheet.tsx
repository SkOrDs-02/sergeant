/**
 * Status: Active
 *
 * Detail sheet for the global sync indicator (mobile-audit A6). Surfaces the
 * connection state, the outbox queue size, and any sync errors with a retry —
 * all read from the existing `useSyncStatus` state, no new sync backend.
 * Copy is kept in JS constants (interpolated, never JSX-text) so the module
 * stays clear of raw Cyrillic literals.
 */
import { useEffect, useState } from "react";
import { pluralUa } from "@sergeant/shared";
import { Sheet } from "@shared/components/ui/Sheet";
import { cn } from "@shared/lib/ui/cn";
import { SyncRejectedList } from "./SyncRejectedList";
import {
  dismissOutboxPurgeNotice,
  useOutboxPurgeNotice,
} from "../syncEngine/outboxPurgeNotice";
// AI-DANGER: беремо VFS із легкого `storageBackendState`, а НЕ з
// `sqlite.ts`. Той статично тягне `drizzle-orm` і схему, тож один імпорт
// звідси поклав би весь drizzle на критичний шлях (root `AGENTS.md`
// § Performance budgets, історія `vendor-sqlite`).
import {
  readActiveSqliteVfs,
  readSqliteVfsFallbackReason,
  type SqliteVfsName,
} from "../db/storageBackendState";
import { probeOpfsInWorker } from "../db/opfsProbe";
import type { OpfsProbeResult } from "../db/opfsProbe.worker";
import { formatDayMonth } from "@shared/lib/time/formatDate";

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
  rejected: "Не прийнято сервером",
  rejectedEmpty: "Немає",
  storage: "Сховище",
  storageUnknown: "Ще не відкривали",
  storageOpfs: "OPFS, файли",
  storageLocalStorage: "localStorage, ліміт ~5 МБ",
  storageMemory: "Лише памʼять, до перезапуску",
  storageOtherTab:
    "База відкрита в іншій вкладці. Закрий зайві вкладки Sergeant і онови цю.",
  opfsWorker: "OPFS у фоні",
  opfsWorkerChecking: "Перевіряю…",
  opfsWorkerOk: "Доступний",
  retry: "Повторити синхронізацію",
  purgeNoticeTitle: "Старі записи прибрано",
  purgeNoticeDismiss: "Зрозуміло",
} as const;

/**
 * PR-T2 (2026-09-13 product review, "Тиха втрата даних"): the boot-time
 * TTL sweep (`purgeStaleTerminalOutbox`, `singleton.ts`) deletes
 * `rejected`/`dead_letter` outbox rows older than 30 days so the local
 * DLQ cannot grow forever — but the deleted rows never reached the
 * server. Without this note the "Помилки"/"Не прийнято сервером" pills
 * above just quietly drop to zero and nobody is told a record was lost.
 * Ukrainian numeral agreement: 1 → nominative singular, 2-4 → nominative
 * plural, 5+ → genitive plural (matches the adjective too).
 */
function purgeNoticeBody(purged: number, purgedAtIso: string): string {
  const noun = pluralUa(purged, {
    one: "старий запис",
    few: "старі записи",
    many: "старих записів",
  });
  const dateLabel = formatDayMonth(new Date(purgedAtIso));
  return (
    `${purged} ${noun} синхронізації видалено ${dateLabel} (старіші за 30 днів)` +
    ` — сервер їх так і не отримав, ці зміни втрачено.`
  );
}

export interface SyncStatusSheetProps {
  open: boolean;
  onClose: () => void;
  online: boolean;
  pending: number;
  deadLetter: number;
  /**
   * Термінально відхилені сервером записи. На відміну від `deadLetter`
   * їх не можна повторити — лише побачити, що саме не доїхало.
   */
  rejected?: number | undefined;
  onRetry?: (() => Promise<void>) | undefined;
}

/**
 * Де фізично лежить локальна база, людською мовою.
 *
 * AI-CONTEXT: у Sentry це є тегом `sqlite.vfs` від 2026-09-14, але доступ
 * до Sentry є не в кожного, хто дивиться на цей аркуш. Розслідування
 * `SQLITE_IOERR` двічі просунулось саме тому, що діагностика потрапила НА
 * ЕКРАН і приїхала скріншотом, а не тому, що хтось відкрив дашборд.
 */
function describeVfs(vfs: SqliteVfsName | null): {
  value: string;
  tone: RowTone;
} {
  if (vfs === "opfs-sahpool") return { value: COPY.storageOpfs, tone: "ok" };
  // Причина йде поперед назви сховища: «Лише памʼять» описує наслідок, а
  // діяти можна лише знаючи причину — і саме цю причину людина усуває сама.
  if (readSqliteVfsFallbackReason() === "pool-busy")
    return { value: COPY.storageOtherTab, tone: "err" };
  if (vfs === "kvvfs") return { value: COPY.storageLocalStorage, tone: "warn" };
  if (vfs === "memory") return { value: COPY.storageMemory, tone: "err" };
  return { value: COPY.storageUnknown, tone: "ok" };
}

/**
 * Відповідь стадії 0 спеки `sqlite-opfs-worker.md` — чи підніметься OPFS у
 * воркері на ЦЬОМУ пристрої. Розвідка вже відпрацювала на буті, тож тут
 * лише читаємо закешований результат.
 */
function useOpfsWorkerStatus(open: boolean): {
  value: string;
  tone: RowTone;
} {
  const [result, setResult] = useState<OpfsProbeResult | null>(null);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void probeOpfsInWorker().then((probe) => {
      if (alive) setResult(probe);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  if (!result) return { value: COPY.opfsWorkerChecking, tone: "ok" };
  return result.kind === "ok"
    ? { value: COPY.opfsWorkerOk, tone: "ok" }
    : { value: result.reason, tone: "warn" };
}

export function SyncStatusSheet({
  open,
  onClose,
  online,
  pending,
  deadLetter,
  rejected = 0,
  onRetry,
}: SyncStatusSheetProps) {
  const purgeNotice = useOutboxPurgeNotice();
  const storage = describeVfs(readActiveSqliteVfs());
  const opfsWorker = useOpfsWorkerStatus(open);
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
    {
      label: COPY.rejected,
      value: rejected > 0 ? String(rejected) : COPY.rejectedEmpty,
      tone: rejected > 0 ? "err" : "ok",
    },
    { label: COPY.storage, value: storage.value, tone: storage.tone },
    {
      label: COPY.opfsWorker,
      value: opfsWorker.value,
      tone: opfsWorker.tone,
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
      {rejected > 0 && <SyncRejectedList />}
      {deadLetter > 0 && onRetry && (
        <button
          type="button"
          onClick={() => {
            void onRetry();
            onClose();
          }}
          className={cn(
            "mt-3 w-full min-h-[44px] rounded-xl font-semibold transition-colors",
            "bg-brand-soft text-brand-strong hover:bg-brand-soft-hover",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
          )}
        >
          {COPY.retry}
        </button>
      )}
      {purgeNotice && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-warning/30 bg-warning/5 px-3 py-2.5"
        >
          <p className="text-style-label font-semibold text-warning-strong dark:text-warning">
            {COPY.purgeNoticeTitle}
          </p>
          <p className="mt-1 text-style-caption text-muted">
            {purgeNoticeBody(purgeNotice.purged, purgeNotice.purgedAtIso)}
          </p>
          <button
            type="button"
            onClick={dismissOutboxPurgeNotice}
            className={cn(
              "mt-2 w-full min-h-[44px] rounded-xl font-semibold transition-colors",
              "bg-warning/10 text-warning-strong hover:bg-warning/15",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
            )}
          >
            {COPY.purgeNoticeDismiss}
          </button>
        </div>
      )}
    </Sheet>
  );
}
