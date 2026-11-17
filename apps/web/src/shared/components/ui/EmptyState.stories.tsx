import type { Meta, StoryObj } from "@storybook/react-vite";
import { EmptyState, ModuleEmptyState } from "./EmptyState";
import { Icon } from "./Icon";
import { Button } from "./Button";

/**
 * `EmptyState` — універсальний placeholder для секцій без контенту.
 * Унормовує заголовок, доступний опис і CTA. `<ModuleEmptyState>` додає
 * компактну статичну ілюстрацію та показує опис як наступний крок.
 *
 * **Tier-и (див. `docs/design/design/empty-states.md`):**
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
 *   одним повідомленням, коли empty-state зʼявляється динамічно
 *   (наприклад, після фільтра).
 * - Ілюстрації стоять у `aria-hidden`-обгортках, тому SR не
 *   дублює декоративну графіку у live-region-озвучці.
 * - `action`-кнопка фокус НЕ перехоплює на mount; коли користувач
 *   до неї tab-неться, `<Button>` показує власний `focus-visible:ring`
 *   (Hard Rule #14). Для icon-only action-у обовʼязково передай
 *   `aria-label`.
 *
 * Звичайний `<EmptyState>` лишається стриманим для фільтрів і підсекцій.
 * Модульну ілюстрацію не збирають вручну: для цього є обгортка.
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
    ariaLive: {
      control: "select",
      options: ["polite", "off"],
    },
  },
  args: {
    title: "Поки що порожньо",
    description: "Додай перший запис, щоб побачити статистику.",
  },
};
export default meta;

type Story = StoryObj<typeof EmptyState>;

/** Default: лише видимий факт; опис залишається доступним скрінрідеру. */
export const Default: Story = {};

/**
 * **Tier 1 / hero** з CTA. Типова форма у списках, де
 * користувач ще не бачить рядків. Фокус НЕ перехоплюємо на mount;
 * `<Button>` сам забезпечить `focus-visible:ring`, коли користувач
 * tab-неться.
 */
export const WithIconAndAction: Story = {
  args: {
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
    title: "Нічого не знайшов",
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
 * **Empty-state як ціла сторінка** — коли `EmptyState` є єдиним вмістом
 * маршруту (404, повноекранна помилка), він мусить нести заголовок
 * сторінки: інакше маршрут їде взагалі без `h1`. Для цього — `titleAs`.
 *
 * За замовчуванням `title` рендериться як `<p>`, бо у вкладеному випадку
 * заголовок уже належить сторінці, і зайвий `h1`/`h2` зламав би аутлайн.
 */
export const AsPageHeading: Story = {
  args: {
    size: "lg",
    eyebrow: "404",
    title: "Сторінку не знайдено",
    titleAs: "h1",
    description:
      "Здається, ця адреса вже не існує. Перевір посилання або повернись на головну.",
    primaryAction: (
      <Button variant="primary" size="lg">
        На головну
      </Button>
    ),
  },
};

/**
 * **Tier 2 / compact, без action** — empty-state суто описовий, бо
 * primary-CTA уже видно на тому самому екрані (див. anti-pattern у
 * `docs/design/design/empty-states.md` — не дублюємо кнопку).
 */
export const CompactNoAction: Story = {
  args: {
    title: "Поки немає шаблонів",
    description: "Створи свій перший, кнопка вище.",
    compact: true,
  },
};

/**
 * **Module accent — Finyk.** Illustration + accent-тонована іконка.
 * Використовуй для full-screen empty-станів у `/finyk`.
 */
export const ModuleFinyk: Story = {
  render: () => (
    <ModuleEmptyState
      module="finyk"
      title="Операцій ще немає"
      description="Додай витрату вручну або підключи Monobank."
    />
  ),
};

/**
 * **Module accent — Fizruk.** Illustration-варіант для `/fizruk` (тренування).
 */
export const ModuleFizruk: Story = {
  render: () => (
    <ModuleEmptyState
      module="fizruk"
      variant="compact"
      description="Завершених тренувань ще немає."
      onAction={() => undefined}
      actionLabel="Почати тренування"
    />
  ),
};

/**
 * **Module accent — Routine.** Illustration-варіант для `/routine` (звички).
 */
export const ModuleRoutine: Story = {
  render: () => (
    <ModuleEmptyState
      module="routine"
      description="Створи одну звичку, щоб почати серію."
      onAction={() => undefined}
      actionLabel="Створити звичку"
    />
  ),
};

/**
 * **Module accent — Nutrition.** Illustration-варіант для `/nutrition`
 * (харчовий щоденник).
 */
export const ModuleNutrition: Story = {
  render: () => (
    <ModuleEmptyState
      module="nutrition"
      variant="compact"
      title="Поки немає записів"
      description="Додай перший прийом їжі. Калорії та КБЖВ порахуються тут."
    />
  ),
};

/**
 * **З hint + example-preview** — onboarding-сценарій, коли користувач
 * ще не знає, що саме вводити. Hint живе під CTA, example-preview —
 * у dashed-рамці імітує справжній рядок даних. Hint навмисно НЕ
 * дублює description (див. `docs/design/design/empty-states.md`) — це
 * корисна побіжна нотатка, а не повтор «тут зараз порожньо».
 */
export const WithHintAndExample: Story = {
  args: {
    title: "Готовий до першої цілі?",
    description:
      "Додай ціль: і Sergeant порахує крок-за-кроком, як її досягти.",
    hint: "Ціль = сума + дата. Наприклад, «зекономити 50 000 грн до 31.12».",
    action: (
      <Button variant="primary" size="md">
        Додати ціль
      </Button>
    ),
  },
};
