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
 * **Tier-и (див. `docs/design/empty-states.md`):**
 *
 * - **Tier 1** — full-screen / hero, з action-CTA, частіше через
 *   `<ModuleEmptyState>`-обгортку (curated per-module копія).
 * - **Tier 2** — `compact`, inline-card-placeholder; action може бути
 *   або відсутній (бо primary-CTA вже видно на тому самому екрані).
 * - **Tier 3** — голий `<p class="text-xs text-muted">`, без цього
 *   компонента.
 *
 * **A11y-контракт:**
 *
 * - Зовнішній контейнер має `role="status"` + `aria-live="polite"` +
 *   `aria-atomic="true"`, тому SR озвучує `title` + `description`
 *   одним повідомленням, коли empty-state з'являється динамічно
 *   (наприклад, після фільтра).
 * - Іконки та ілюстрації стоять у `aria-hidden`-обгортках — SR не
 *   дублює декоративну графіку у live-region-озвучці.
 * - `action`-кнопка фокус НЕ перехоплює на mount; коли користувач
 *   до неї tab-неться, `<Button>` показує власний `focus-visible:ring`
 *   (Hard Rule #14). Для icon-only action-у обов'язково передай
 *   `aria-label`.
 *
 * **API-нюанс:** якщо передати і `icon`, і `illustration` —
 * `illustration` виграє (стекати дві провідні візуалізації виглядає
 * шумно). Використовуй `icon` для compact, `illustration` для full-bleed.
 */
const meta: Meta<typeof EmptyState> = {
  title: "Shared / EmptyState",
  component: EmptyState,
  parameters: {
    layout: "padded",
    chromatic: { viewports: [375, 768, 1280] },
  },
  tags: ["autodocs"],
  argTypes: {
    compact: { control: "boolean" },
    disableAnimation: { control: "boolean" },
    module: {
      control: "select",
      options: [undefined, "finyk", "fizruk", "routine", "nutrition"],
    },
    ariaLive: {
      control: "select",
      options: ["polite", "off"],
    },
  },
  args: {
    title: "Поки що порожньо",
    description: "Додай перший запис, щоб побачити статистику.",
    // Stories ловлять рендер у не-детермінований кадр — вирубаємо анімацію,
    // щоб autodocs-скріншоти не моргали.
    disableAnimation: true,
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

/** Default — без іконки/ілюстрації, тільки текст + опис. */
export const Default: Story = {};

/**
 * **Tier 1 / hero** — з іконкою + CTA. Типова форма у списках, де
 * користувач ще не бачить рядків. Фокус НЕ перехоплюємо на mount;
 * `<Button>` сам забезпечить `focus-visible:ring`, коли користувач
 * tab-неться.
 */
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
 * **Tier 1 / hero (з icon-only action)** — приклад icon-only-CTA. Дивись
 * `aria-label="Додати"` на `<Button>` — без нього SR прочитає live-region
 * без жодного позначення дії.
 */
export const WithIconOnlyAction: Story = {
  args: {
    icon: <Icon name="plus" />,
    title: "Список порожній",
    description: "Натисни плюс, щоб додати перший запис.",
    action: (
      <Button variant="primary" size="md" iconOnly aria-label="Додати">
        <Icon name="plus" size={18} />
      </Button>
    ),
  },
};

/**
 * **Tier 2 / compact, з action** — компактна форма у вузькому контексті
 * (sub-card, dropdown), коли action-кнопка все ж потрібна. `<Button size="sm">`
 * автоматично тримає `min-h-[44px] min-w-[44px]` на coarse-pointer — touch-target
 * лишається тапабельним навіть у compact-режимі.
 */
export const Compact: Story = {
  args: {
    icon: <Icon name="search" />,
    title: "Нічого не знайдено",
    description: "Спробуй інший запит.",
    compact: true,
    action: (
      <Button variant="secondary" size="sm">
        Очистити фільтр
      </Button>
    ),
  },
};

/**
 * **Tier 2 / compact, без action** — empty-state суто описовий, бо
 * primary-CTA уже видно на тому самому екрані (див. anti-pattern у
 * `docs/design/empty-states.md` — не дублюємо кнопку).
 */
export const CompactNoAction: Story = {
  args: {
    icon: <Icon name="dumbbell" />,
    title: "Поки немає шаблонів",
    description: "Створи свій перший — кнопка вище.",
    compact: true,
    module: "fizruk",
  },
};

/**
 * **Module accent — Finyk.** Illustration + accent-тонована іконка.
 * Використовуй для full-screen empty-станів у `/finyk`.
 */
export const ModuleFinyk: Story = {
  args: {
    illustration: <ModuleEmptyIllustration module="finyk" size={120} />,
    title: "Жодної транзакції",
    description: "Підключи Mono або додай витрату вручну, щоб почати облік.",
    action: (
      <Button variant="finyk" size="md">
        Підключити Mono
      </Button>
    ),
    module: "finyk",
  },
};

/**
 * **Module accent — Fizruk.** Illustration-варіант для `/fizruk` (тренування).
 */
export const ModuleFizruk: Story = {
  args: {
    illustration: <ModuleEmptyIllustration module="fizruk" size={120} />,
    title: "Час тренуватись",
    description: "Запиши перше тренування або обери готову програму.",
    action: (
      <Button variant="fizruk" size="md">
        Почати тренування
      </Button>
    ),
    module: "fizruk",
  },
};

/**
 * **Module accent — Routine.** Illustration-варіант для `/routine` (звички).
 */
export const ModuleRoutine: Story = {
  args: {
    illustration: <ModuleEmptyIllustration module="routine" size={120} />,
    title: "Створи першу звичку",
    description: "Маленькі кроки щодня ведуть до великих змін.",
    action: (
      <Button variant="routine" size="md">
        Створити звичку
      </Button>
    ),
    module: "routine",
  },
};

/**
 * **Module accent — Nutrition.** Illustration-варіант для `/nutrition`
 * (харчовий щоденник).
 */
export const ModuleNutrition: Story = {
  args: {
    illustration: <ModuleEmptyIllustration module="nutrition" size={120} />,
    title: "Залогай перший прийом їжі",
    description: "Відстежуй що їси і отримай персональні поради.",
    action: (
      <Button variant="nutrition" size="md">
        Додати їжу
      </Button>
    ),
    module: "nutrition",
  },
};

/**
 * **З hint + example-preview** — onboarding-сценарій, коли користувач
 * ще не знає, що саме вводити. Hint живе під CTA, example-preview —
 * у dashed-рамці імітує справжній рядок даних. Hint навмисно НЕ
 * дублює description (див. `docs/design/empty-states.md`) — це
 * корисна побіжна нотатка, а не повтор «тут зараз порожньо».
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
