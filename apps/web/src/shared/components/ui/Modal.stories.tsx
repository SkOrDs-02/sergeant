import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * `Modal` — centered dialog. Counterpart до `Sheet` (bottom-sheet).
 *
 * Використовується для коротких підтверджень, focused повідомлень і
 * квік-промптів на tablet / desktop ширинах. На coarse-pointer
 * пристроях (touch screens) wrapper автоматично делегує до `<Sheet>` —
 * так UX залишається консистентним з іншими bottom-sheet-ами.
 *
 * Авто-вшивує:
 *   - `role="dialog"` + `aria-modal` + `aria-labelledby`
 *   - 44×44 close button (WCAG tap target) через shared `Button` iconOnly
 *   - focus trap + Escape (`useDialogFocusTrap`)
 *   - overlay-click dismiss (відключається через `dismissOnOverlayClick={false}`)
 *   - body scroll lock while open
 *
 * Caller володіє: header content, body, optional footer actions.
 */
const meta: Meta<typeof Modal> = {
  title: "UI / Modal",
  component: Modal,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    size: { control: "select", options: ["sm", "md", "lg", "xl"] },
    hideClose: { control: "boolean" },
    dismissOnOverlayClick: { control: "boolean" },
  },
  args: {
    size: "md",
    title: "Підтвердити дію",
    description: "Це не можна буде відмінити.",
    hideClose: false,
    dismissOnOverlayClick: true,
  },
};
export default meta;

type Story = StoryObj<typeof Modal>;

/**
 * Storybook stories використовують hooks щоб тримати локальний open-стан
 * без зовнішнього controller-у. ESLint-rule `react-hooks/rules-of-hooks`
 * вимагає, щоб виклики hooks жили у компонентах з PascalCase-ім'ям —
 * тому кожен `render` делегує до окремого Demo-компонента, а не
 * викликає `useState` всередині arrow-render-у.
 */
function DefaultDemo({
  size,
  title,
  description,
  hideClose,
  dismissOnOverlayClick,
}: {
  size?: "sm" | "md" | "lg" | "xl";
  title?: string;
  description?: string;
  hideClose?: boolean;
  dismissOnOverlayClick?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <Button variant="primary" onClick={() => setOpen(true)}>
        Відкрити модал
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size={size}
        title={title}
        description={description}
        hideClose={hideClose}
        dismissOnOverlayClick={dismissOnOverlayClick}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
            <Button variant="primary" onClick={() => setOpen(false)}>
              Підтвердити
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          Видалення транзакції «Сільпо — 428.50 ₴» — операція незворотна.
        </p>
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: (args) => (
    <DefaultDemo
      size={args.size}
      title={typeof args.title === "string" ? args.title : undefined}
      description={
        typeof args.description === "string" ? args.description : undefined
      }
      hideClose={args.hideClose}
      dismissOnOverlayClick={args.dismissOnOverlayClick}
    />
  ),
};

function SizesDemo() {
  const [size, setSize] = useState<"sm" | "md" | "lg" | "xl" | null>(null);
  return (
    <div className="flex flex-wrap gap-2 p-4">
      {(["sm", "md", "lg", "xl"] as const).map((s) => (
        <Button key={s} variant="secondary" onClick={() => setSize(s)}>
          {s.toUpperCase()}
        </Button>
      ))}
      <Modal
        open={size !== null}
        onClose={() => setSize(null)}
        size={size ?? "md"}
        title={`Modal size = ${size ?? ""}`}
        description="Ширина обмежена `max-w-{size}`."
      >
        <p className="text-sm">
          Усі чотири preset-и тримають однакові padding-и; різниця лише у
          `max-width` обгортки.
        </p>
      </Modal>
    </div>
  );
}

/** Розміри `sm` / `md` / `lg` / `xl` — для адаптивних карточок. */
export const Sizes: Story = {
  render: () => <SizesDemo />,
};

function ForceConfirmDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <Button variant="danger" onClick={() => setOpen(true)}>
        Видалити акаунт
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Підтвердити видалення"
        description="Усі дані на цьому пристрої буде видалено."
        hideClose
        dismissOnOverlayClick={false}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Скасувати
            </Button>
            <Button variant="danger" onClick={() => setOpen(false)}>
              Так, видалити
            </Button>
          </div>
        }
      >
        <p className="text-sm">
          Ця дія незворотна. Cloud-sync синхронізує видалення на всіх пристроях
          у наступні 60 секунд.
        </p>
      </Modal>
    </div>
  );
}

/**
 * `hideClose` + `dismissOnOverlayClick={false}` — для модалів,
 * які мають бути explicitly підтверджені (e.g. destructive flows
 * без safe-cancel). `Escape` далі працює — це WCAG вимога.
 */
export const ForceConfirm: Story = {
  render: () => <ForceConfirmDemo />,
};

function BodyOnlyDemo() {
  const [open, setOpen] = useState(false);
  return (
    <div className="p-4">
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Body only
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        panelClassName="bg-bg"
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <p className="text-sm">Мінімальний контейнер без chrome.</p>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Закрити
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/** Без header / footer — лише тіло (e.g. Stories controls). */
export const BodyOnly: Story = {
  render: () => <BodyOnlyDemo />,
};
