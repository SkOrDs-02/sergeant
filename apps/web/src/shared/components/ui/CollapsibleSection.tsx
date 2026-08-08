/**
 * Last validated: 2026-05-14
 * Status: Active
 */
import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
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
  // Вузол сітки — з нього приходить `transitionend`.
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // L-7: секція ховає вміст візуально через `grid-rows-[0fr] overflow-hidden`
  // (нижче), але DOM-підтерево лишалось змонтованим і фокусованим — Tab від
  // заголовка провалювався у приховані поля пароля/сесій і кнопку
  // «Видалити акаунт», де Enter наосліп відкривав діалог видалення.
  // `inert`, а не `hidden`: `hidden` = display:none і ламає grid-template-rows
  // анімацію (не можна анімувати висоту елемента, якого немає в layout-і).
  // `inert` лишає вміст видимим/анімованим, але прибирає підтерево з
  // tab-порядку й дерева доступності — саме туди, куди й треба.
  //
  // `aria-hidden` поряд з `inert` — той самий канонічний парний патерн, що й
  // `useDialogFocusTrap.ts` (background-inert manager): рушії старіші за
  // Safari 15.5 / Firefox 112 не знають `inert` узагалі, і без `aria-hidden`
  // скрінрідер на них і далі озвучував би згорнутий вміст.
  //
  // `useLayoutEffect`, а не `useEffect` чи очікування `transitionend`:
  // атрибут має зникнути СИНХРОННО з рендером, що вмикає розкриття, до
  // першого пейнту — інакше анімація вже стартувала видимо, а перше
  // натискання Tab одразу після кліку ще провалюється у ще-inert підтерево
  // (кадр із видимим, але не focus-able вмістом).
  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    if (open) {
      el.removeAttribute("inert");
      el.removeAttribute("aria-hidden");
    } else {
      el.setAttribute("inert", "");
      el.setAttribute("aria-hidden", "true");
    }
  }, [open]);

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
  }, [storageKey]);

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
                "bg-brand-500/10 text-brand-strong dark:text-brand",
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
