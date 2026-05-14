import { useState } from "react";
import { Button } from "@shared/components/ui";
import { Modal } from "@shared/components/ui/Modal";
import { Sheet } from "@shared/components/ui/Sheet";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import {
  CodeBlock,
  DoDont,
  Group,
  RuleBadges,
  Sec,
} from "../_shared/primitives";

const SAMPLE_USAGE = `// Modal portals to document.body to escape transformed ancestors (PR #2227)
<Modal open={open} onClose={close} size="md" title="…">
  <p className="text-sm text-muted">…</p>
</Modal>

// ConfirmDialog — destructive irreversible action
<ConfirmDialog
  open={confirmOpen}
  title="Видалити запис?"
  description="Цю дію неможливо скасувати."
  confirmLabel="Видалити"
  onConfirm={remove}
  onCancel={close}
/>`;

export function OverlaysSection() {
  const [modal, setModal] = useState<"sm" | "md" | "lg" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <Sec
      id="overlays"
      title="Overlays"
      intro={
        <>
          Modal / Sheet / ConfirmDialog портують у <code>document.body</code>{" "}
          (PR #2227) — щоб не страждати від transformed-ancestor контейнерів.
          Контракт фокусу: focus-trap + Esc + click-outside-to-dismiss.
        </>
      }
    >
      <Group label="Modal — розміри" row>
        {(["sm", "md", "lg"] as const).map((size) => (
          <Button
            key={size}
            variant="secondary"
            size="sm"
            onClick={() => setModal(size)}
          >
            Modal {size}
          </Button>
        ))}
      </Group>

      <Group label="Sheet та ConfirmDialog" row>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setSheetOpen(true)}
        >
          Відкрити Sheet
        </Button>
        <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
          ConfirmDialog
        </Button>
      </Group>

      <Modal
        open={modal !== null}
        onClose={() => setModal(null)}
        size={modal ?? "md"}
        title="Приклад Modal"
        description="Демонстраційний modal зі штатними підкомпонентами дизайн-системи."
        footer={
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setModal(null)}>
              Скасувати
            </Button>
            <Button size="sm" onClick={() => setModal(null)}>
              Підтвердити
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted leading-relaxed">
          Тіло модального вікна. Може містити форми, списки або будь-який вміст.
          Розмір:{" "}
          <span className="font-mono font-semibold text-text">{modal}</span>.
        </p>
      </Modal>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Приклад Sheet"
        description="Bottom sheet — основний паттерн для мобільних форм і детальних панелей."
        footer={
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant="ghost"
              onClick={() => setSheetOpen(false)}
            >
              Скасувати
            </Button>
            <Button className="flex-1" onClick={() => setSheetOpen(false)}>
              Зберегти
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted leading-relaxed py-4">
          Вміст аркуша. Прокручується, якщо контент не вміщується у viewport.
          Фокус-пастка та Escape закривають аркуш автоматично.
        </p>
      </Sheet>

      <ConfirmDialog
        open={confirmOpen}
        title="Видалити запис?"
        description="Цю дію неможливо скасувати. Запис буде видалено назавжди."
        confirmLabel="Видалити"
        cancelLabel="Скасувати"
        onConfirm={() => setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
      />

      <Group label="Приклад використання">
        <CodeBlock>{SAMPLE_USAGE}</CodeBlock>
      </Group>

      <Group label="Do / Don't">
        <DoDont
          rows={[
            {
              label: "Mount",
              good: <code>&lt;Modal /&gt; (portals to body)</code>,
              bad: <code>&lt;div&gt; inline у subtree з transform</code>,
            },
            {
              label: "Confirm destructive",
              good: <code>&lt;ConfirmDialog /&gt;</code>,
              bad: <code>window.confirm()</code>,
            },
            {
              label: "Close action",
              good: <code>Esc + click-outside + Cancel button</code>,
              bad: <code>лише X в кутку</code>,
            },
          ]}
        />
      </Group>

      <RuleBadges
        hardRules={[
          { label: "HR #14", hint: "focus-visible only" },
          { label: "HR #17", hint: "Motion budget — fade-in" },
        ]}
        lintRules={[
          { label: "prefer-focus-visible" },
          { label: "prefer-data-state" },
        ]}
      />
    </Sec>
  );
}
