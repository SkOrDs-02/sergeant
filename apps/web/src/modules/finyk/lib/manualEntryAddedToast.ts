/**
 * Last validated: 2026-11-19
 * Status: Active
 *
 * Тост «Витрату додано.» / «Надходження додано.» з дією «Скасувати» після
 * нового ручного запису з форми (журнал рішень finyk 2026-11-19). Патерн
 * той самий, що «Страву додано. · Скасувати» в Харчуванні: звичайний
 * `toast.success` з дією `kind: "undo"`, тож запис скасовується і глобальним
 * `Cmd/Ctrl+Z`, поки тост на екрані; після нього дії немає.
 *
 * AI-CONTEXT: скасування йде тим самим шляхом, що й звичайне видалення
 * запису (`storage.removeManualExpense`: слот → діф dual-write → op-log),
 * і знімає теги, які форма поставила разом із записом, щоб у мапі тегів не
 * лишилось сироти. Автовідмітку звички в Рутині (`finyk_expense`) відкат
 * НЕ знімає: чи має він це робити, не вирішено (питання власнику
 * 2026-11-19), а шина відкату події не має (`routineAutoMark.ts`).
 */
import type { ToastApi } from "@shared/hooks/useToast";
import { manualLinkKey } from "@sergeant/finyk-domain/domain/debtLinkKeys";

export interface ManualEntryUndoStorage {
  removeManualExpense: (id: string) => unknown;
  setTxTags: (txId: string, tags: readonly string[]) => void;
}

export interface ManualEntryAdded {
  /** Id, з яким запис ліг у сховище (форма генерує його сама). */
  id: string;
  isIncome: boolean;
  /** Форма поставила теги разом із записом. */
  hasTags: boolean;
}

export const MANUAL_ENTRY_UNDO_LABEL = "Скасувати";

export function showManualEntryAddedToast(
  toast: Pick<ToastApi, "success" | "error">,
  storage: ManualEntryUndoStorage,
  { id, isIncome, hasTags }: ManualEntryAdded,
): number {
  const undo = (): void => {
    try {
      storage.removeManualExpense(id);
      if (hasTags) storage.setTxTags(manualLinkKey(id), []);
    } catch {
      // Видалення не відбулось: запис лишається, людина дізнається про це
      // і може спробувати ще раз, не шукаючи запис у списку.
      toast.error(
        isIncome
          ? "Не вдалось прибрати надходження. Спробуй ще раз."
          : "Не вдалось прибрати витрату. Спробуй ще раз.",
        undefined,
        { label: "Повторити", onClick: undo },
      );
    }
  };
  return toast.success(
    isIncome ? "Надходження додано." : "Витрату додано.",
    undefined,
    { label: MANUAL_ENTRY_UNDO_LABEL, kind: "undo", onClick: undo },
  );
}
