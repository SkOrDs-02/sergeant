/**
 * Last validated: 2026-08-18
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
 *
 * AI-CONTEXT (2026-08-18): плаский список тут не масштабувався. Після
 * дзеркалення фактів профілю (міграція 118) і появи тижневих підсумків із
 * дайджесту — а це абзаци на кілька рядків кожен — сторінка з 20 фактів
 * читалась як суцільне полотно, у якому нічого не знайти. Тому два рівні
 * згортання: факти згруповані за джерелом (кожна група розкривається
 * окремо), а довгий текст факту обрізаний до трьох рядків із розгортанням.
 * Обидва дефолти залежать від обсягу: маленька памʼять (≤5 фактів)
 * лишається розгорнутою, бо там ховати нічого.
 */
import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { useOptionalHubShell } from "../app/HubShellContext";
import { Button } from "@shared/components/ui/Button";
import { EmptyState } from "@shared/components/ui/EmptyState";
import { meApi } from "@shared/api";
import { messages } from "@shared/i18n/uk";
import { aiMemoryKeys } from "@shared/lib/api/queryKeys";
import { cn } from "@shared/lib/ui/cn";
import { isApiError, type AiMemoryListItem } from "@sergeant/api-client";

// V-8 (аудит 2026-08-08): переїзд із локального `ConfirmModal` на канонічний
// портальний `ConfirmDialog` — причина в `FinykWebhookServiceSection.tsx`.
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Icon } from "@shared/components/ui/Icon";

const m = messages.privacy.aiMemory;

const PAGE_SIZE = 20;

/**
 * До цієї кількості завантажених фактів групи стоять розгорнутими: ховати
 * три рядки за клік — це ускладнення без виграшу.
 */
const AUTO_OPEN_MAX_ITEMS = 5;

/** Довші за це факти обрізаються до трьох рядків із кнопкою розгортання. */
const CLAMP_CHARS = 160;

/** Людські назви джерел. Ключі — `ALLOWED_MEMORY_SOURCES` на сервері. */
const SOURCE_LABEL: Record<string, string> = {
  chat: "Чат",
  finyk: "Фінік",
  fizruk: "Фізрук",
  nutrition: "Їжа",
  routine: "Рутина",
  journal: "Щоденник",
  digest: "Підсумок тижня",
  cofounder: "Співзасновник",
  // Рішення власника 2026-08-18: «Продукт» нічого не пояснювало. Ці рядки —
  // не факти про людину, а 4 мілстоуни телеметрії (ex-eventSync.ts,
  // дзеркало знято 2026-08-29; legacy-рядки лишились): signup, onboarding,
  // перша дія в модулі, підписка. Пишуться напів-англійським текстом під
  // founder-ський `/recall`, тому називаємо їх тим, чим вони є.
  product: "Події застосунку",
  // Міграція 118 / L-8 (аудит 2026-08-08): факти, які людина заявила про
  // себе сама — через інтервʼю з асистентом або вручну в банку памʼяті.
  // Без цього рядка fallback `?? item.source` показав би сире «profile».
  profile: "Профіль",
};

function sourceLabel(source: string): string {
  return SOURCE_LABEL[source] ?? source;
}

/**
 * Службові джерела: рядок пише не людина про себе, а система — телеметрія
 * (`product`) або згенерований тижневий звіт (`digest`). Такі групи завжди
 * згорнуті й завжди в кінці списку, але лишаються видимими й видаляються
 * поштучно, бо це теж памʼять про тебе.
 *
 * Рішення власника 2026-08-18 (двома заходами: спершу `product`, потім
 * `digest`). Критерій, за яким сюди додають нове джерело: чи міг би
 * користувач сам вимовити цей рядок як факт про себе. «Алергія на горіхи» —
 * так; «2026-05-13: first action completed у модулі finyk» і «Тижневий звіт
 * 3 серп. — 9 серп.» — ні.
 */
const TECHNICAL_SOURCES: ReadonlySet<string> = new Set(["product", "digest"]);

