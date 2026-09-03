/**
 * Status: Active
 *
 * Список записів, які сервер відхилив назавжди (`sync_op_outbox.status =
 * 'rejected'`). До 2026-09-03 такий запис був повністю невидимим: локально
 * він є, тож виглядає збереженим, а на сервер не доїде ніколи і сам не
 * ретраїться (tech-debt/frontend.md, знахідка 2026-08-25). Для замірів тіла
 * це мовчазна втрата історії здоровʼя — рівно те, від чого модуль і потрібен.
 *
 * Список читається з локального SQLite через рантайм sync-движка, тому
 * запит іде з `networkMode: "always"` — офлайн тут не перешкода, а
 * найімовірніший контекст.
 */
import { useQuery } from "@tanstack/react-query";
import { syncKeys } from "@shared/lib/api/queryKeys";
import type { RejectedOutboxRow } from "@sergeant/db-schema/sqlite";
import { getSyncEngineWriter } from "../syncEngine/singleton";

const COPY = {
  heading: "Не прийнято сервером",
  explain:
    "Ці записи лишились лише на цьому пристрої: сервер їх відхилив і повторно не візьме. Перевір значення й додай запис ще раз.",
  loading: "Читаю список…",
  empty: "Список порожній",
  unknownReason: "невідома причина",
} as const;

/**
 * Людські назви причин відмови. Технічний код лишається у `title`, щоб його
 * можна було переслати в підтримку; читає людина — текст.
 */
const REASON_LABEL: Record<string, string> = {
  user_id_mismatch: "запис іншого акаунта",
  missing_user_id: "запис без власника",
  clock_skew: "годинник пристрою сильно розходиться з сервером",
  op_not_supported: "застаріла версія застосунку",
  table_not_allowed: "застаріла версія застосунку",
  duplicate: "дубль уже прийнятого запису",
};

const MODULE_LABEL: readonly (readonly [prefix: string, label: string])[] = [
  ["finyk_", "Фінік"],
  ["fizruk_", "Фізрук"],
  ["nutrition_", "Їжа"],
  ["routine_", "Рутина"],
];

export function describeRejectedRow(row: RejectedOutboxRow): {
  module: string;
  reason: string;
} {
  const module =
    MODULE_LABEL.find(([prefix]) => row.tableName.startsWith(prefix))?.[1] ??
    row.tableName;
  const code = row.rejectReason;
  const reason =
    code == null
      ? COPY.unknownReason
      : (REASON_LABEL[code] ??
        (code.startsWith("invalid_")
          ? "значення поза межами"
          : code.replace(/_/g, " ")));
  return { module, reason };
}

async function fetchRejected(): Promise<readonly RejectedOutboxRow[]> {
  const runtime = getSyncEngineWriter();
  if (!runtime) return [];
  try {
    return await runtime.listRejected();
  } catch {
    return [];
  }
}

export function SyncRejectedList() {
  const { data, isPending } = useQuery({
    queryKey: syncKeys.rejected(),
    queryFn: fetchRejected,
    networkMode: "always",
    staleTime: 0,
  });

  return (
    <section
      aria-label={COPY.heading}
      className="mt-3 rounded-xl border border-danger/30 bg-danger/5 px-3 py-2.5"
      data-testid="sync-rejected-list"
    >
      <p className="text-style-label font-semibold text-danger-strong dark:text-danger">
        {COPY.heading}
      </p>
      <p className="mt-1 text-style-caption text-muted">{COPY.explain}</p>
      {isPending ? (
        <p className="mt-2 text-style-caption text-subtle">{COPY.loading}</p>
      ) : !data || data.length === 0 ? (
        <p className="mt-2 text-style-caption text-subtle">{COPY.empty}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {data.map((row) => {
            const { module, reason } = describeRejectedRow(row);
            return (
              <li
                key={row.id}
                className="flex items-baseline justify-between gap-3 text-style-caption"
                title={row.rejectReason ?? undefined}
              >
                <span className="text-text">{module}</span>
                <span className="text-muted text-right">{reason}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
