/**
 * Last validated: 2026-09-11
 * Status: Active
 *
 * Одна стрічка джерел для «Додати продукти» (рішення власника 2026-09-11):
 * раніше шапка `PantryCard` мала окрему кнопку-штрихкод, окремий
 * двосегментний перемикач «По одному / Списком» і, ще вище на сторінці,
 * окрему кнопку «З покупок Сільпо» (`SilpoPantryReplenishEntry`) — три
 * різні контроли для «звідки взяти позицію». Тут той самий модел, що вже
 * стоїть у кроці «звідки страва» аркуша прийому їжі
 * (`meal-sheet/SourceTabs.tsx`): повноширинна стрічка іконка+підпис під
 * заголовком картки. Компонент місцевий, а не імпорт `SourceTabs`, бо той
 * типізований під `SourceTabId` кроку логування їжі («Пошук/Скан/Фото/
 * Своє») — інша множина джерел і інша семантика вкладки.
 *
 * Сегменти — не всі одного типу. «По одному» й «Списком» — справжні режими
 * (перемикають форму нижче в `PantryCard`, тримають активний стан). «Скан»
 * і «З чека» — миттєві дії: перший відкриває сканер, другий — шторку
 * поповнення з чека Сільпо, і жоден не змінює активний режим форми. Тому
 * стрічка — не `role="tablist"`: ARIA-таби обіцяють, що клік перемикає
 * видиму панель і лишає «вибраним» той таб, який востаннє відкрили, а тут
 * половина кнопок так не працює. `role="group"` чесніший.
 *
 * «Скан» рендериться лише коли передано `onScanBarcode` (той самий гейт,
 * що був у старій кнопці); «З чека» — лише коли Сільпо звʼязано
 * (`useSilpoSyncState`, той самий гейт, що був у `SilpoPantryReplenishEntry`,
 * яку цей компонент замінює й забирає з дерева). Тому колонок у сітці або
 * дві, або три, або чотири — Tailwind-класи нижче перелічені явно
 * (`grid-cols-2/3/4`), бо динамічний рядок класу JIT не підхопить.
 *
 * Чому не третій сегмент у старому перемикачі, а окрема стрічка: на 393px
 * чотири підписані сегменти в рядок уже на межі — розтягувати колишній
 * компактний перемикач до чотирьох при тому, що там ще й окрема
 * кнопка-іконка штрихкоду, розірвало б рядок або обрізало підписи.
 * Full-width стрічка під заголовком дає кожному сегменту рівну частку
 * ширини незалежно від довжини підпису.
 */
import { useState } from "react";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { messages } from "@shared/i18n/uk";
import { cn } from "@shared/lib/ui/cn";
import { useSilpoSyncState } from "@finyk/hooks/useSilpoSyncState";
import { SilpoPantryReplenishSheet } from "./SilpoPantryReplenishSheet";
import type { PantryItem } from "../lib/pantryTextParser";

export type PantryInputMode = "single" | "list";

interface Segment {
  key: string;
  icon: IconName;
  label: string;
  /** Повний accessible-name, коли він ширший за короткий видимий підпис. */
  ariaLabel?: string;
  /**
   * `undefined` — «Скан»/«З чека»: миттєві дії без стану, `aria-pressed`
   * на них увів би в оману (кнопка ніколи не «натиснута», вона просто
   * щось відкриває). Boolean — лише для «По одному»/«Списком».
   */
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function SegmentButton({ seg }: { seg: Segment }) {
  return (
    <button
      type="button"
      onClick={seg.onClick}
      disabled={seg.disabled}
      aria-label={seg.ariaLabel}
      aria-pressed={seg.active}
      className={cn(
        "min-h-[44px] rounded-xl px-1.5 py-2 flex flex-col items-center justify-center gap-0.5",
        "transition-colors disabled:opacity-50 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-nutrition/60",
        seg.active
          ? "bg-nutrition-strong text-white"
          : "text-subtle hover:text-text",
      )}
    >
      <Icon name={seg.icon} size="sm" aria-hidden />
      <span className="text-style-caption font-semibold truncate max-w-full">
        {seg.label}
      </span>
    </button>
  );
}

export interface PantrySourceTabsProps {
  mode: PantryInputMode;
  onModeChange: (mode: PantryInputMode) => void;
  onScanBarcode?: (() => void) | undefined;
  /** Позиції комори — лише для дедупу превʼю в шторці «З чека». */
  pantryItems: readonly Pick<PantryItem, "name">[];
  upsertItem: (items: PantryItem[]) => void;
  busy: boolean;
}

export function PantrySourceTabs({
  mode,
  onModeChange,
  onScanBarcode,
  pantryItems,
  upsertItem,
  busy,
}: PantrySourceTabsProps) {
  const { status } = useSilpoSyncState();
  const silpoConnected = status === "connected";
  const [receiptSheetOpen, setReceiptSheetOpen] = useState(false);

  const segments: Segment[] = [
    {
      key: "single",
      icon: "edit",
      label: "По одному",
      active: mode === "single",
      onClick: () => onModeChange("single"),
    },
    {
      key: "list",
      icon: "list",
      label: "Списком",
      active: mode === "list",
      onClick: () => onModeChange("list"),
    },
  ];
  if (typeof onScanBarcode === "function") {
    segments.push({
      key: "scan",
      icon: "scanner",
      label: "Скан",
      ariaLabel: "Сканувати штрих-код",
      disabled: busy,
      onClick: onScanBarcode,
    });
  }
  if (silpoConnected) {
    segments.push({
      key: "receipt",
      icon: "shopping-cart",
      label: "З чека",
      // Короткий видимий підпис («З чека») влазить у сітку на 393px;
      // повна фраза лишається доступним іменем — той самий текст, який
      // уже шукають смоук-тести і мобільний аудит (`entryCta`).
      ariaLabel: messages.nutrition.pantryReplenish.entryCta,
      disabled: busy,
      onClick: () => setReceiptSheetOpen(true),
    });
  }

  const columnsClass =
    segments.length === 4
      ? "grid-cols-4"
      : segments.length === 3
        ? "grid-cols-3"
        : "grid-cols-2";

  return (
    <>
      <div
        role="group"
        aria-label={messages.nutrition.pantryCard.sourceStripLabel}
        className={cn(
          "grid gap-1 rounded-2xl bg-panelHi border border-line p-1 mb-3",
          columnsClass,
        )}
      >
        {segments.map((seg) => (
          <SegmentButton key={seg.key} seg={seg} />
        ))}
      </div>
      {silpoConnected && (
        <SilpoPantryReplenishSheet
          open={receiptSheetOpen}
          onClose={() => setReceiptSheetOpen(false)}
          pantryItems={pantryItems}
          upsertItem={upsertItem}
          busy={busy}
        />
      )}
    </>
  );
}
