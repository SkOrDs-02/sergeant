import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { Modal } from "@shared/components/ui/Modal";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import {
  CAPABILITY_MODULE_META,
  type AssistantCapability,
} from "@sergeant/shared";

interface CapabilityDetailModalProps {
  /** Open when non-null. The closed state is `null`. */
  capability: AssistantCapability | null;
  onClose: () => void;
  onTryInChat: (cap: AssistantCapability) => void;
}

/**
 * Detail card shown when the user taps a `requiresInput=true` capability
 * in the catalogue. Displays examples + a single primary action that
 * prefills the chat input with the capability's prompt.
 */
export function CapabilityDetailModal({
  capability,
  onClose,
  onTryInChat,
}: CapabilityDetailModalProps) {
  const cap = capability;
  return (
    <Modal
      open={cap !== null}
      onClose={onClose}
      title={cap?.label}
      description={
        cap ? (
          <span className="flex items-center gap-2 text-xs">
            <Icon
              name={CAPABILITY_MODULE_META[cap.module].icon}
              size={12}
              aria-hidden
            />
            {CAPABILITY_MODULE_META[cap.module].title}
          </span>
        ) : undefined
      }
      size="md"
      footer={
        cap ? (
          <div className="px-5 py-3 border-t border-line bg-panel/50 rounded-b-3xl">
            <Button
              variant="primary"
              size="md"
              onClick={() => onTryInChat(cap)}
              data-testid={`capability-detail-try-${cap.id}`}
              className="w-full"
            >
              Спробувати в чаті
            </Button>
          </div>
        ) : undefined
      }
    >
      {cap && (
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-text">{cap.description}</p>

          {cap.risky && (
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/40 rounded-2xl px-3 py-2 text-xs text-warning-strong dark:text-warning">
              <Icon name="alert-triangle" size={14} aria-hidden />
              <span>
                Критична дія. Перевір дані перед відправкою — деякі зміни
                скасувати не можна.
              </span>
            </div>
          )}

          <div>
            <SectionHeading size="sm" className="mb-2">
              Приклади
            </SectionHeading>
            <ul className="space-y-1.5">
              {cap.examples.map((ex, i) => (
                <li
                  key={i}
                  className="text-sm text-text bg-bg border border-line rounded-xl px-3 py-2"
                >
                  «{ex}»
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-subtle">
            Кнопка нижче відкриє чат і вставить заготовку у поле вводу — допиши
            деталі і натисни Enter.
          </p>
        </div>
      )}
    </Modal>
  );
}
