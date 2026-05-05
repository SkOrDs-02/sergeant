import type { Meta, StoryObj } from "@storybook/react-vite";
import { AssistantAdviceCard } from "./AssistantAdviceCard";

/**
 * `AssistantAdviceCard` — hero-картка з порадою AI-асистента на дашборді.
 * Stories покривають loaded / loading / error states + collapsed-варіант
 * (керується через `localStorage`, тут просто render-only). Initiative
 * 0007 Phase 3, module-level story для модуля Insights / HubChat.
 */
const meta: Meta<typeof AssistantAdviceCard> = {
  title: "Insights / AssistantAdviceCard",
  component: AssistantAdviceCard,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  args: {
    insight:
      "Сьогодні ти сплатив на 18% більше, ніж у середньому за останній тиждень. Перевір категорії «Розваги» і «Доставка» — 70% перевитрат там.",
    loading: false,
    error: null,
    onRefresh: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof AssistantAdviceCard>;

/** Звичайний loaded-стан із порадою. */
export const Default: Story = {};

/** Loading — пораду ще генерує асистент, кешу немає. */
export const Loading: Story = {
  args: {
    insight: null,
    loading: true,
  },
};

/** Refresh — є попередня порада, але йде запит на нову. */
export const Refreshing: Story = {
  args: {
    loading: true,
  },
};

/** Довга порада — перевіряє вертикальну ритміку та line-height. */
export const Verbose: Story = {
  args: {
    insight:
      "Ти три тижні поспіль витрачаєш на каву понад 25 % від «Розваги». Подумай, чи варто перевести цю категорію в окремий бюджет із власним ліміом, або заведи окрему ціль на «домашню каву» — це звільнить ~1200 грн/міс на ціль «Поїздка восени».",
  },
};