/**
 * Джерело з ЄДИНИМ редактором в іншому місці — Профіль → «Банк памʼяті»
 * (рішення власника 2026-08-30, спека `memory-bank-consolidation.md`).
 *
 * AI-CONTEXT: до цієї зміни факти профілю мали тут власні хрестики, тобто
 * список редагувався з двох екранів. Гірше за дубль кнопок був кеш-лаг:
 * видалення звідси йшло `DELETE /api/ai-memory/:id` і чистило сервер, але
 * локальний банк (`core/profile/memoryBank.ts`) лишався зі старим записом
 * до перезавантаження сторінки — і чатовий `my_profile` ще бачив «видалений»
 * факт. Тепер єдиний шлях видалення починається з локалки, яка свіжа за
 * визначенням, а на сервер і у вектори це доїжджає наявним ланцюгом
 * push → `mirrorProfileMemoryEntries` diff.
 *
 * Роут `DELETE /api/ai-memory/:id` НЕ чіпаємо: він лишається захисною
 * когерентністю для прямих викликів API, просто UI ним більше не ходить.
 */
const PROFILE_SOURCE = "profile";

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

interface MemoryGroup {
  source: string;
  label: string;
  technical: boolean;
  items: AiMemoryListItem[];
}

/**
 * Групує факти за джерелом, зберігаючи порядок першої появи. Сервер віддає
 * список від найновішого, тож зверху опиняється джерело, яке писало
 * останнім — той самий порядок, що й у плоскому списку до цієї зміни.
 */
function groupBySource(items: AiMemoryListItem[]): MemoryGroup[] {
  const bySource = new Map<string, MemoryGroup>();
  for (const item of items) {
    const existing = bySource.get(item.source);
    if (existing) {
      existing.items.push(item);
      continue;
    }
    bySource.set(item.source, {
      source: item.source,
      label: sourceLabel(item.source),
      technical: TECHNICAL_SOURCES.has(item.source),
      items: [item],
    });
  }
  // Службові групи — вниз. `sort` у JS стабільний, тож усередині кожної
  // половини порядок першої появи (тобто свіжості) зберігається.
  return [...bySource.values()].sort(
    (a, b) => Number(a.technical) - Number(b.technical),
  );
}

function MemoryFact({
  item,
  onDelete,
  deleteDisabled,
}: {
  item: AiMemoryListItem;
  onDelete: (item: AiMemoryListItem) => void;
  deleteDisabled: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const clampable = item.content.length > CLAMP_CHARS;

  return (
    <li className="flex items-start gap-2 rounded-xl border border-line bg-panel p-3">
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-style-body text-text break-words",
            clampable && !expanded && "line-clamp-3",
          )}
        >
          {item.content}
        </p>
        {clampable && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className={cn(
              "mt-1 text-style-caption text-brand-strong",
              "hover:text-brand-600 transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 rounded-lg",
            )}
          >
            {expanded ? m.collapseFact : m.expandFact}
          </button>
        )}
        {/* Джерело більше не дублюється на кожному рядку — його несе
            заголовок групи, під яким факт і лежить. Лишається дата. */}
        <p className="mt-1 text-style-caption text-subtle">
          {formatDay(item.createdAt)}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`${m.deleteAria}: ${item.content}`}
        disabled={deleteDisabled}
        className="text-danger-strong"
        onClick={() => onDelete(item)}
      >
        <Icon name="close" size={14} aria-hidden />
      </Button>
    </li>
  );
}

/**
 * Картка-вказівник замість розкривної групи: показує, скільки фактів
 * профілю асистент бачить, і веде туди, де вони редагуються.
 *
 * Лічильник свідомо рахує ЗАВАНТАЖЕНІ сторінки, а не робить окремий запит:
 * список і так пагінований, а точна цифра тут нічого не вирішує — вона
 * орієнтир, не звіт. Якщо людина дотисне «Показати більше», число підросте
 * разом зі списком.
 */
