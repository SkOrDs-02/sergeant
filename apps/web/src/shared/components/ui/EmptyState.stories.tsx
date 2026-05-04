import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState } from "./EmptyState";
import { ModuleEmptyIllustration } from "./EmptyStateIllustrations";
import { Icon } from "./Icon";
import { Button } from "./Button";

/**
 * `EmptyState` — універсальний placeholder для секцій без контенту.
 * Унормовує іконку/ілюстрацію, заголовок, опис, CTA та опціональні hint
 * + example-preview. Респектує `prefers-reduced-motion: reduce` (анімації
 * вмикаються тільки під `motion-safe:`).
 *
 * **Коли застосовувати:**
 *
 * - Список без записів (no transactions, no habits).
 * - Модуль ще не налаштований — `module="finyk|fizruk|routine|nutrition"`
 *   тонує іконку та illustration у відповідний accent.
 * - Search-результат пустий — варіант `compact` для inline placement.
 *
 * **API-нюанс:** якщо передати і `icon`, і `illustration` —
 * `illustration` виграє (стекати дві провідні візуалізації виглядає
 * шумно). Використовуй `icon` для compact, `illustration` для full-bleed.
 */
const meta: Meta<typeof EmptyState> = {
  title: "UI / EmptyState",
  component: EmptyState,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    compact: { control: "boolean" },
    disableAnimation: { control: "boolean" },
    module: {
      control: "select",
      options: [undefined, "finyk", "fizruk", "routine", "nutrition"],
    },
  },
  args: {
    title: "Поки що порожньо",
    description: "Додай перший запис, щоб побачити статистику.",
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

/** Default — без іконки/ілюстрації, тільки текст + опис. */
export const Default: Story = {};

/** З іконкою + CTA — типова форма у списках, де користувач не бачить рядків. */
export const WithIconAndAction: Story = {
  args: {
    icon: <Icon name="plus" />,
    title: "Список звичок порожній",
    description: "Додай першу звичку — Sergeant нагадає про неї щодня.",
    action: (
      <Button variant="primary" size="md">
        Створити звичку
      </Button>
    ),
  },
};

/**
 * Module-tinted — illustration і icon підсвічуються під accent-колір
 * відповідного модуля. Використовуй для full-screen empty-станів
 * всередині `/finyk`, `/fizruk`, `/routine`, `/nutrition`.
 */
export const ModuleTinted: Story = {
  args: {
    illustration: <ModuleEmptyIllustration module="finyk" size={120} />,
    title: "Жодної транзакції",
    description: "Підключи Mono або додай витрату вручну, щоб почати облік.",
    action: (
      <Button variant="primary" size="md">
        Підключити Mono
      </Button>
    ),
    module: "finyk",
  },
};

/** Compact — для inline-search-результатів і dropdown-меню. */
export const Compact: Story = {
  args: {
    icon: <Icon name="search" />,
    title: "Нічого не знайдено",
    description: "Спробуй інший запит.",
    compact: true,
  },
};

/**
 * З hint + example-preview — для onboarding-сценаріїв, коли користувач
 * ще не знає, що саме вводити. Hint розташовується під CTA, preview —
 * у dashed-рамці імітує справжній рядок даних.
 */
export const WithHintAndExample: Story = {
  args: {
    icon: <Icon name="lightbulb" />,
    title: "Готовий до першої цілі?",
    description:
      "Додай ціль — і Sergeant порахує крок-за-кроком, як її досягти.",
    hint: "Ціль = сума + дата. Наприклад, «зекономити 50 000 грн до 31.12».",
    examplePreview: (
      <div className="text-sm text-text">
        <span className="font-medium">Резерв на ремонт</span>{" "}
        <span className="text-muted">— 50 000 ₴ до 31.12.2025</span>
      </div>
    ),
    action: (
      <Button variant="primary" size="md">
        Додати ціль
      </Button>
    ),
  },
};
