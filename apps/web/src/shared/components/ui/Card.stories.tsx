import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./Card";

/**
 * `Card` — surface-примітив. Дві ортогональні осі:
 *   - `module` (`finyk` / `fizruk` / `routine` / `nutrition`) — identity, тінт.
 *   - `prominence` (`hero` / `soft` / `tinted` / `flat` / `interactive` /
 *     `elevated` / `ghost`) — як гучно карточка читається на сторінці.
 *
 * `radius` (md / lg / xl) обирається явно — module variants більше не пекають
 * `rounded-3xl` мовчки. У dark mode module-branded `-soft*` тонкі переключаються
 * на `-900/-800` family — module identity лишається видимою.
 */
const meta: Meta<typeof Card> = {
  title: "UI / Card",
  component: Card,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof Card>;

const SampleContent = () => (
  <div className="p-4">
    <h3 className="text-base font-semibold">Витрати за тиждень</h3>
    <p className="text-text-muted mt-1 text-sm">
      ₴ 4 320 · 18 транзакцій · Mono + готівка
    </p>
  </div>
);

export const Default: Story = {
  render: () => (
    <Card>
      <SampleContent />
    </Card>
  ),
};

export const Elevated: Story = {
  render: () => (
    <Card prominence="elevated">
      <SampleContent />
    </Card>
  ),
};

export const Interactive: Story = {
  render: () => (
    <Card prominence="interactive">
      <SampleContent />
    </Card>
  ),
};

/** Module hero variants — для dashboard-сторінок кожного модуля. */
export const ModuleHeroes: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card module="finyk" prominence="hero" radius="xl">
        <SampleContent />
      </Card>
      <Card module="fizruk" prominence="hero" radius="xl">
        <SampleContent />
      </Card>
      <Card module="routine" prominence="hero" radius="xl">
        <SampleContent />
      </Card>
      <Card module="nutrition" prominence="hero" radius="xl">
        <SampleContent />
      </Card>
    </div>
  ),
};

/** Module soft surfaces — для sub-cards усередині module-сторінок. */
export const ModuleSoftSurfaces: Story = {
  render: () => (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card module="finyk" prominence="soft">
        <SampleContent />
      </Card>
      <Card module="fizruk" prominence="soft">
        <SampleContent />
      </Card>
      <Card module="routine" prominence="soft">
        <SampleContent />
      </Card>
      <Card module="nutrition" prominence="soft">
        <SampleContent />
      </Card>
    </div>
  ),
};
