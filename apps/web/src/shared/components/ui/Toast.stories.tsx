import type { Meta, StoryObj } from "@storybook/react-vite";
import { useToast } from "@shared/hooks/useToast";
import { Button } from "./Button";
import { ToastContainer } from "./Toast";

/**
 * `Toast` — top-anchored ephemeral повідомлення з чотирма variant-ами
 * (`success` / `error` / `info` / `warning`). Render-shape — `<ToastContainer>`,
 * запускається через `useToast()` API (`success` / `error` / `info` / `warning`
 * + дефолтний `show`). Containers вшито у `apps/web/src/App.tsx`; у Storybook
 * контейнер монтується глобальним decorator-ом у `.storybook/preview.tsx`.
 *
 * Поведінка:
 *   - Stack — 5 toasts max; найстаріший вилітає під час 6-го show.
 *   - Auto-dismiss — `success` / `info` за 3.5 s, `error` / `warning` за 5 s
 *     (можна перевизначити третім аргументом).
 *   - Action — опційна `{ label, onClick }` кнопка справа від тексту.
 *     Після кліку Toast dismiss-иться автоматично.
 *   - Animation — `animate-toast-enter` / `animate-toast-exit` (200 ms exit
 *     transition; window під час якого `leaving=true`).
 *   - A11y — `role="status"` на контейнері, `role="alert"` на кожному toast-і,
 *     закриваюча кнопка з `aria-label="Закрити"` 14 px-icon.
 */
const meta: Meta<typeof ToastContainer> = {
  title: "UI / Toast",
  component: ToastContainer,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
};
export default meta;

type Story = StoryObj<typeof ToastContainer>;

function ShowcaseDemo() {
  const t = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        onClick={() => t.success("Тренування збережено: +180 ккал.")}
      >
        success
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          t.info("Sync v2 завершено — 14 операцій записано у хмару.")
        }
      >
        info
      </Button>
      <Button
        variant="secondary"
        onClick={() =>
          t.warning("Бюджет на «Кафе»: лишилось 18% на 11 днів.", 5000)
        }
      >
        warning
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          t.error("Помилка синхронізації Mono — перевір токен у Settings.")
        }
      >
        error
      </Button>
    </div>
  );
}

/** Чотири variant-и через окремі кнопки — клік ставить toast у стек. */
export const Showcase: Story = {
  render: () => <ShowcaseDemo />,
};

function WithActionDemo() {
  const t = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="primary"
        onClick={() =>
          t.success("Транзакцію додано.", undefined, {
            label: "Скасувати",
            onClick: () => t.info("Скасовано."),
          })
        }
      >
        З action-кнопкою
      </Button>
      <Button
        variant="danger"
        onClick={() =>
          t.error("Не вдалося завантажити рецепт.", undefined, {
            label: "Повторити",
            onClick: () => t.success("Рецепт завантажено."),
          })
        }
      >
        Error + retry action
      </Button>
    </div>
  );
}

/** `action: { label, onClick }` — Toast dismiss-иться після виконання. */
export const WithAction: Story = {
  render: () => <WithActionDemo />,
};

function StackDemo() {
  const t = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() => {
          t.info("Перший toast");
          t.success("Другий toast");
          t.warning("Третій toast");
          t.error("Четвертий toast");
        }}
      >
        Стек із 4
      </Button>
      <Button
        variant="ghost"
        onClick={() => {
          for (let i = 1; i <= 6; i++) {
            t.info(`Toast №${i}`);
          }
        }}
      >
        6 поспіль (cap=5)
      </Button>
    </div>
  );
}

/**
 * Стек обмежений 5 одночасними toast-ами — 6-й виштовхує найстаріший
 * (`prev.slice(-4)` у reducer-і `show`).
 */
export const Stack: Story = {
  render: () => <StackDemo />,
};

function CustomDurationDemo() {
  const t = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="secondary"
        onClick={() => t.info("Швидкий — 1 секунда.", 1000)}
      >
        1s
      </Button>
      <Button
        variant="secondary"
        onClick={() => t.info("Тривалий — 10 секунд.", 10_000)}
      >
        10s
      </Button>
    </div>
  );
}

/** Custom `duration` (3-й аргумент) — для коротких / sticky повідомлень. */
export const CustomDuration: Story = {
  render: () => <CustomDurationDemo />,
};
