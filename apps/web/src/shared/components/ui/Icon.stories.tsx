import type { Meta, StoryObj } from "@storybook/react-vite";
import { Icon, ICON_NAMES, type IconName } from "./Icon";

/**
 * `Icon` — централізована SVG-палетка (4 групи: system / status / domain
 * / content) з токенами розмірів `xs/sm/md/lg/xl`. Stories покривають
 * розміри, accent-fill, accessibility (`title`) та повний каталог
 * іконок. Initiative 0007 Phase 2 — shared/ui story.
 */
const meta: Meta<typeof Icon> = {
  title: "Shared / Icon",
  component: Icon,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    name: "chevron-right",
    size: "lg",
  },
};
export default meta;

type Story = StoryObj<typeof Icon>;

/** Стандартний рендер — `chevron-right`, default size `lg` (20px). */
export const Default: Story = {};

/** Усі п'ять токенів розмірів у горизонтальному ряді. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3 text-text">
      <Icon name="settings" size="xs" />
      <Icon name="settings" size="sm" />
      <Icon name="settings" size="md" />
      <Icon name="settings" size="lg" />
      <Icon name="settings" size="xl" />
    </div>
  ),
};

/** Module-tinted іконки через CSS-classes — accent-палітра кожного модуля. */
export const ModuleTinted: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Icon name="wallet" className="text-finyk" size="xl" />
      <Icon name="dumbbell" className="text-fizruk" size="xl" />
      <Icon name="apple" className="text-nutrition" size="xl" />
      <Icon name="check-circle" className="text-routine" size="xl" />
    </div>
  ),
};

/** З `title` — оголошується АТ-ам як image із label-ом. */
export const Accessible: Story = {
  args: {
    name: "info",
    title: "Додаткова інформація",
    size: "lg",
  },
};

/** Каталог усіх icon-name-ів — швидкий visual-dump для дизайн-партнерів. */
export const Catalog: Story = {
  render: () => (
    <div className="grid grid-cols-6 gap-3 text-text">
      {(ICON_NAMES as IconName[]).map((name) => (
        <div
          key={name}
          className="flex flex-col items-center gap-1 rounded-xl border border-line p-2"
        >
          <Icon name={name} size="lg" />
          <span className="text-2xs text-muted truncate w-full text-center">
            {name}
          </span>
        </div>
      ))}
    </div>
  ),
};
