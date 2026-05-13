import type { Meta, StoryObj } from "@storybook/react-vite";
import { useToast } from "@shared/hooks/useToast";
import { showUndoToast } from "@shared/lib/ui/undoToast";
import { Button } from "./Button";
import { ToastContainer } from "./Toast";

/**
 * `Toast` — bottom-anchored ephemeral повідомлення з чотирма variant-ами
 * (`success` / `error` / `info` / `warning`). Render-shape — `<ToastContainer>`,
 * запускається через `useToast()` API (`success` / `error` / `info` / `warning`
 * + дефолтний `show`). Containers вшито у `apps/web/src/App.tsx`; у Storybook
 * контейнер монтується глобальним decorator-ом у `.storybook/preview.tsx`.
 *
 * Поведінка:
 *   - Stack — 5 toasts max; найстаріший вилітає під час 6-го show. Spacing
 *     між toast-ами 8 px (gap-2); контейнер позиціонується над bottom-nav
 *     (`--bottom-nav-height`), `ActiveWorkoutBanner`-offset-ом і
 *     `env(safe-area-inset-bottom)` — не overlap-иться навіть на 375 px.
 *   - Auto-dismiss — `success` / `info` за 3.5 s, `error` / `warning` /
 *     undo-toast за 5 s. Pause on hover / focus / touch-drag — стандарт
 *     WAI-ARIA Authoring Practices для toasts.
 *   - Action — опційна `{ label, onClick }` кнопка справа від тексту. Після
 *     кліку Toast dismiss-иться автоматично. Toasts з action отримують
 *     лінійний countdown-bar (CSS animation, не JS-RAF).
 *   - Swipe-to-dismiss — горизонтальний swipe ≥64 px (або flick) дисмісить
 *     toast (touch-only; десктоп має close-кнопку та Esc). Для undo-toast-у
 *     swipe = consume undo-window — snapshot не повертається.
 *   - Animation — `animate-toast-enter` / `animate-toast-exit` (200 ms exit
 *     transition); `prefers-reduced-motion: reduce` робить fade-in миттєвим,
 *     countdown лишається (інформативний, не декоративний).
 *   - A11y — per-toast `role` + `aria-live` (`status`+`polite` для
 *     info/success/warning, `alert`+`assertive` для error та undo-toast).
 *     Esc на focused toast дисмісить; undo-кнопка має `focus-visible:ring`.
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

function SingleDemo() {
  const t = useToast();
  return (
    <Button
      variant="primary"
      onClick={() => t.success("Тренування збережено: +180 ккал.")}
    >
      Single toast (success)
    </Button>
  );
}

/** Один toast — найпростіший випадок; вилітає за 3.5 s, без action. */
export const Single: Story = {
  render: () => <SingleDemo />,
};

function StackOfThreeDemo() {
  const t = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        t.info("Перший toast — info");
        t.success("Другий toast — success");
        t.warning("Третій toast — warning");
      }}
    >
      Stack of 3
    </Button>
  );
}

/**
 * Стек із 3 toast-ів — перевір spacing (8 px gap-2) і що жоден не overlap-иться
 * над bottom-nav / safe-area. Корисно для регресій після зміни позиціонування.
 */
export const StackOfThree: Story = {
  render: () => <StackOfThreeDemo />,
};

function WithUndoDemo() {
  const t = useToast();
  return (
    <Button
      variant="danger"
      onClick={() => {
        showUndoToast(t, {
          msg: "Видалено звичку «Вода»",
          onUndo: () => t.success("Звичку «Вода» повернуто.", 2500),
        });
      }}
    >
      Видалити (undo 5 s)
    </Button>
  );
}

/**
 * `showUndoToast` — info-варіант із 5-секундним вікном + кнопкою «Повернути».
 * Bottom-bar countdown лінійно зменшується з 5 → 0 с; swipe-dismiss або
 * закриття без кліку дропає snapshot (як expired timeout). Pause on hover /
 * focus — таймер і countdown зупиняються синхронно.
 */
export const WithUndo: Story = {
  render: () => <WithUndoDemo />,
};

function ErrorOnlyDemo() {
  const t = useToast();
  return (
    <Button
      variant="danger"
      onClick={() =>
        t.error("Не вдалося синхронізувати тренування — спробуй через хвилину.")
      }
    >
      Тільки error
    </Button>
  );
}

/**
 * Error toast — `role="alert" aria-live="assertive"`, 5-секундний за
 * замовчуванням. Без action (звичайний error), тому countdown-bar не
 * показується — bar резервується для recoverable-flows (Rule #17).
 */
export const ErrorOnly: Story = {
  render: () => <ErrorOnlyDemo />,
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

/**
 * Mobile-viewport variant — рендерить stack-of-3 + undo-toast на iPhone SE
 * (375 px) щоб перевірити, що toast-tray не overlap-иться з safe-area-inset
 * та віртуальним bottom-nav.
 */
export const MobileStack: Story = {
  parameters: {
    viewport: { defaultViewport: "iphonese2" },
  },
  render: () => {
    function MobileStackDemo() {
      const t = useToast();
      return (
        <div className="flex flex-col gap-2 max-w-[20rem]">
          <Button
            variant="secondary"
            onClick={() => {
              t.info("Перший toast — info");
              t.warning("Другий — warning");
              showUndoToast(t, {
                msg: "Видалено категорію «Кафе»",
                onUndo: () => t.success("Категорію повернуто."),
              });
            }}
          >
            Stack of 3 + undo (375 px)
          </Button>
        </div>
      );
    }
    return <MobileStackDemo />;
  },
};
