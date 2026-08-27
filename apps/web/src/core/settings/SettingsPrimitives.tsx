import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@shared/lib/ui/cn";
import { Icon } from "@shared/components/ui/Icon";
import { Card } from "@shared/components/ui/Card";
import { Switch } from "@shared/components/ui/Switch";
import { Skeleton, SkeletonText } from "@shared/components/ui/Skeleton";
import { useInertWhileCollapsed } from "@shared/hooks/useInertWhileCollapsed";
import { messages } from "@shared/i18n/uk";

interface ChevronIconProps {
  expanded: boolean;
}

function ChevronIcon({ expanded }: ChevronIconProps) {
  return (
    <Icon
      name="chevron-right"
      size={16}
      className={cn(
        "transition-transform duration-base shrink-0",
        expanded && "rotate-90",
      )}
    />
  );
}

/** Module names accepted by SettingsGroup (mirrors CardModule but decoupled). */
type SettingsModule = "finyk" | "fizruk" | "routine" | "nutrition";

/** Scoped bg-class for the icon badge — avoids global accent-rgb emission.
 *  Each module has a registered `-soft` / `-soft-border` pair in the design
 *  token contract.
 *
 *  Раніше тут стояло «Hard Rule #12» — правило retired
 *  [ADR-0081](../../../../../docs/04-governance/adr/0081-repository-simplification.md):
 *  module-accent containment лишається чинною конвенцією, але тримається
 *  design tokens і ревʼю, а не ESLint-гейтом. Посилання на неіснуючий номер
 *  правила прибрано (§6 боргу, аудит Профілю/Налаштувань 2026-08-08) — саме
 *  той клас коментаря, що пережив свій механізм. */
const MODULE_ICON_BG: Record<SettingsModule, string> = {
  finyk: "bg-finyk-soft border-finyk-soft-border text-finyk",
  fizruk: "bg-fizruk-soft border-fizruk-soft-border text-fizruk",
  routine: "bg-routine-soft border-routine-soft-border text-routine",
  nutrition: "bg-nutrition-soft border-nutrition-soft-border text-nutrition",
};

export interface SettingsGroupProps {
  title: string;
  /** Optional design-system icon shown in the section badge. */
  icon?: string;
  /** Module accent for the icon badge. Requires `icon` to be set. */
  module?: SettingsModule;
  children: ReactNode;
  defaultOpen?: boolean;
  /**
   * Optional id for hash-aware auto-open. When the URL hash matches
   * `#<anchorId>` (mounted or via `hashchange`), the group expands so
   * a deep-link from elsewhere (наприклад тап на неактивну Bento-картку,
   * що веде на `#settings-dashboard`) одразу показує користувачу
   * вкладений контент, а не просто згорнутий заголовок під sticky-хедером.
   */
  anchorId?: string;
}

function matchesHash(anchorId: string | undefined): boolean {
  if (!anchorId) return false;
  if (typeof window === "undefined") return false;
  return window.location.hash === `#${anchorId}`;
}

/**
 * Варіант A (profile/settings deep audit 2026-08-08, рішення власника №4 —
 * `docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md` §0.1):
 * прибрали другий рівень акордеона, і замість нього перша секція активної
 * вкладки Налаштувань відкривається за замовчуванням — це закриває
 * порожнечу внизу стартового екрана без вкладеного акордеона.
 *
 * `HubSettingsPage` не рендерить `<SettingsGroup>` напряму (кожна секція
 * рендерить його всередині себе), і лише 3 з 14 секцій мають `anchorId`,
 * тож привʼязатись до хеша не можна. Контекст — єдиний спосіб сторінці
 * сказати "ти перша видима секція" секції, не знаючи наперед, яка секція
 * що рендерить. Дефолт `{ defaultOpen: false }`: без провайдера (наприклад,
 * юніт-тест, що монтує секцію окремо від `HubSettingsPage`) поведінка не
 * міняється.
 *
 * Адверсарне ревʼю 2026-08-08 (дефект №3): голий `boolean` памʼятав лише
 * "чи форсити відкриття", але не давав секції способу сказати сторінці
 * "юзер сам мене згорнув — не форси мене знову". Без цього перемикання
 * вкладки (яке РЕМАУНТИТЬ секцію — вона зникає з `visible`, коли вкладка
 * неактивна) скидало явний вибір юзера й перевідкривало форсовано-відкриту
 * секцію, тоді як пошук (де та сама React-інстанція лишається змонтованою,
 * доки збігається запит) той самий вибір випадково зберігав — одна дія
 * юзера, дві різні поведінки. `onUserToggle` — зворотний виклик, яким
 * секція повідомляє власника контексту про явний (не hash-, не дефолт-,
 * не mount-) клік по заголовку.
 */
