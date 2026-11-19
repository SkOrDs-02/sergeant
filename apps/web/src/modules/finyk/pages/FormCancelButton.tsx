import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n";

/** «Скасувати» в рядку кнопок форм «Активів» (поруч із «Додати»). */
export function CancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <Button variant="outline" size="sm" className="flex-1" onClick={onCancel}>
      {messages.actions.cancel}
    </Button>
  );
}
