/**
 * SourceTabs — крок «звідки страва» як список вкладок на hairline.
 *
 * AI-CONTEXT: доти цей крок був вертикальним стосом усіх джерел одразу
 * (шаблони → нещодавні → комора → пошук → штрихкод+фото → два ручні
 * режими). Кожне джерело було видно завжди, тож екран ріс, а вибір
 * читався як «прокрути й знайди своє». Вкладки роблять вибір джерела
 * одним рухом і тримають висоту кроку сталою.
 *
 * Порядок вкладок — за частотою, а не за складністю: більшість прийомів
 * додають пошуком або повтором, тож «Пошук» стоїть першим і є типовою
 * вкладкою. «Своє» останнє — це шлях, коли решта не спрацювала.
 *
 * Status: Active
 * Last validated: 2026-08-22
 */
import { cn } from "@shared/lib/ui/cn";
import { useTablistArrowKeys } from "@shared/hooks/useTablistArrowKeys";

export type SourceTabId = "search" | "scan" | "photo" | "manual";

const TABS: ReadonlyArray<{ id: SourceTabId; label: string }> = [
  { id: "search", label: "Пошук" },
  { id: "scan", label: "Скан" },
  { id: "photo", label: "Фото" },
  { id: "manual", label: "Своє" },
];

interface SourceTabsProps {
  active: SourceTabId;
  onChange: (id: SourceTabId) => void;
}

/**
 * Мова H (редизайн v3, PR4): джерела вводу — не сегмент, а вертикальний
 * список на hairline (сегмент лишається лише для вкладок і фільтрів одного
 * списку). Семантика вкладок не змінилась: кожен рядок — `role="tab"` зі
 * своєю панеллю, а стрілки ходять вгору-вниз (`orientation: 'vertical'`).
 */
export function SourceTabs({ active, onChange }: SourceTabsProps) {
  // `manual`: вкладка «Скан» сама відкриває камеру, тож стрілка лише
  // переносить фокус, а вкладку вибирає Enter/Space (WCAG 3.2.1, ux-16).
  const onTabKeyDown = useTablistArrowKeys(true, "manual", "vertical");
  return (
    <div
      role="tablist"
      aria-label="Джерело страви"
      aria-orientation="vertical"
      className="mb-4 flex flex-col divide-y divide-line border-y border-line"
    >
      {TABS.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`source-tab-${t.id}`}
            aria-selected={isActive}
            aria-controls={`source-panel-${t.id}`}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={onTabKeyDown}
            onClick={() => onChange(t.id)}
            className={cn(
              "flex min-h-[44px] items-center justify-between gap-3 text-left focus-ring",
              isActive ? "text-text" : "text-muted hover:text-text",
            )}
          >
            <span
              className={cn(
                "text-style-body",
                isActive ? "font-semibold" : "font-medium",
              )}
            >
              {t.label}
            </span>
            {isActive && (
              <span aria-hidden="true" className="text-style-label text-text">
                Обрано
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
