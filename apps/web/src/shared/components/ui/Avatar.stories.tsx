import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./Avatar";

/**
 * `Avatar` — кругла аватарка з image-source, fallback на ініціали з `name`,
 * та опційний status-dot (online / busy / offline).
 *
 * Розміри узгоджені з `Button` size-tokens: xs (24), sm (32), md (40),
 * lg (48), xl (56). `getInitials(name)` бере перший символ першого слова +
 * перший символ останнього слова, uppercased; для одного слова — лише
 * перший символ. Status-dot ловить `ring-panel`, тож на темному фоні
 * залишається видимим.
 */
const meta: Meta<typeof Avatar> = {
  title: "UI / Avatar",
  component: Avatar,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["xs", "sm", "md", "lg", "xl"] },
    status: {
      control: "select",
      options: [undefined, "online", "busy", "offline"],
    },
  },
  args: {
    name: "Ка А",
    size: "md",
  },
};
export default meta;

type Story = StoryObj<typeof Avatar>;

/** Default — ініціали `КА` з `name="Ка А"`. */
export const Default: Story = {};

/** З аватаркою-зображенням; `alt={name}` для a11y. */
export const WithImage: Story = {
  args: {
    src: "https://i.pravatar.cc/96?img=12",
    name: "Ка А",
  },
};

/** Fallback на ініціали, коли `src` недоступний. */
export const InitialsFallback: Story = {
  args: { name: "Олена Шевченко" },
};

/** З status-dot — online (зелений). */
export const StatusOnline: Story = {
  args: { name: "Олена", status: "online" },
};

/** З status-dot — busy (жовтий). */
export const StatusBusy: Story = {
  args: { name: "Олена", status: "busy" },
};

/** З status-dot — offline (сірий). */
export const StatusOffline: Story = {
  args: { name: "Олена", status: "offline" },
};

/** Усі розміри в один ряд — для перевірки токенів та status-dot масштабу. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-end gap-4">
      <Avatar name="К А" size="xs" status="online" />
      <Avatar name="К А" size="sm" status="online" />
      <Avatar name="К А" size="md" status="online" />
      <Avatar name="К А" size="lg" status="online" />
      <Avatar name="К А" size="xl" status="online" />
    </div>
  ),
};

/** Edge-cases для `getInitials` — порожнє ім'я, одне слово, не-латиниця. */
export const InitialsEdgeCases: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Avatar name="" />
      <Avatar name="Олена" />
      <Avatar name="Олена Шевченко" />
      <Avatar name="李 小龙" />
    </div>
  ),
};
