import { useState, type ReactNode } from "react";
import { Card } from "@shared/components/ui/Card";
import { Icon, type IconName } from "@shared/components/ui/Icon";
import { SectionHeading } from "@shared/components/ui/SectionHeading";
import { safeReadLS, safeWriteLS } from "@shared/lib/storage/storage";

/**
 * Група всередині секції «Активи»: Картки Monobank, Банки Monobank,
 * «Мені винні», «Інші активи».
 *
 * AI-CONTEXT: до 2026-09-03 групи жили у двох різних оболонках. Картки й
 * банки Monobank — у `CollapsibleSection` (розгорнутий стан — голий
 * eyebrow-заголовок із шевроном на тлі сторінки), «Мені винні» та «Інші
 * активи» — у білій `Card` із власною кнопкою-заголовком. На одному екрані
 * це виглядало як два різні рівні ієрархії, хоча всі чотири — рівноправні
 * групи однієї секції (звіт власника). Тепер оболонка одна; стан
 * розгорнутості — керований, бо батько мусить уміти розгорнути групу
 * примусово (quick-action «+ Актив» відкриває форму всередині групи, і
 * згорнута група ховала б її).
 */
export function AssetsGroupCard({
  title,
  iconName,
  iconClassName,
  open,
  onToggle,
  children,
}: {
  title: string;
  iconName: IconName;
  iconClassName?: string | undefined;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <Card radius="lg" padding="sm" className="space-y-2">
      <button
        type="button"
        className="touch-target flex w-full items-center justify-between pt-2 text-left"
        aria-expanded={open}
        onClick={onToggle}
      >
        <SectionHeading as="span" size="xs" variant="finyk">
          <span className="inline-flex items-center gap-1.5">
            <Icon name={iconName} size={14} className={iconClassName} />
            {title}
          </span>
        </SectionHeading>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      <div hidden={!open} className="space-y-2">
        {children}
      </div>
    </Card>
  );
}

/**
 * Стан розгорнутості групи з памʼяттю в localStorage — для груп Monobank,
 * де людина повертається до того самого списку (та сама логіка, що була в
 * `CollapsibleSection`; ключі збережено, тож вибір користувача не зникає).
 */
export function usePersistedGroupOpen(
  storageKey: string,
  defaultOpen = true,
): [boolean, () => void] {
  const [open, setOpen] = useState<boolean>(
    () => safeReadLS<boolean>(storageKey, defaultOpen) ?? defaultOpen,
  );
  const toggle = () =>
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(storageKey, next);
      return next;
    });
  return [open, toggle];
}
