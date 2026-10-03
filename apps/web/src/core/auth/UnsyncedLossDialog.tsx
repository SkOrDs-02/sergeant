/**
 * Last validated: 2026-10-02
 * Status: Active
 *
 * Діалог «є незбережені записи» перед виходом з акаунта (аудит 2026-10-01,
 * `data-19`). Його рендерить `AuthProvider`, а не екран: вихід стирає
 * локальну БД разом із чергою синку з БУДЬ-ЯКОГО місця (Профіль, палітра
 * команд, екран видалення акаунта), тож питання мусить жити в самому
 * `logout()`, а не в тому, хто його викликав.
 *
 * Окремий файл і `React.lazy` в `AuthContext`: провайдер eager, а діалог
 * потрібен раз на кілька місяців — тягнути його в критичний шлях не варто.
 *
 * `@sergeant/shared` (`pluralUa`) імпортує саме цей ліниво завантажуваний
 * файл, а НЕ `AuthContext`: runtime-імпорт зі `@sergeant/shared` у самому
 * `AuthContext` дає білий екран на буті (див. `apps/web/AGENTS.md`).
 */
import { pluralUa, type UaPluralForms } from "@sergeant/shared";
import { ConfirmDialog } from "@shared/components/ui/ConfirmDialog";
import { messages } from "@shared/i18n/uk";

/** «1 запис» / «2 записи» / «5 записів» — не бінарна форма. */
const UNSYNCED_RECORD_FORMS: UaPluralForms = {
  one: "запис",
  few: "записи",
  many: "записів",
};

export interface UnsyncedLossDialogProps {
  /** Скільки записів не доїхало на сервер (pending + dead_letter + rejected). */
  readonly pending: number;
  readonly onResolve: (proceed: boolean) => void;
}

export default function UnsyncedLossDialog({
  pending,
  onResolve,
}: UnsyncedLossDialogProps) {
  const m = messages.unsyncedLoss;
  return (
    <ConfirmDialog
      open
      danger
      title={m.title}
      description={`${pending} ${pluralUa(pending, UNSYNCED_RECORD_FORMS)} ${m.notSavedSuffix} ${m.warning}`}
      confirmLabel={m.confirm}
      cancelLabel={m.cancel}
      onConfirm={() => onResolve(true)}
      onCancel={() => onResolve(false)}
    />
  );
}
