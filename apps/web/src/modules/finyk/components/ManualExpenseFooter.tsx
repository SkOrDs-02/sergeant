/**
 * Last validated: 2026-09-12
 * Status: Active
 *
 * Футер {@link ManualExpenseSheet}. Винесено окремо, щоб аркуш лишався
 * під Hard Rule #18 (`max-lines: 600`).
 *
 * `Sheet` рендерить футер поза `<form>`, тож кнопки тут не є submit-ами:
 * батько передає вже готові обробники, що звертаються до
 * `useApiForm.submit` (той усе одно проходить zod-валідацію).
 *
 * `onDelete` приходить уже звʼязаним з id — рішення «що саме видаляти» і
 * «чи закривати аркуш» належить батьку, а не футеру. `null` означає, що
 * видалення недоступне: або це створення нового запису, або викликач не
 * дав обробника.
 */
import { Button } from "@shared/components/ui/Button";
import { messages } from "@shared/i18n/uk";

const copy = messages.finyk.manualExpenseSheet;

export interface ManualExpenseFooterProps {
  isEditing: boolean;
  isSubmitting: boolean;
  /**
   * Сховище ще прогрівається (холодний старт): кнопки збереження неактивні, а
   * головна показує спінер. «Скасувати» лишається доступною.
   */
  storageLoading?: boolean;
  /** Підпис кнопки збереження в режимі створення (заголовок аркуша). */
  createLabel: string;
  onCancel: () => void;
  onSubmit: () => void;
  onSubmitKeepOpen: () => void;
  onDelete: (() => void) | null;
}

export function ManualExpenseFooter({
  isEditing,
  isSubmitting,
  storageLoading = false,
  createLabel,
  onCancel,
  onSubmit,
  onSubmitKeepOpen,
  onDelete,
}: ManualExpenseFooterProps) {
  return (
    <div className="space-y-2">
      {/* «Скасувати» природної ширини, головна дія забирає решту й лишається
          в один рядок: на 390 px дві рівні половини переносили «Додати
          надходження» на два рядки (зйомка 2026-11-18). */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="shrink-0"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          {copy.cancel}
        </Button>
        <Button
          className="min-w-0 flex-1 whitespace-nowrap"
          onClick={onSubmit}
          disabled={isSubmitting}
          loading={storageLoading}
          tone="ink"
          variant="solid"
        >
          {isEditing ? copy.save : createLabel}
        </Button>
      </div>
      {/* UX-15 batch entry — лише при створенні: у режимі редагування
          «додати ще» не має предмета. */}
      {!isEditing ? (
        <Button
          variant="ghost"
          className="w-full"
          onClick={onSubmitKeepOpen}
          disabled={isSubmitting || storageLoading}
        >
          {copy.saveAndAddMore}
        </Button>
      ) : null}
      {isEditing && onDelete ? (
        <Button
          variant="soft"
          tone="danger"
          className="w-full"
          onClick={onDelete}
          disabled={isSubmitting}
        >
          {copy.delete}
        </Button>
      ) : null}
    </div>
  );
}