function ProfileGroupCard({ count }: { count: number }) {
  // `useOptionalHubShell` (не `useHubShell`): секція рендериться і поза
  // роутером — у тестах і Storybook, — а падати там через відсутній
  // контекст вона не має. Без шелла картка лишається читабельною, зникає
  // лише кнопка переходу.
  const shell = useOptionalHubShell();

  return (
    <section className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className="text-style-label font-semibold text-text">
          {m.profileGroupTitle}
        </span>
        <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-panelHi text-style-caption font-bold text-muted">
          {count}
        </span>
      </div>
      <p className="mt-1 text-style-caption text-subtle leading-relaxed">
        {m.profileGroupHint}
      </p>
      {shell ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => shell.ui.setHubView("profile")}
        >
          {m.profileGroupAction}
        </Button>
      ) : null}
    </section>
  );
}

function MemoryGroupSection({
  group,
  defaultOpen,
  onDelete,
  deleteDisabled,
}: {
  group: MemoryGroup;
  defaultOpen: boolean;
  onDelete: (item: AiMemoryListItem) => void;
  deleteDisabled: boolean;
}) {
  // Стан живе в компоненті групи, а не в мапі на рівні списку: після
  // видалення факту `invalidateQueries` перечитує весь infinite-кеш, і мапа
  // «джерело → відкрито», зібрана з попередніх сторінок, розʼїхалася б із
  // новим набором груп. Ключ `group.source` у батька тримає цей стан
  // стабільним через рефетчі.
  // Службова група ігнорує `defaultOpen`: навіть у крихітній памʼяті вона
  // не має розкриватись сама — її вміст людині нічого не каже.
  const [open, setOpen] = useState(defaultOpen && !group.technical);
  const hint = group.technical ? m.technicalGroupHints[group.source] : null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${m.groupToggleAria}: ${group.label}`}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl touch-target",
          "border border-line bg-panel hover:bg-panelHi transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
        )}
      >
        <span className="flex items-center gap-2 text-style-label font-semibold text-text">
          {group.label}
          <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-panelHi text-style-caption font-bold text-muted">
            {group.items.length}
          </span>
        </span>
        <Icon
          name="chevron-right"
          size={15}
          strokeWidth={2.5}
          className={cn(
            "text-muted transition-transform duration-base",
            open && "rotate-90",
          )}
          aria-hidden
        />
      </button>

      {open && hint && (
        <p className="px-3 pt-2 text-style-caption text-subtle leading-relaxed">
          {hint}
        </p>
      )}

      {open && (
        <ul className="space-y-2 pt-2">
          {group.items.map((item) => (
            <MemoryFact
              key={item.id}
              item={item}
              onDelete={onDelete}
              deleteDisabled={deleteDisabled}
            />
          ))}
        </ul>
      )}
    </section>
  );
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

  const items = useMemo(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  );
  const groups = useMemo(() => groupBySource(items), [items]);

  if (query.isPending) {
    return (
      <p className="text-style-caption text-subtle" role="status">
        {m.loading}
      </p>
    );
  }

  if (query.isError) {
    // 401/403 — гість, не збій: список за `requireSession()`. Той самий
    // патерн, що й у `PrivacySection.loadPreferences` («Увійди в акаунт,
    // щоб…»), і той самий примітив, що й у порожнього стану нижче — це
    // саме порожній стан з іншою причиною, а не помилка.
    if (
      isApiError(query.error) &&
      query.error.kind === "http" &&
      query.error.isAuth
    ) {
      return <EmptyState size="sm" description={m.authRequired} />;
    }
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

  const groupsDefaultOpen = items.length <= AUTO_OPEN_MAX_ITEMS;

  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {groups.map((group) =>
          group.source === PROFILE_SOURCE ? (
            <ProfileGroupCard key={group.source} count={group.items.length} />
          ) : (
            <MemoryGroupSection
              key={group.source}
              group={group}
              defaultOpen={groupsDefaultOpen}
              onDelete={setPending}
              deleteDisabled={remove.isPending}
            />
          ),
        )}
      </div>

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
