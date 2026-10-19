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
  type RefObject,
} from "react";
import { useInertWhileCollapsed } from "@shared/hooks/useInertWhileCollapsed";
import { cn } from "../../lib/ui/cn";
import { motionScrollBehavior } from "../../lib/ui/motion";
import { SectionHeading, type SectionHeadingSize } from "./SectionHeading";
import { MorphChevron } from "./MorphChevron";
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
  /**
   * Лічильник або route key запиту «покажи секцію» ззовні. Кожна зміна
   * розгортає секцію так само, як клік (стан пишеться в `storageKey`), і
   * докручує до неї. На монтуванні діє лише з явним `revealOnMount`.
   */
  openSignal?: number | string | undefined;
  /** Явна route-ціль має розкритися й при першому монтуванні. */
  revealOnMount?: boolean;
  /**
   * Що показати після розгортання за `openSignal`: елемент усередині секції
   * (наприклад, рядки звіту), а не її верх. Фокус іде туди ж, тож елемент має
   * бути фокусованим програмно (`tabIndex={-1}`). Без значення — верх секції.
   */
  revealRef?: RefObject<HTMLElement | null>;
  /** Власник app-scroller може обробити зовнішнє розкриття без document-скролу. */
  onReveal?: (target: HTMLElement) => void;
  children?: ReactNode;
  className?: string;
}

/**
 * Section wrapper that collapses/expands its children and persists the
 * state in localStorage. Used on HubDashboard to let users collapse
 * the "Підказки" and "Аналітика" sections to reduce scroll depth.
 *
 * Two visual states:
 * - **Expanded** — section heading and a chevron pointing down.
 * - **Collapsed** — factual hairline row with an optional preview and
 *   a chevron pointing right.
 *
 * Шеврон тут стан, а не декор (v3.1 § Згорнуто / розгорнуто): текст
 * «Розгорнути» / «Згорнути» знято, стан для скрінрідера несе `aria-expanded`.
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
 * - `SettingsGroup` — 14 секцій у трьох вкладках, де кожна секція за
 *   замовчуванням згорнута (forced-first-of-tab скасовано рішенням
 *   власника 2026-09-11; відкриває секцію лише hash-діп-лінк/query-return
 *   або явний клік юзера), а явний вибір людини живе в памʼяті сесії
 *   (`sectionOpenOverrides` у `HubSettingsPage`). Персистити там означало
 *   б воювати з тим самим дефолтом на 14 секціях одразу: збережене
 *   «відкрито» на всіх повернуло б стіну розгорнутих секцій, тобто саме
 *   те, чого й дефолт «згорнуто», і Варіант A до нього, мали уникати.
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
  collapsedSubtitle,
  onOpenChange,
  openSignal,
  revealOnMount = false,
  revealRef,
  onReveal,
  children,
  className,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState<boolean>(
    () =>
      (revealOnMount && openSignal !== undefined) ||
      (safeReadLS<boolean>(storageKey, defaultOpen) ?? defaultOpen),
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

  /**
   * Скрол після того, як рядок сітки доїхав.
   *
   * AI-DANGER: чекати фіксованим таймером НЕ можна — CSS-перехід іде на
   * `duration-base`, тобто на токені, і будь-яка його зміна розсинхронила б
   * пару. Доти тут стояло 210 ms проти коментаря «200ms» проти фактичних
   * 220 ms токена: три різні числа про одну подію. `transitionend` знає
   * точно.
   *
   * Запасний таймер лишається на випадок, коли події не буде зовсім:
   * перехід не запускається, якщо секція вже потрібної висоти або рух
   * вимкнено системно.
   */
  const scrollWhenSettled = useCallback(
    (reveal: () => void) => {
      const grid = gridRef.current;
      if (!grid) {
        reveal();
        return;
      }
      let done = false;
      const once = () => {
        if (done) return;
        done = true;
        grid.removeEventListener("transitionend", once);
        reveal();
      };
      grid.addEventListener("transitionend", once, { once: true });
      // Стеля — помітно більша за `slowest` (680 ms), щоб таймер не
      // випереджав подію на повільному пристрої.
      setTimeout(once, 800);
    },
    [gridRef],
  );

  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      safeWriteLS(storageKey, next);
      if (next) {
        scrollWhenSettled(() =>
          sectionRef.current?.scrollIntoView?.({
            behavior: motionScrollBehavior(),
            block: "nearest",
          }),
        );
      }
      return next;
    });
    // `gridRef` у залежностях, хоч ідентичність ref-а й стабільна: доти він
    // створювався тут же через `useRef`, і ESLint знав це за побудовою. Після
    // виносу L-7 у спільний хук ref приходить із виклику функції, і правило
    // `react-hooks/exhaustive-deps` більше не може довести стабільність.
    // Додати в масив чесніше, ніж глушити правило — на поведінку не впливає.
  }, [storageKey, scrollWhenSettled]);

  // Запит «покажи секцію» ззовні (`openSignal`). Розгортання — під час
  // рендеру, за лічильником (патерн «підтягнути стан із пропа»): `setState`
  // в ефекті дав би зайвий каскадний рендер. Побічні дії (сховище, скрол,
  // фокус) — у ефекті нижче.
  const [seenSignal, setSeenSignal] = useState(openSignal);
  if (openSignal !== seenSignal) {
    setSeenSignal(openSignal);
    if (openSignal !== undefined && !open) setOpen(true);
  }

  // Після розгортання: записати стан як від кліку, дочекатись кінця переходу
  // (або діяти одразу, якщо секція вже була розгорнута), показати й
  // сфокусувати `revealRef`. Фокус — для скрінрідера: без нього «Відкрити» з
  // картки лишало б курсор на кнопці, яка вже нічого не показує.
  const handledSignalRef = useRef(revealOnMount ? undefined : openSignal);
  const wasOpenRef = useRef(open);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (openSignal === undefined) {
      handledSignalRef.current = undefined;
      return;
    }
    if (openSignal === handledSignalRef.current) {
      return;
    }
    handledSignalRef.current = openSignal;
    const reveal = () => {
      const target = revealRef?.current ?? sectionRef.current;
      if (target && onReveal) {
        onReveal(target);
      } else {
        target?.scrollIntoView?.({
          behavior: motionScrollBehavior(),
          block: "nearest",
        });
      }
      if (revealRef?.current) revealRef.current.focus({ preventScroll: true });
    };
    safeWriteLS(storageKey, true);
    if (wasOpen) {
      reveal();
      return;
    }
    scrollWhenSettled(reveal);
  }, [openSignal, open, revealRef, onReveal, storageKey, scrollWhenSettled]);

  return (
    <section ref={sectionRef} className={cn("space-y-2", className)}>
      {open ? (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1.5 w-full text-left touch-target pointer-coarse:py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45 rounded-lg -ml-0.5 pl-0.5"
        >
          <SectionHeading as="span" size={headingSize} className="px-0!">
            {title}
          </SectionHeading>
          <MorphChevron open className="ml-auto text-subtle" />
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex items-center gap-3 w-full text-left",
            "py-3 border-b border-line",
            "hover:bg-panel",
            "transition-colors ",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-focus/45",
          )}
        >
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
          <MorphChevron open={false} className="ml-auto text-subtle" />
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
