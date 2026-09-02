/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useInertWhileCollapsed } from "@shared/hooks/useInertWhileCollapsed";
import { cn } from "../../lib/ui/cn";
import { motionScrollBehavior } from "../../lib/ui/motion";
import { Icon } from "./Icon";
import { MorphChevron } from "./MorphChevron";
import { SectionHeading, type SectionHeadingSize } from "./SectionHeading";
import { safeReadLS, safeWriteLS } from "../../lib/storage/storage";

export interface CollapsibleSectionProps {
  /** Unique key for persisting collapse state in localStorage. */
  storageKey: string;
  /** Section heading text. */
  title: ReactNode;
  /** Default state when no localStorage value exists. */
  defaultOpen?: boolean;
  /** SectionHeading size — defaults to "xs". */
  headingSize?: SectionHeadingSize;
  /**
   * Icon name (from the shared `Icon` set) rendered on the left of the
   * collapsed "pill" state. When omitted, the collapsed state renders
   * title-only — useful for sections without an obvious glyph.
   */
  collapsedIcon?: string;
  /**
   * Short preview / summary line shown inside the collapsed pill, below
   * the title. Typical content: a live count, freshness timestamp,
   * or a one-line CTA ("AI-порада оновлена", "3 інсайти").
   */
  collapsedSubtitle?: ReactNode;
  /**
   * Викликається з поточним станом розгорнутості — на монтуванні (значення з
   * localStorage / `defaultOpen`) і після кожного перемикання.
   *
   * Навіщо. Секція тримає дітей у DOM навіть згорнутою
   * (`grid-rows-[0fr] overflow-hidden`), тож «змонтовано» ≠ «видно». Дітям,
   * які емітять impression-телеметрію (`AssistantAdviceCard`,
   * `WeeklyDigestCard`), потрібен реальний стан видимості — інакше показ
   * зарахується для згорнутої секції і знаменник роздується.
   *
   * Передавай СТАБІЛЬНИЙ колбек (наприклад setter із `useState`): інлайн-
   * лямбда змінює identity щорендеру і ефект перевикликатиметься дарма.
   */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Section wrapper that collapses/expands its children and persists the
 * state in localStorage. Used on HubDashboard to let users collapse
 * the "Підказки" and "Аналітика" sections to reduce scroll depth.
 *
 * Two visual states:
 * - **Expanded** — minimal eyebrow heading + rotating chevron, so the
 *   section's own content dominates the viewport.
 * - **Collapsed** — full-width "pill" card (panel bg + border, icon,
 *   regular-case title, optional `collapsedSubtitle` preview, right
 *   chevron). Makes the collapsed row read as a purposeful, tappable
 *   entry point instead of a stray eyebrow with nothing under it.
 *
 * Collapse animation uses CSS `grid-template-rows` for smooth height
 * transitions (no JavaScript measurement needed).
 *
 * **Чому в репо ДВА дисклоужери, і чому це не борг.** §6 аудиту Профілю і
 * Налаштувань (2026-08-08) записав «два collapsible-примітиви з різною
 * поведінкою: Профіль памʼятає відкрите, Налаштування — ні» як борг. Після
 * рішення власника про Варіант A (§0.1 того ж аудиту) різниця стала
 * НАСЛІДКОМ цього рішення, а не недоглядом:
 *
 * - Тут — 6 стабільних секцій, кожна зі своїм `storageKey`. Людина
 *   повертається до тієї самої секції, тож памʼятати її стан корисно.
 * - `SettingsGroup` — 14 секцій у трьох вкладках, де Варіант A відкриває
 *   ПЕРШУ секцію активної вкладки, а явний вибір людини живе в памʼяті
 *   сесії (`sectionOpenOverrides` у `HubSettingsPage`). Персистити там
 *   означало б воювати з власним дефолтом: збережене «закрито» знищило б
 *   авто-відкриття, збережене «відкрито» на всіх 14 повернуло б стіну
 *   розгорнутих секцій, заради усунення якої Варіант A і обирався.
 *
 * Спільне між ними — інваріант доступності L-7, і він винесений у
 * `useInertWhileCollapsed`. Саме там була справжня вада: не «компонентів
 * два», а «гарантія tab-порядку написана двічі й могла розійтись».
 */
export function CollapsibleSection({
  storageKey,
  title,
  defaultOpen = true,
  headingSize = "xs",
  collapsedIcon,
  collapsedSubtitle,
  onOpenChange,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(
    () => safeReadLS<boolean>(storageKey, defaultOpen) ?? defaultOpen,
  );
  const sectionRef = useRef<HTMLElement>(null);
  // Вузол сітки. Несе дві ролі одночасно: з нього приходить `transitionend`
  // (див. `toggle` нижче) і на ньому ж L-7 ставить `inert`/`aria-hidden`.
  //
  // Логіка L-7 живе у СПІЛЬНОМУ хуку `useInertWhileCollapsed`
  // (`@shared/hooks`) — той самий, що використовує `SettingsGroup`
  // (`core/settings/SettingsPrimitives.tsx`). Доти кожен із двох
  // дисклоужерів репо ніс власну копію тієї самої логіки: розходження
  // копій не впало б жодним тестом і не було б видно на екрані — одна з
  // поверхонь просто тихо втратила б гарантію tab-порядку. Чому саме
  // `inert` + `aria-hidden` + `useLayoutEffect` — у докстрінгу хука.
  const gridRef = useInertWhileCollapsed(open);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(storageKey, next);
      if (next) {
        /*
          Скрол після того, як рядок сітки доїхав.

          AI-DANGER: чекати фіксованим таймером НЕ можна — CSS-перехід
          іде на `duration-base`, тобто на токені, і будь-яка його
          зміна розсинхронила б пару. Доти тут стояло 210 ms проти
          коментаря «200ms» проти фактичних 220 ms токена: три різні
          числа про одну подію. `transitionend` знає точно.

          Запасний таймер лишається на випадок, коли події не буде
          зовсім: перехід не запускається, якщо секція вже потрібної
          висоти або рух вимкнено системно.
        */
        const grid = gridRef.current;
        const scroll = () =>
          sectionRef.current?.scrollIntoView({
            behavior: motionScrollBehavior(),
            block: "nearest",
          });
        if (!grid) {
          scroll();
          return next;
        }
        let done = false;
        const once = () => {
          if (done) return;
          done = true;
          grid.removeEventListener("transitionend", once);
          scroll();
        };
        grid.addEventListener("transitionend", once, { once: true });
        // Стеля — помітно більша за `slowest` (680 ms), щоб таймер не
        // випереджав подію на повільному пристрої.
        setTimeout(once, 800);
      }
      return next;
    });
    // `gridRef` у залежностях, хоч ідентичність ref-а й стабільна: доти він
    // створювався тут же через `useRef`, і ESLint знав це за побудовою. Після
    // виносу L-7 у спільний хук ref приходить із виклику функції, і правило
    // `react-hooks/exhaustive-deps` більше не може довести стабільність.
    // Додати в масив чесніше, ніж глушити правило — на поведінку не впливає.
  }, [storageKey, gridRef]);

  return (
    <section ref={sectionRef} className={cn("space-y-2", className)}>
      {open ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 w-full text-left touch-target pointer-coarse:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60 rounded-xl -ml-0.5 pl-0.5"
        >
          <MorphChevron
            open
            size={12}
            strokeWidth={2.5}
            className="text-subtle"
          />
          <SectionHeading as="span" size={headingSize} className="px-0!">
            {title}
          </SectionHeading>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-3 w-full text-left",
            "px-3.5 py-3 rounded-2xl",
            "bg-panel hover:bg-panelHi border border-line shadow-soft",
            "transition-colors active:scale-[0.99]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/60",
          )}
        >
          {collapsedIcon && (
            <span
              className={cn(
                "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center",
                "bg-brand-500/10 text-brand-strong",
              )}
              aria-hidden
            >
              <Icon name={collapsedIcon} size={18} strokeWidth={2} />
            </span>
          )}
          <span className="flex-1 min-w-0">
            <span className="text-style-label block text-text leading-tight">
              {title}
            </span>
            {collapsedSubtitle && (
              <span className="block text-style-caption text-muted mt-0.5 truncate">
                {collapsedSubtitle}
              </span>
            )}
          </span>
          <MorphChevron
            open={false}
            size={16}
            strokeWidth={2}
            className="text-subtle"
          />
        </button>
      )}

      {/* CSS grid row transition for smooth collapse */}
      <div
        ref={gridRef}
        className={cn(
          "grid transition-[grid-template-rows] duration-base ease-standard",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="space-y-2">{children}</div>
        </div>
      </div>
    </section>
  );
}
