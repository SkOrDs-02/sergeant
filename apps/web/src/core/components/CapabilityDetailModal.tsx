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
 * Detail card shown when the user taps ANY capability in the catalogue
 * (не лише `requiresInput=true` — з UX-feedback 2026-05-08 картка стоїть
 * перед обома шляхами). `requiresInput` вирішує, що станеться по кнопці:
 *
 * - `true`  → заготовка лягає в поле вводу, людина дописує і шле сама;
 * - `false` → чат відкривається і надсилає запит ОДРАЗУ.
 *
 * Обидва тексти нижче гілкуються на цьому прапорці. Доти підказка
 * безумовно обіцяла «вставить заготовку у поле вводу, допиши деталі і
 * натисни Enter» — і для 14 із 82 можливостей це була неправда: запит
 * уже пішов (аудит шуму 2026-09-16, WF-22).
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
          <span className="flex items-center gap-2 text-style-caption">
            <Icon
              name={CAPABILITY_MODULE_META[cap.module].icon}
              size="xs"
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
              variant="solid"
              size="md"
              onClick={() => onTryInChat(cap)}
              data-testid={`capability-detail-try-${cap.id}`}
              className="w-full"
            >
              {cap.requiresInput ? "Спробувати в чаті" : "Запустити в чаті"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {cap && (
        <div className="px-5 py-4 space-y-4">
          <p className="text-style-body text-text">{cap.description}</p>

          {cap.risky && (
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/40 rounded-2xl px-3 py-2 text-style-caption text-warning-strong dark:text-warning">
              <Icon name="alert-triangle" size="sm" aria-hidden />
              <span>
                Критична дія. Перевір дані перед відправкою, деякі зміни
                скасувати не можна.
              </span>
            </div>
          )}

          <div>
            <SectionHeading size="xs" className="mb-2">
              Приклади
            </SectionHeading>
            <ul className="space-y-1.5">
              {cap.examples.map((ex, i) => (
                <li
                  key={i}
                  className="text-style-body text-text bg-bg border border-line rounded-xl px-3 py-2"
                >
                  «{ex}»
                </li>
              ))}
            </ul>
          </div>

          {/* AI-NOTE: `text-style-caption` тут навмисно — це підказка ПІД
              контролом («кнопка нижче…»), тобто рівно той випадок, який
              `no-sentence-in-caption` називає легітимним. Підняти до
              `text-style-body` означало б зрівняти вагу підказки з тілом
              модалки над нею. */}
          <p className="text-style-caption text-subtle">
            {cap.requiresInput
              ? "Кнопка нижче відкриє чат і вставить заготовку у поле вводу, допиши деталі і натисни Enter."
              : cap.risky
                ? "Кнопка нижче відкриє чат і одразу надішле запит. Перед самою зміною чат ще раз перепитає."
                : "Кнопка нижче відкриє чат і одразу надішле запит, дописувати нічого не треба."}
          </p>
        </div>
      )}
    </Modal>
  );
}
