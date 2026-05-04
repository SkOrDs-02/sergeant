import type { Meta, StoryObj } from "@storybook/react-vite";
import { Banner } from "./Banner";

/**
 * `Banner` — info-strip всередині картки чи екрану. Чотири статуси
 * (`info` / `success` / `warning` / `danger`) використовують
 * status-soft tokens (`--c-{status}-soft` + `--c-{status}-strong`) щоб
 * автоматично перемикатись між light / dark і тримати WCAG AA контраст
 * (≥ 4.5:1 на 14 px). Фолбек `dark:text-{palette}-100` — для випадків,
 * коли `-strong` відтінок занадто тьмяний на dark soft surface.
 */
const meta: Meta<typeof Banner> = {
  title: "UI / Banner",
  component: Banner,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warning", "danger"],
    },
  },
  args: {
    variant: "info",
    children: "Дані синхронізовані з усіма пристроями.",
  },
};
export default meta;

type Story = StoryObj<typeof Banner>;

export const Info: Story = {};

export const Success: Story = {
  args: {
    variant: "success",
    children: "Тренування завершено! +180 ккал.",
  },
};

export const Warning: Story = {
  args: {
    variant: "warning",
    children:
      "Бюджет на категорію «Кафе» добігає кінця: лишилось 18% на 11 днів.",
  },
};

export const Danger: Story = {
  args: {
    variant: "danger",
    children: "Помилка синхронізації Mono — перевір токен у налаштуваннях.",
  },
};

/** Усі чотири варіанти поряд — для accessibility / contrast аудитів. */
export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-col gap-3 max-w-md">
      <Banner variant="info">Info — нейтральне повідомлення.</Banner>
      <Banner variant="success">Success — операція успішна.</Banner>
      <Banner variant="warning">
        Warning — попередження, але дія ще можлива.
      </Banner>
      <Banner variant="danger">Danger — потрібна реакція користувача.</Banner>
    </div>
  ),
};
