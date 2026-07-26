// Showcase section — "Proposals · UX". Each idea is shown as a
// «Зараз → Може бути» pair so the current behaviour is visible alongside the
// proposal:
//   UX-6  per-record offline-write feedback
//   UX-15 batch quick-entry (keep-open toggle)
//   UX-7  manifest launch_handler: focus-existing (concept diagram)
//   UX-17 clipboard-paste → suggested action
//
// UX-16 (semantic haptic gradations) was dropped from this set — it is
// already implemented (hapticSuccess/Warning/Error/tap + celebration
// patterns wired across the app), so there is nothing to prototype.
//
// Prototypes only — no wiring to real domain state. Theme follows the
// showcase header toggle (Light / Dark).
import { Sec } from "../_shared/primitives";
import { ProposalCompareCard } from "./proposals/_Compare";
import { OfflineFeedbackDemo } from "./proposals/OfflineFeedbackDemo";
import { BatchEntryDemo } from "./proposals/BatchEntryDemo";
import { LaunchHandlerDemo } from "./proposals/LaunchHandlerDemo";
import { ClipboardActionDemo } from "./proposals/ClipboardActionDemo";

export function ProposalsUXSection() {
  return (
    <Sec
      id="proposals-ux"
      title="Proposals · UX (зараз → може бути)"
      intro="Мокапи UX-ідей у форматі порівняння: ліворуч — як поводиться застосунок зараз, праворуч — пропозиція. Прототипи без привʼязки до реальних даних; тему перемикай у шапці."
    >
      <div className="flex flex-col gap-6">
        <ProposalCompareCard
          id="UX-6"
          title="Офлайн-фідбек на рівні запису"
          intent="Зараз лише глобальний банер «немає мережі». Пропозиція: кожен запис показує власний стан — збережено локально / в черзі / синхронізовано."
        >
          <OfflineFeedbackDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="UX-15"
          title="Пакетне швидке додавання"
          intent="Зараз шторка закривається після кожного збереження. Пропозиція: перемикач «залишити відкритим» + лічильник «Додано N», щоб вносити записи підряд."
        >
          <BatchEntryDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="UX-7"
          title="launch_handler: focus-existing"
          intent="Один рядок у манифесті. Зараз shortcut може відкрити другий інстанс PWA. Пропозиція: фокусувати вже відкрите вікно замість дубля."
        >
          <LaunchHandlerDemo />
        </ProposalCompareCard>

        <ProposalCompareCard
          id="UX-17"
          title="Вставка з буфера → дія"
          intent="Зараз форма завжди порожня. Пропозиція: якщо в буфері число чи посилання — показати чип «Вставити 250 як витрату?» для створення в один тап."
        >
          <ClipboardActionDemo />
        </ProposalCompareCard>
      </div>
    </Sec>
  );
}
