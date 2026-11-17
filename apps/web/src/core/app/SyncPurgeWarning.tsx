/**
 * Status: Active
 *
 * PR-T2 (`docs/work/specs/audits/2026-09-13-product-full-review.md`):
 * попередження ДО TTL-чистки черги синку. Бут-чистка
 * (`purgeStaleTerminalOutbox`, `singleton.ts`) видаляє `dead_letter` /
 * `rejected` рядки, старші за `SYNC_OP_OUTBOX_STALE_TTL_DAYS`, і пост-фактум
 * слід (`outboxPurgeNotice.ts`) зʼявляється, коли даних уже немає. Цей блок
 * показує за `SYNC_OP_OUTBOX_PURGE_WARNING_DAYS` днів до чистки, скільки
 * записів зникне і коли, поки `dead_letter` ще можна повторити.
 *
 * Прогноз читається з локального SQLite через рантайм sync-движка
 * (`forecastStaleTerminalOutboxPurge`), тому `networkMode: "always"`.
 * Компонент монтується лише всередині відкритого `SyncStatusSheet`, тож
 * запит іде на кожне відкриття аркуша, а не за таймером.
 */
import { useQuery } from "@tanstack/react-query";
import { pluralUa } from "@sergeant/shared";
import type { StaleTerminalOutboxPurgeForecast } from "@sergeant/db-schema/sqlite";
import { syncKeys } from "@shared/lib/api/queryKeys";
import { formatDayMonth } from "@shared/lib/time/formatDate";
import { getSyncEngineWriter } from "../syncEngine/singleton";

const COPY = {
  title: "Записи скоро зникнуть з пристрою",
  hintRetry: "Натисни «Повторити синхронізацію», поки вони ще тут.",
  hintRejected: "Перепиши їх зі списку вище, поки вони ще тут.",
} as const;

const EMPTY: StaleTerminalOutboxPurgeForecast = {
  count: 0,
  earliestPurgeAtIso: null,
};

async function fetchForecast(): Promise<StaleTerminalOutboxPurgeForecast> {
  const runtime = getSyncEngineWriter();
  if (!runtime) return EMPTY;
  return runtime.getPurgeForecast();
}

/**
 * Текст попередження. Дата в минулому означає, що рядок уже переріс TTL
 * посеред сесії: чистка йде лише на буті, тож він зникне на наступному
 * запуску.
 */
export function purgeWarningBody(
  forecast: StaleTerminalOutboxPurgeForecast,
  canRetry: boolean,
  now: Date = new Date(),
): string {
  const { count, earliestPurgeAtIso } = forecast;
  const lead = `${count} ${pluralUa(count, {
    one: "запис так і не дійшов",
    few: "записи так і не дійшли",
    many: "записів так і не дійшли",
  })} на сервер.`;
  const purgeAt =
    earliestPurgeAtIso !== null ? new Date(earliestPurgeAtIso) : null;
  const when =
    purgeAt === null ||
    Number.isNaN(purgeAt.getTime()) ||
    purgeAt.getTime() <= now.getTime()
      ? "Під час наступного запуску"
      : `Після ${formatDayMonth(purgeAt)}`;
  const hint = canRetry ? COPY.hintRetry : COPY.hintRejected;
  return `${lead} ${when} застосунок прибере їх із пристрою, і ці зміни буде втрачено. ${hint}`;
}

export interface SyncPurgeWarningProps {
  /** Є `dead_letter`-рядки, тобто кнопка повтору в аркуші доступна. */
  readonly canRetry: boolean;
}

export function SyncPurgeWarning({ canRetry }: SyncPurgeWarningProps) {
  const { data } = useQuery({
    queryKey: syncKeys.purgeForecast(),
    queryFn: fetchForecast,
    networkMode: "always",
    staleTime: 0,
    // Локальний SQLite: повтор за мілісекунди дасть той самий результат.
    // Збій читання тут означає «попередження не показуємо», як і до PR-T2.
    retry: false,
  });

  if (!data || data.count <= 0) return null;

  return (
    <div
      role="status"
      data-testid="sync-purge-warning"
      className="mt-3 rounded-panel border border-warning/30 bg-warning/5 px-3 py-2.5"
    >
      <p className="text-style-label font-semibold text-warning-strong dark:text-warning">
        {COPY.title}
      </p>
      <p className="mt-1 text-style-caption text-muted">
        {purgeWarningBody(data, canRetry)}
      </p>
    </div>
  );
}
