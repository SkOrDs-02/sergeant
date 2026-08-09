/**
 * Last validated: 2026-07-25
 * Status: Active
 *
 * «Що ШІ про мене памʼятає» — список збережених фактів із точковим
 * видаленням. Канон `hub-coach` (D5/G3): памʼять, якої не видно, юзер не
 * контролює. До цього екрана єдиним важелем була кнопка «стерти все».
 *
 * AI-CONTEXT: видалення тут **незворотне** (серверний шлях —
 * `DELETE FROM ai_memories`, а не soft-delete через `deleted_at`; деталі й
 * причина — у `apps/server/src/modules/ai-memory/listRoute.ts`). Копія має
 * це казати прямо; якщо колись поміняється серверна семантика, текст
 * «Це назавжди» треба міняти тим самим PR-ом.
 */
import { useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { meApi } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import type { AiMemoryListItem } from "@sergeant/api-client";

// V-8 (аудит 2026-08-08): переїзд із локального `ConfirmModal` на канонічний
// портальний `ConfirmDialog` — причина в `FinykWebhookServiceSection.tsx`.
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";

const m = messages.privacy.aiMemory;

const PAGE_SIZE = 20;

/** Людські назви джерел. Ключі — `ALLOWED_MEMORY_SOURCES` на сервері. */
const SOURCE_LABEL: Record<string, string> = {
  chat: "Чат",
  finyk: "Фінік",
  fizruk: "Фізрук",
  nutrition: "Харчування",
  routine: "Рутина",
  journal: "Щоденник",
  digest: "Підсумок тижня",
  cofounder: "Співзасновник",
  product: "Продукт",
  // Міграція 118 / L-8 (аудит 2026-08-08): факти, які людина заявила про
  // себе сама — через інтервʼю з асистентом або вручну в банку памʼяті.
  // Без цього рядка fallback `?? item.source` показав би сире «profile».
  profile: "Профіль",
};

function formatDay(iso: string): string {
  // Europe/Kyiv — доменний інваріант: дата факту має читатись у часовому
  // поясі юзера, а не у UTC, інакше вечірні записи «переїжджають» на
  // наступний день.
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Kyiv",
  }).format(new Date(iso));
}

export function AiMemoryList() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<AiMemoryListItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: aiMemoryKeys.list,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam, signal }) =>
      meApi.listAiMemory(
        pageParam === undefined
          ? { limit: PAGE_SIZE }
          : { limit: PAGE_SIZE, cursor: pageParam },
        { signal },
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const remove = useMutation({
    mutationFn: (id: number) => meApi.deleteAiMemory(id),
    onSuccess: async () => {
      setError(null);
      // Скидаємо ВЕСЬ infinite-кеш, а не ріжемо елемент локально: keyset-
      // сторінки після видалення зсуваються, і ручне склеювання розійшлося
      // б із сервером на межах сторінок.
      await queryClient.invalidateQueries({ queryKey: aiMemoryKeys.all });
    },
    onError: () => setError(m.deleteError),
  });

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  if (query.isPending) {
    return (
      <p className="text-style-caption text-subtle" role="status">
        {m.loading}
      </p>
    );
  }

  if (query.isError) {
    return (
      <p className="text-style-caption text-danger-strong" role="alert">
        {m.loadError}
      </p>
    );
  }

  if (items.length === 0) {
    // V-14 (аудит 2026-08-08): був голий <p> — окремий рецепт порожнього
    // стану, ніж спільний `EmptyState` (немає role=status/aria-live,
    // інша типографіка). `MemoryBankSection` — другий вхід у «що ШІ про
    // мене знає» — тепер малює порожнечу тим самим примітивом.
    return <EmptyState size="sm" description={m.empty} />;
  }

  return (
    <div className="space-y-2">
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-start gap-2 rounded-xl border border-line bg-panel p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-style-body text-text break-words">
                {item.content}
              </p>
              <p className="mt-1 text-style-caption text-subtle">
                {SOURCE_LABEL[item.source] ?? item.source} ·{" "}
                {formatDay(item.createdAt)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${m.deleteAria}: ${item.content}`}
              disabled={remove.isPending}
              className="text-danger-strong"
              onClick={() => setPending(item)}
            >
              <Icon name="close" size={14} aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {query.hasNextPage ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? m.loadingMore : m.loadMore}
        </Button>
      ) : null}

      {error ? (
        <p className="text-style-caption text-danger-strong" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={pending !== null}
        title={m.confirmTitle}
        description={`«${pending?.content ?? ""}» ${m.confirmBody}`}
        confirmLabel={m.confirmButton}
        danger
        onConfirm={() => {
          const target = pending;
          setPending(null);
          if (target) remove.mutate(target.id);
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
