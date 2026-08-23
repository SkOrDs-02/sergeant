/**
 * SourceTabs — крок «звідки страва» як смужка вкладок.
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
import { Icon } from "@shared/components/ui/Icon";
import { cn } from "@shared/lib/ui/cn";

export type SourceTabId = "search" | "scan" | "photo" | "manual";

const TABS: ReadonlyArray<{
  id: SourceTabId;
  label: string;
  icon: "search" | "barcode" | "camera" | "edit";
}> = [
  { id: "search", label: "Пошук", icon: "search" },
  { id: "scan", label: "Скан", icon: "barcode" },
  { id: "photo", label: "Фото", icon: "camera" },
  { id: "manual", label: "Своє", icon: "edit" },
];

interface SourceTabsProps {
  active: SourceTabId;
  onChange: (id: SourceTabId) => void;
}

export function SourceTabs({ active, onChange }: SourceTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Звідки страва"
      className="mb-4 grid grid-cols-4 gap-1 rounded-2xl bg-panelHi p-1"
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
            onClick={() => onChange(t.id)}
            className={cn(
              "min-h-[44px] rounded-xl px-2 py-2 flex flex-col items-center justify-center gap-0.5",
              "transition-[background-color,color] focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-nutrition/60",
              isActive
                ? "bg-nutrition-strong text-white"
                : "text-muted hover:text-text",
            )}
          >
            <Icon name={t.icon} size="sm" aria-hidden />
            <span className="text-style-caption font-semibold">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
