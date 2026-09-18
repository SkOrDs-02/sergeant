import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataState } from "./DataState";
import { Skeleton, SkeletonText } from "./Skeleton";

/**
 * `DataState<TData, TError>` — single-spot wrapper навколо чотирьох
 * канонічних станів React-Query-подібного результату:
 *
 * - **loading** — є `<SkeletonCard />` за замовчуванням; передавай
 *   shape-aware skeleton щоб transition skeleton → content
 *   reflow-вився мінімально.
 * - **error** — функціональний slot `(error, retry) => ReactNode`.
 *   Default fallback показує `Помилка` + текст + `Спробувати ще`.
 * - **empty** — рендериться тільки якщо `empty` slot переданий
 *   (інакше fallthrough до `children(data)`).
 * - **stale** — рендер альонгсайд `children(data)` коли вже є дані,
 *   але бекграунд refetch — useful для непомітних "оновлюється…".
 *
 * `query` приймає мінімальний контракт: `{ data, isLoading?, isError?,
 * error?, refetch? }`. Це навмисно — деякі legacy-хуки (e.g.
 * `useMonoTransactions`) не повертають повну `UseQueryResult`-форму.
 *
 * **Цей компонент НЕ викликає `useQuery`.** Host-page далі володіє
 * хуком + ключем; wrapper лише формалізує presentation contract.
 */
const meta: Meta<typeof DataState> = {
  title: "UI / DataState",
  component: DataState,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof DataState>;

interface Tx {
  id: number;
  title: string;
  amount: number;
}

const SAMPLE: Tx[] = [
  { id: 1, title: "Сільпо", amount: -428.5 },
  { id: 2, title: "monobank cashback", amount: 87.3 },
  { id: 3, title: "Sundownr", amount: -120 },
];

function TxList({ items }: { items: Tx[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((t) => (
        <li
          key={t.id}
          className="flex items-center justify-between rounded-xl bg-panel px-3 py-2 text-sm"
        >
          <span>{t.title}</span>
          <span
            className={
              t.amount < 0 ? "text-danger-strong" : "text-success-strong"
            }
          >
            {t.amount.toFixed(2)} ₴
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Базовий happy-path: дані прийшли, рендеримо TxList. */
export const Loaded: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{ data: SAMPLE, isLoading: false }}
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/** Loading-стан: дефолтний `SkeletonCard` (без overrides). */
export const LoadingDefault: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{ data: undefined, isLoading: true }}
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/** Loading зі shape-aware skeleton — мінімальний reflow при переході. */
export const LoadingShapeAware: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{ data: undefined, isLoading: true }}
      skeleton={
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-panel px-3 py-2"
            >
              <SkeletonText className="w-1/3" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
      }
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/** Empty-стан: дані прийшли але порожні. */
export const Empty: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{ data: [], isLoading: false }}
      empty={
        <div className="rounded-2xl border border-line bg-panel/40 px-4 py-6 text-center text-sm text-muted">
          Немає транзакцій за вибраний період.
        </div>
      }
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/** Error-стан: дефолтний fallback з кнопкою «Спробувати ще». */
export const ErrorDefault: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{
        data: undefined,
        isError: true,
        error: new Error("Mono API: 503 Service Unavailable"),
        refetch: () => undefined,
      }}
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/** Error-стан з кастомним slot-функцією — отримує `(err, retry)`. */
export const ErrorCustom: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{
        data: undefined,
        isError: true,
        error: new Error("Тимчасова помилка мережі"),
        refetch: () => undefined,
      }}
      error={(err, retry) => (
        <div className="rounded-2xl border border-warning/40 bg-warning-soft px-4 py-3 text-sm text-warning-strong dark:text-amber-100">
          <p className="font-semibold">Не вдалось оновити</p>
          <p className="mt-1 text-xs opacity-90">
            {err instanceof Error ? err.message : "Невідома помилка"}
          </p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 underline text-xs"
          >
            Повторити запит
          </button>
        </div>
      )}
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};

/**
 * Stale-стан: дані вже на екрані, фон-refetch у польоті —
 * `stale` slot рендериться поруч із `children(data)`. Корисно для
 * «оновлюється…» badge-у без блокування контенту.
 */
export const Stale: Story = {
  render: () => (
    <DataState<Tx[]>
      query={{ data: SAMPLE, isFetching: true }}
      stale={(_data, isStale) =>
        isStale ? (
          <div className="text-2xs text-muted mb-1.5 italic">оновлюється…</div>
        ) : null
      }
      empty={<div className="text-muted text-sm">Немає транзакцій.</div>}
    >
      {(data) => <TxList items={data} />}
    </DataState>
  ),
};
