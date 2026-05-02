import { useState } from "react";
import { Button } from "@shared/components/ui";
import { Modal } from "@shared/components/ui/Modal";
import { Sheet } from "@shared/components/ui/Sheet";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { Sec, Group } from "../_shared";

export function OverlaysSection() {
  const [modal, setModal] = useState<"sm" | "md" | "lg" | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  return (
    <Sec id="overlays" title="Overlays">
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
    </Sec>
  );
}