export interface SettingsGroupDefaultOpenState {
  /** Чи секція відкривається за замовчуванням при монтуванні. */
  defaultOpen: boolean;
  /**
   * Викликається з новим станом `open` щоразу, коли юзер сам тапає
   * заголовок — НЕ при авто-розкритті через дефолт чи hash-deep-link.
   */
  onUserToggle?: (open: boolean) => void;
}

const DEFAULT_SETTINGS_GROUP_CONTEXT: SettingsGroupDefaultOpenState = {
  defaultOpen: false,
};

export const SettingsGroupDefaultOpenContext =
  createContext<SettingsGroupDefaultOpenState>(DEFAULT_SETTINGS_GROUP_CONTEXT);

/**
 * L-7 parity fix (adversarial review 2026-08-08): `CollapsibleSection`
 * (`@shared/components/ui`) closes the tab-trap for its accordion by
 * marking the collapsed content `inert`, but `SettingsGroup` shared the
 * exact same `grid-rows-[0fr] overflow-hidden` collapse pattern (as did
 * `SettingsSubGroup`, before Варіант A removed its accordion entirely —
 * see the comment above `SettingsSubGroup` below) and was left unfixed —
 * Tab from a collapsed header (e.g. "Дашборд") still fell into ~15 hidden
 * interactive controls (toggles, density buttons, module checkboxes), and
 * Space on a hidden checkbox silently flipped a module on/off. Defaults to
 * `defaultOpen={false}`, so this is the common first-paint state, not an
 * edge case.
 *
 * `aria-expanded={false}` on the trigger alone made this WORSE, not
 * better: it explicitly told assistive tech "collapsed" while the content
 * stayed live in the tab order and a11y tree — a lie by omission that
 * plain silence didn't have.
 *
 * Механізм — `useInertWhileCollapsed` (`@shared/hooks`), СПІЛЬНИЙ із
 * `CollapsibleSection.tsx`. Доти обидва компоненти несли власну копію тієї
 * самої логіки; розходження копій не впало б жодним тестом і не було б
 * видно на екрані — одна з поверхонь просто тихо втратила б гарантію
 * tab-порядку. Чому саме `inert` + `aria-hidden` + `useLayoutEffect` —
 * розписано в докстрінгу хука.
 */
