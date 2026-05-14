/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import type { Meta, StoryObj } from "@storybook/react-vite";
import { BentoCard } from "./BentoCard";
import { MODULE_CONFIGS } from "./moduleConfigs";

const noop = () => {};

const finyk = MODULE_CONFIGS.finyk;
const fizruk = MODULE_CONFIGS.fizruk;
const routine = MODULE_CONFIGS.routine;
const nutrition = MODULE_CONFIGS.nutrition;

const meta: Meta<typeof BentoCard> = {
  title: "Hub / BentoCard",
  component: BentoCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: 180, height: 160 }}>
        <Story />
      </div>
    ),
  ],
  args: {
    config: finyk,
    onClick: noop,
  },
};
export default meta;

type Story = StoryObj<typeof BentoCard>;

export const Default: Story = {};

/** G1 — description рядок під label. Видимий у всіх 4 модулях коли є дані або empty. */
export const WithDescription: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3" style={{ width: 380 }}>
      {([finyk, fizruk, routine, nutrition] as const).map((cfg) => (
        <div key={cfg.module} style={{ height: 160 }}>
          <BentoCard config={cfg} onClick={noop} />
        </div>
      ))}
    </div>
  ),
};

/** Неактивний стан — description прихований (модуль не увімкнено). */
export const Inactive: Story = {
  args: { inactive: true },
};

/** Edit mode — лише drag handle, без quick-add. */
export const EditMode: Story = {
  args: { editMode: true },
};

/** Adaptive reason chip — видимий лише в active стані. */
export const AdaptiveLifted: Story = {
  args: {
    adaptiveReason: "ранкова рутина",
  },
};

/** Усі 4 модулі у звичайному стані. */
export const AllModules: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-3" style={{ width: 380 }}>
      <div style={{ height: 160 }}>
        <BentoCard config={finyk} onClick={noop} />
      </div>
      <div style={{ height: 160 }}>
        <BentoCard config={fizruk} onClick={noop} />
      </div>
      <div style={{ height: 160 }}>
        <BentoCard config={routine} onClick={noop} />
      </div>
      <div style={{ height: 160 }}>
        <BentoCard config={nutrition} onClick={noop} />
      </div>
    </div>
  ),
};
