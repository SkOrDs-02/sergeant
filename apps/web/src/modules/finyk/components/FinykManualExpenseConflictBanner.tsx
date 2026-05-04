import { useCallback } from "react";
import { Button } from "@shared/components/ui/Button";
import { Icon } from "@shared/components/ui/Icon";
import { useFinykManualExpenseConflicts } from "../lib/conflicts/useFinykManualExpenseConflicts";
import { dismissAllFinykManualExpenseConflicts } from "../lib/conflicts/store";

export interface FinykManualExpenseConflictBannerProps {
  /**
   * Optional override for the dismiss-all action. Tests pass a spy
   * to assert click-flow без зачіпання реального module-level стора.
   * Production callers (FinykApp) залишають дефолт — пряме звертання
   * до `dismissAllFinykManualExpenseConflicts`.
   */
  onDismissAll?: () => void;
}

/**
 * Stage 5 PR #044 (`docs/planning/storage-roadmap.md`). Surfaces sync-v2
 * LWW-конфлікти на `finyk_manual_expenses` у вигляді inline-банера на
 * шапці FinykApp.
 *
 * **Що рендериться:** counter «N конфліктів синхронізації» + кнопка
 * «Відхилити всі». Список окремих рядків навмисно НЕ показуємо у MVP —
 * розкриття у деталі вимагало б resolve-UX (keep local vs accept
 * server vs merge), а серверна частина (sync-v2 client) ще не
 * зашита; до того як підключимо real push-loop, банер виконує лише
 * roleсurfacing — повідомити юзера, що пуш не пройшов, щоб він міг
 * вручну ре-синхронізувати (smart pull → re-push) при наступній
 * сесії. Деталізацію + per-row resolve-actions додамо у наступних PR
 * Stage 5 серії.
 *
 * **Чому inline, а не toast:** конфлікт — стійкий стан (висить, поки
 * юзер не вирішить), а toast — ефемерний. Якщо юзер закриє вкладку,
 * conflict-store скине себе у пам'яті, але banner перевідкриється
 * на наступному push-фейлі — це детермінований UX без race-у з
 * toast-черги.
 *
 * **A11y:** `role="status"` + `aria-live="polite"` — сповіщення
 * приходить асинхронно (server response), користувач має бути
 * проінформований через screen reader, але без перебиття активного
 * фокусу (тому polite, не assertive).
 */
export function FinykManualExpenseConflictBanner({
  onDismissAll,
}: FinykManualExpenseConflictBannerProps = {}) {
  const conflicts = useFinykManualExpenseConflicts();

  const handleDismissAll = useCallback(() => {
    if (onDismissAll) {
      onDismissAll();
    } else {
      dismissAllFinykManualExpenseConflicts();
    }
  }, [onDismissAll]);

  if (conflicts.length === 0) return null;

  // Pluralisation. `Intl.PluralRules` для українського «1 / 2-4 / 5+»
  // — «1 конфлікт», «2 конфлікти», «5 конфліктів». Окремий case на
  // 11-14 (few-форма-виняток) хендлиться `Intl.PluralRules` нативно.
  const pluralizer = new Intl.PluralRules("uk-UA");
  const form = pluralizer.select(conflicts.length);
  const noun =
    form === "one" ? "конфлікт" : form === "few" ? "конфлікти" : "конфліктів";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Конфлікти синхронізації витрат"
      className="mx-3 mt-3 mb-1 rounded-2xl border border-warning/30 bg-warning/10 p-4 shadow-card"
      data-testid="finyk-manual-expense-conflict-banner"
    >
      <div className="flex items-start gap-3">
        <span
          className="shrink-0 w-9 h-9 rounded-xl bg-warning/20 text-warning flex items-center justify-center"
          aria-hidden
        >
          <Icon name="alert-triangle" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-style-label text-text">
            {conflicts.length} {noun} синхронізації
          </h3>
          <p className="text-xs text-muted mt-1 leading-snug">
            На іншому пристрої цю витрату вже змінено. Хмарна версія актуальніша
            — потягни вниз, щоб оновити, або відхили попередження, якщо не
            критично.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="flex-1 min-h-[40px]"
          onClick={handleDismissAll}
        >
          Відхилити попередження
        </Button>
      </div>
    </div>
  );
}