export function SettingsGroup({
  title,
  icon,
  module,
  children,
  defaultOpen = false,
  anchorId,
}: SettingsGroupProps) {
  const { defaultOpen: contextDefaultOpen, onUserToggle } = useContext(
    SettingsGroupDefaultOpenContext,
  );
  const [open, setOpen] = useState<boolean>(
    () => defaultOpen || contextDefaultOpen || matchesHash(anchorId),
  );
  useEffect(() => {
    if (!anchorId) return;
    const onHashChange = () => {
      if (matchesHash(anchorId)) setOpen(true);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [anchorId]);

  // Scoped module bg class — uses registered token pair, never raw RGB
  // (конвенція module-accent containment, ex-Hard Rule #12, retired
  // ADR-0081 — див. коментар над `MODULE_ICON_BG`). Guard with ?. so
  // noUncheckedIndexedAccess is satisfied.
  const moduleBg = module != null ? (MODULE_ICON_BG[module] ?? "") : "";
  const contentRef = useInertWhileCollapsed(open);

  return (
    <Card
      prominence="glass"
      radius="lg"
      padding="none"
      // `shadow-e1` drop-shadow: the glass surface's own `shadow-card-v2`
      // is an inset top-highlight only (no drop shadow), so near-white
      // (0.82α) section cards floated flat on the warm light-theme page
      // and read as borderless (user report 2026-06-22). A real elevation
      // lifts them off the background; on dark surfaces the shadow is
      // naturally imperceptible and the glass hairline carries separation.
      className="overflow-hidden shadow-e1"
    >
      {/* Дефект №5 (адверсарне ревʼю 2026-08-08): найближчий заголовок вище
          — sr-only `<h1>Налаштування</h1>` на рівні сторінки; сама секція
          малювала заголовок як `<span>` усередині кнопки, тобто не
          заголовок узагалі, тож аутлайн стрибав h1 → h3 (заголовок
          `SettingsSubGroup` нижче) — axe `heading-order` це ловить.
          Канонічний disclosure-патерн — `<h2><button aria-expanded>…
          </button></h2>`. `className="contents"` (display:contents) не
          додає власного боксу в layout, тож кнопка лишається прямим
          flex-дитям `<Card>` візуально й запити `getByRole("button", {
          name })` не бачать різниці — але дерево заголовків стає
          коректним h1 → h2 → h3.

          Ризик, який тут треба знати: історично `display: contents`
          ВИКИДАВ елемент із дерева доступності (Chrome/Firefox/Safari,
          ~2018-2022) — тобто рівно той механізм, який мовчки звів би цей
          фікс нанівець. У сучасних рушіях це полагоджено, і перевіряє це
          не припущення, а гейт: `heading-order` тепер входить у фільтр
          `tests/a11y/axe.spec.ts` і ганяється в справжньому Chromium
          (CI-джоб «Accessibility (axe-core)»). Якщо колись візьмемо
          рушій, де баг живий, той гейт почервоніє — і тоді заміна проста:
          віддати `<h2>` реальний бокс і зняти flex-обгортку з кнопки. */}
      <h2 className="contents">
        <button
          type="button"
          onClick={() => {
            // CodeRabbit-ревʼю PR #757: апдейтер `setOpen` мусить лишатись
            // ЧИСТИМ — React 18 (незалежно від dev/prod) інколи обчислює
            // updater-функцію "eager" одразу в обробнику dispatch-у (щоб
            // перевірити, чи справді змінюється стан), а потім ЩЕ РАЗ під
            // час самого рендеру — побічний ефект (`onUserToggle`)
            // усередині апдейтера стріляв би більше одного разу на клік.
            // Рахуємо `next` з поточного `open` ПОЗА апдейтером,
            // викликаємо `setOpen`, і лише ПІСЛЯ цього — `onUserToggle`,
            // рівно один раз.
            const next = !open;
            setOpen(next);
            // Явний клік юзера — не mount, не hash, не Варіант A
            // дефолт. Повідомляємо нагору (дефект №3), щоб власник
            // контексту (зазвичай `HubSettingsPage`) міг запамʼятати
            // цей вибір per-section-id і не форсити дефолт знову після
            // ремаунту (перемикання вкладки чи search).
            onUserToggle?.(next);
          }}
          aria-expanded={open}
          className={cn(
            "w-full px-4 py-4 flex items-center justify-between gap-3",
            "hover:bg-surface-strong-glass active:bg-surface-soft-glass transition-colors",
            open && "bg-surface-soft-glass",
          )}
        >
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span
                className={cn(
                  "rounded-xl p-1.5 border flex items-center justify-center shrink-0",
                  moduleBg ||
                    "bg-surface-soft-glass border-surface-line text-muted-v2",
                )}
              >
                <Icon name={icon} size={18} />
              </span>
            )}
            <span className="text-style-title text-text">{title}</span>
          </div>
          <ChevronIcon expanded={open} />
        </button>
      </h2>
      <div
        ref={contentRef}
        className={cn(
          "grid transition-[grid-template-rows] duration-base ease-standard",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line/60 px-4 py-5 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </Card>
  );
}

export interface SettingsSubGroupProps {
  title: string;
  children: ReactNode;
}

/**
 * Варіант A (profile/settings deep audit 2026-08-08, рішення власника №4 —
 * `docs/90-work/audits/2026-08-08-profile-settings-deep-audit.md` §0.1):
 * підрозділ більше не другий рівень акордеона. Раніше тут стояв власний
 * `<button>` з `aria-expanded`, шевроном зліва (на відміну від
 * `SettingsGroup` вище, де шеврон справа) і власною рамкою-коробкою — два
 * різні патерни розкриття на шляху до одного тумблера (V-12 audit finding:
 * підблок малювався пʼятьма різними рецептами по кодовій базі). Тепер це
 * підписана група: заголовок-лейбл (`<h3>`) + завжди видимий вміст — без
 * кнопки, стану, `aria-expanded`, `inert` чи власної рамки. Підрозділ
 * візуально відділяється лейблом, а не вкладеною панеллю.
 */
export function SettingsSubGroup({ title, children }: SettingsSubGroupProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-style-overline text-text">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/**
 * Рядок «підпис ліворуч — тумблер праворуч» у Налаштуваннях.
 *
 * Візуал (tappable-картка з бордером і hover-станом) — PR-37 ux-roast
 * 2026-Q3 §3.1: доти рядок читався як звичайний текст на тлі секції і
 * тумблери губились. Обгортка лишається `label` саме заради цього —
 * тапається весь рядок, а не лише підпис чи трек.
 *
 * **Чому імʼя тумблера задається через `aria-labelledby`, а не структурою.**
 * У цьому рядку два конкуруючі варіанти фіксу зійшлись у мерджі: гілка
 * PR #762 розводила вкладеність (обгортка → `div`, підпис → `label htmlFor`),
 * `main` (PR #760) лишив обгортку `label` і додав явний `aria-labelledby`.
 * Взято варіант `main` — він змерджений, зелений у CI і зберігає тап по
 * всьому рядку; підхід PR #762 звужував тап-зону до підпису й треку.
 *
 * Ціна вибору названа чесно: вкладений `label` лишається невалідним за
 * контент-моделлю HTML («no descendant label elements»). Саме ця
 * невалідність і була КОРЕНЕМ падіння axe — Chrome на такій розмітці не
 * виводив інпуту доступного імені взагалі. `aria-labelledby` знімає
 * симптом (імʼя тепер явне), але не саму вкладеність, тож структурне
 * прибирання лишається відкритим боргом.
 */
export function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: ToggleRowProps) {
  const labelId = useId();
  return (
    <label
      className={cn(
        "flex items-center justify-between gap-4 cursor-pointer group min-h-[44px]",
        "p-3 rounded-2xl border border-line/60 bg-surface-soft-glass shadow-soft",
        "hover:border-brand/40 hover:bg-surface-strong-glass active:bg-surface-soft-glass",
        "transition-[background-color,border-color]",
      )}
    >
      <div className="flex-1 min-w-0">
        <span
          id={labelId}
          className="text-style-label text-text group-hover:text-brand-strong transition-colors"
        >
          {label}
        </span>
        {description && (
          // `text-muted`, не `text-subtle`: опис тумблера пояснює, ЩО саме
          // вмикаєш, — тобто це не декоративний текст, і читабельним він
          // мусить бути. Спершу це був ще й обхід контрасту (темний subtle
          // #5f6b64 давав 3.22 при потрібних 4.5); 2026-08-21 тир піднято до
          // #8a968e (5.84) і обхід більше не потрібен — аргумент про роль
          // тексту лишається.
          //
          // Обидві гілки мерджу зійшлись тут на одному й тому ж висновку
          // незалежно одна від одної.
          <p className="text-style-caption text-muted mt-1 leading-relaxed">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">
        <Switch
          checked={checked}
          onChange={onChange}
          aria-labelledby={labelId}
        />
      </div>
    </label>
  );
}

// `ConfirmModal` видалено (V-8, аудит Профілю/Налаштувань 2026-08-08).
// Це була ДРУГА оболонка підтвердження на тих самих двох сторінках, з
// власним затемненням (`bg-black/60 backdrop-blur-md` проти `bg-black/40`
// у канонічному `ConfirmDialog`) і — головне — БЕЗ `createPortal`: вона
// малювалась у потоці батька, тож усередині glass-картки Налаштувань її
// обрізало (той самий симптом, що вже описаний у `OnboardingWizard.tsx`).
// На момент видалення продуктових споживачів не лишилось жодного —
// останній (`PrivacySection`) переїхав на `ConfirmDialog` хвилею 2. Мертвий
// код із відомим дефектом небезпечніший за відсутній: наступний, хто
// шукатиме «модалку в цьому файлі», знайде саме його.
// Канонічна оболонка одна — `@shared/components/ui/ConfirmDialog`.
export interface SectionSkeletonProps {
  /**
   * Minimum height in pixels. Matches the real section's footprint AS IT
   * FIRST PAINTS — the closed-header height for a section that mounts
   * collapsed, or the full expanded-content height for a section that
   * Варіант A force-opens by default because it's the first section of
   * the active Налаштування tab (see `SettingsGroupDefaultOpenContext`
   * above). This is no longer "header + collapsed SubGroups" (adversarial
   * review 2026-08-08, дефект №4): Варіант A removed `SettingsSubGroup`'s
   * own collapse state entirely — its content is always visible now — so
   * there's no in-between middle-height state left to match; it's either
   * the closed header or the section's true rendered height.
   *
   * Per-section values are owned by the caller — each `<Suspense>`
   * boundary in `HubSettingsPage` passes the height it knows for its
   * section. A default of 72 px matches the closed-header shape of
   * `<SettingsGroup>` (icon badge + title row + chrome padding).
   */
  minH?: number;
  /**
   * Aria label for the placeholder card. Visible-text-only screen
   * readers see this in place of the real section title until the lazy
   * chunk resolves. Defaults to a generic "loading section" string.
   */
  ariaLabel?: string;
}

/**
 * Stable height-placeholder for a `<Suspense>`-deferred `<SettingsGroup>`
 * (Initiative 0017 Sprint 1.1 — per-section lazy in HubSettingsPage).
 *
 * Shape mirrors the expanded-state `<SettingsGroup>` chrome —
 * icon badge slot + title bar + chevron — so the swap from fallback to
 * real section is visually a no-op for the user. Shimmer (not pulse)
 * matches the "premium loading" feel chosen by the design tokens, and
 * collapses to a static block under `prefers-reduced-motion: reduce`
 * (handled inside `Skeleton`).
 *
 * Always `aria-hidden`-effective: the placeholder is decorative; the
 * meaningful announcement is the section's real heading once it loads.
 * `ariaLabel` is exposed only for the rare case where the placeholder
 * remains on screen long enough for screen readers to focus it — the
 * fallback is then announced as "loading <ariaLabel>" rather than
 * leaking the skeleton chrome.
 */
export function SectionSkeleton({
  minH = 72,
  ariaLabel,
}: SectionSkeletonProps) {
  const style: CSSProperties = { minHeight: `${minH}px` };
  return (
    <Card
      prominence="glass"
      radius="lg"
      padding="none"
      className="overflow-hidden"
      role="status"
      aria-label={ariaLabel ?? messages.loaders.loadingSection}
      aria-busy="true"
      style={style}
    >
      <div className="w-full px-4 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Skeleton shimmer className="w-9 h-9 rounded-xl shrink-0" />
          <SkeletonText shimmer className="w-1/3 max-w-[180px]" />
        </div>
        <Skeleton shimmer className="w-4 h-4 rounded-sm shrink-0" />
      </div>
    </Card>
  );
}
