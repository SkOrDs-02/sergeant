import type { Meta, StoryObj } from "@storybook/react-vite";
import { DataTable, type DataTableColumn } from "./DataTable";
import { EmptyState } from "./EmptyState";

/**
 * `DataTable` — єдиний табличний примітив, що замінює module-local
 * hand-rolled `<table>` блоки (finyk-аналітика, fizruk-заміри,
 * nutrition-тижневий лог). Один контракт для zebra, header-стилю,
 * числового вирівнювання (`numeric` → right + `tabular-nums`),
 * `density`, module-accent заголовка, sticky-header (`z-sticky`) і
 * порожнього стану (делегує в `EmptyState`).
 */

interface Merchant {
  name: string;
  category: string;
  txns: number;
  total: number;
}

const merchants: readonly Merchant[] = [
  { name: "АТБ", category: "Продукти", txns: 42, total: 8450 },
  { name: "Нова Пошта", category: "Доставка", txns: 11, total: 1230 },
  { name: "OKKO", category: "Паливо", txns: 8, total: 6400 },
  { name: "Rozetka", category: "Покупки", txns: 5, total: 12800 },
];

const merchantColumns: readonly DataTableColumn<Merchant>[] = [
  { id: "name", header: "Мерчант", rowHeader: true, cell: (r) => r.name },
  { id: "category", header: "Категорія", cell: (r) => r.category },
  { id: "txns", header: "Операцій", numeric: true, cell: (r) => r.txns },
  {
    id: "total",
    header: "Сума, ₴",
    numeric: true,
    cell: (r) => r.total.toLocaleString("uk-UA"),
  },
];

const meta: Meta<typeof DataTable<Merchant>> = {
  title: "UI / DataTable",
  component: DataTable,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    module: {
      control: "select",
      options: [undefined, "finyk", "fizruk", "routine", "nutrition"],
    },
    density: { control: "select", options: ["comfortable", "compact"] },
    zebra: { control: "boolean" },
    stickyHeader: { control: "boolean" },
  },
  args: {
    module: "finyk",
    density: "comfortable",
    zebra: true,
    columns: merchantColumns,
    rows: merchants,
    getRowKey: (r: Merchant) => r.name,
    caption: "Витрати за мерчантами",
  },
};
export default meta;

type Story = StoryObj<typeof DataTable<Merchant>>;

/** Фінансова таблиця: числові колонки праворуч + `tabular-nums`. */
export const Default: Story = {};

/** Щільний режим — для великих списків операцій. */
export const Compact: Story = { args: { density: "compact" } };

/** Без zebra-смуг, нейтральний (без module-акценту) заголовок. */
export const NeutralNoZebra: Story = {
  // Omitting `module` (rather than passing `undefined`) keeps the header
  // neutral under `exactOptionalPropertyTypes`.
  args: { zebra: false },
};

/** Кожен модуль тонує заголовок своїм brand-акцентом. */
export const ModuleAccents: Story = {
  render: (args) => (
    <div className="space-y-6">
      {(["finyk", "fizruk", "routine", "nutrition"] as const).map((m) => (
        <DataTable key={m} {...args} module={m} caption={`Витрати — ${m}`} />
      ))}
    </div>
  ),
};

/** Порожній стан делегує в `EmptyState` — як і будь-яка інша поверхня. */
export const Empty: Story = {
  args: {
    rows: [],
    empty: (
      <EmptyState
        compact
        title="Ще немає операцій"
        description="Додай першу транзакцію, щоб побачити розподіл за мерчантами."
      />
    ),
  },
};
