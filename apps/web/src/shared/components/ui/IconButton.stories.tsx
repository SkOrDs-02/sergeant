import type { Meta, StoryObj } from "@storybook/react-vite";
import { IconButton } from "./IconButton";
import { Icon } from "./Icon";

/**
 * `IconButton` — варіант {@link Button} з обовʼязковим `aria-label` і
 * квадратною геометрією (`iconOnly`). Використовуй замість ручного
 * `<button class="h-9 w-9">…</button>`, щоб зберегти touch-target ≥44×44 на
 * `md+`, focus-ring і a11y-патерни ідентичними рештою додатку.
 *
 * **Коли застосовувати:**
 *
 * - Toolbar / header з іконкою-дією (закрити, поділитись, підказка).
 * - Inline-control у списку (фавайт, kebab-menu).
 * - Dock / FAB — для головного CTA на мобільному екрані.
 *
 * **Коли НЕ застосовувати:** якщо текст обовʼязково має бути видимим —
 * вживай звичайний `<Button>` з `iconOnly={false}`.
 */
const meta: Meta<typeof IconButton> = {
  title: "UI / IconButton",
  component: IconButton,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "subtle", "outline", "danger"],
    },
    size: {
      control: "select",
      options: ["xs", "sm", "md", "lg"],
    },
    loading: { control: "boolean" },
    disabled: { control: "boolean" },
    "aria-label": { control: "text" },
  },
  args: {
    variant: "ghost",
    size: "md",
    "aria-label": "Закрити",
    children: <Icon name="close" />,
    onClick: () => undefined,
  },
};
export default meta;

type Story = StoryObj<typeof IconButton>;

/** Default `ghost` варіант — найчастіший у toolbar / header. */
export const Default: Story = {};

/** Primary — іконка-CTA на яскравому accent-фоні. */
export const Primary: Story = {
  args: {
    variant: "primary",
    "aria-label": "Додати запис",
    children: <Icon name="plus" />,
  },
};

/** Danger — destructive action (видалити, скинути). */
export const Danger: Story = {
  args: {
    variant: "danger",
    "aria-label": "Видалити запис",
    children: <Icon name="trash" />,
  },
};

/**
 * Усі розміри поряд: `xs` (28px) для inline-listrow, `sm`/`md` для
 * toolbar, `lg` для FAB. Висота квадратна, тому icon-glyph центрується
 * автоматично.
 */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      {(["xs", "sm", "md", "lg"] as const).map((size) => (
        <IconButton
          key={size}
          aria-label={`Розмір ${size}`}
          variant="ghost"
          size={size}
        >
          <Icon name="settings" />
        </IconButton>
      ))}
    </div>
  ),
};

/** Loading — внутрішній spinner від `Button`, без зміни ширини. */
export const Loading: Story = {
  args: {
    loading: true,
    "aria-label": "Зберігаю…",
    children: <Icon name="check" />,
  },
};

/** Disabled — `aria-disabled` + reduced opacity, фокус-кільце глушиться. */
export const Disabled: Story = {
  args: {
    disabled: true,
    "aria-label": "Дія недоступна",
    children: <Icon name="lock" />,
  },
};
