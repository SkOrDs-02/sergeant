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
import { Switch } from "@shared/components/ui/Switch";
import { SkeletonText } from "@shared/components/ui/Skeleton";
import { useInertWhileCollapsed } from "@shared/hooks/useInertWhileCollapsed";
import { messages } from "@shared/i18n/uk";

/** Module names accepted by SettingsGroup (mirrors CardModule but decoupled). */
type SettingsModule = "finyk" | "fizruk" | "routine" | "nutrition";

export interface SettingsGroupProps {
  title: string;
  /** @deprecated мова H: рядок без іконки. @removeBy 2026-12-01 */
  icon?: string;
  /** @deprecated мова H: рядок без акценту модуля. @removeBy 2026-12-01 */
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
 * `docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md` §0.1):
 * прибрали другий рівень акордеона. Рішенням власника 2026-09-11
 * forced-first-of-tab (перша секція активної вкладки, що відкривалась за
 * замовчуванням) СКАСОВАНО — на холодному завантаженні жодна секція не
 * відкривається автоматично лише через свою позицію в списку.
 *
 * `HubSettingsPage` не рендерить `<SettingsGroup>` напряму (кожна секція
 * рендерить його всередині себе). Контекст — єдиний спосіб сторінці
 * сказати секції, чи відкрити її за замовчуванням, не знаючи наперед, яка
 * секція що рендерить: `HubSettingsPage` обчислює `defaultOpen` для
 * кожної секції з двох сигналів — ціль хеш-діп-лінка/query-return
 * (`hashSectionId`) або явний вибір юзера (`sectionOpenOverrides`), see
 * `HubSettingsPage.tsx`. Дефолт `{ defaultOpen: false }`: без провайдера
 * (наприклад, юніт-тест, що монтує секцію окремо від `HubSettingsPage`)
 * поведінка не міняється.
 *
 * Адверсарне ревʼю 2026-08-08 (дефект №3, лишається чинним і після зняття
 * forced-first): голий `boolean` памʼятав лише "чи форсити відкриття", але
 * не давав секції способу сказати сторінці "юзер сам мене згорнув — не
 * форси мене знову". Без цього перемикання вкладки (яке РЕМАУНТИТЬ
 * секцію — вона зникає з `visible`, коли вкладка неактивна) скидало явний
 * вибір юзера й перевідкривало секцію в дефолтний стан, тоді як пошук (де
 * та сама React-інстанція лишається змонтованою, доки збігається запит)
 * той самий вибір випадково зберігав — одна дія юзера, дві різні
 * поведінки. `onUserToggle` — зворотний виклик, яким секція повідомляє
 * власника контексту про явний (не hash-, не дефолт-, не mount-) клік по
 * заголовку.
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
  // PR-S1 (аудит 2026-09-13 хвиля 5): `contextDefaultOpen` раніше читався
  // ЛИШЕ в ініціалізаторі `useState` вище — коректно на холодному
  // монтуванні (нова вкладка, новий hash при першому рендері), але
  // мовчазно ігнорував ЗМІНУ контексту для секції, яка вже змонтована в
  // активній вкладці. Це давало асиметрію «4 з 14»: `dashboard`/`plan`/
  // `privacy`/`finyk` (єдині з `anchorId`) мали ОКРЕМИЙ слухач
  // `window.hashchange`, що й розкривав їх постфактум; решта 10 секцій
  // такого слухача не мали і не реагували на диплінк із ⌘K/пошуку, коли
  // «Загальні» вже були відкриті (перехід у «Сповіщення» чи «Сержант»
  // скролив до згорнутої шапки). Один ефект на сам контекст працює для
  // всіх 14 однаково — `HubSettingsPage` уже оновлює `defaultOpen` на
  // будь-який діп-лінк (hash, billing-return, silpo-return), синтетичний
  // чи природний `hashchange` тут більше не потрібен.
  //
  // Ефект лише РОЗКРИВАЄ, ніколи не згортає: диплінк в ІНШУ секцію (де
  // `contextDefaultOpen` для цієї секції став `false`) не повинен ховати
  // те, що юзер сам залишив відкритим — той самий односторонній контракт,
  // що мав старий `hashchange`-слухач.
  //
  // `queueMicrotask` — той самий обхід, що вже стоїть у
  // `HubSettingsPage.tsx` для того ж класу ефектів: синхронний `setState`
  // у ТІЛІ ефекту ловить `react-hooks/set-state-in-effect` (React Compiler
  // бачить лише прямі інструкції функції, не вкладені колбеки), а зайвий
  // каскадний рендер тут і справді не потрібен — ефект реагує на щойно
  // застосовану зміну контексту, не на подію, яку не можна відкласти.
  useEffect(() => {
    if (!contextDefaultOpen) return;
    queueMicrotask(() => setOpen(true));
  }, [contextDefaultOpen]);

  const contentRef = useInertWhileCollapsed(open);

  // Мова H (redesign v3, H-settings): секція це рядок на hairline, без
  // картки, тіні, іконки й шеврона; стан розкриття несе `aria-expanded`.
  // Пропи `icon` і `module` лишились для call-site-ів, PR7 їх прибирає.

  return (
    <section className="-mt-px border-y border-line first:mt-0">
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
          className="flex min-h-[52px] w-full items-center text-left focus-ring"
        >
          <span className="text-style-body font-medium text-text">{title}</span>
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
          <div className="space-y-6 pb-5 pt-1">{children}</div>
        </div>
      </div>
    </section>
  );
}

export interface SettingsSubGroupProps {
  title: string;
  children: ReactNode;
}

/**
 * Варіант A (profile/settings deep audit 2026-08-08, рішення власника №4 —
 * `docs/work/specs/audits/2026-08-08-profile-settings-deep-audit.md` §0.1):
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
      {/* Сусідні рядки (`data-row`, див. `ToggleRow`) стоять впритул на
          спільній hairline — проміжок лишається лише між рядком і
          абзацом/кнопкою. */}
      <div className="flex flex-col gap-3 [&>[data-row]+[data-row]]:-mt-3">
        {children}
      </div>
    </div>
  );
}

export interface ToggleRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /**
   * Вимикає САМ контрол, а не малює його вимкненим.
   *
   * Доти цієї пропи не було, і єдиний споживач із заблокованими тумблерами
   * (`ExperimentalSection`) обходився `aria-disabled` на КОНТЕЙНЕРІ плюс
   * `opacity` плюс no-op в `onChange`. Візуально це читалось як
   * заблоковане, а для клавіатури й скрінрідера тумблер лишався звичайним
   * активним switch-ем: його можна сфокусувати, натиснути, почути
   * підтвердження — і нічого не станеться. Знахідка PR-S11.
   *
   * `Switch` вимкнений стан має повний (`disabled` на контролі,
   * `opacity-60`, `cursor-not-allowed`) — бракувало лише шляху до нього.
   */
  disabled?: boolean;
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
  disabled = false,
}: ToggleRowProps) {
  const labelId = useId();
  return (
    <label
      data-row
      className={cn(
        "flex items-center justify-between gap-4 group min-h-[44px]",
        // Курсор і hover теж мусять піти: рядок, який підсвічується під
        // мишею, обіцяє дію, якої не буде.
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        // Рядок списку на hairline, а не картка в картці (огляд 2026-09-04,
        // П2 анти-слоп стратегії: контекст під заголовком — щільний список
        // без карток). Тап лишається на всю ширину рядка.
        "py-3 -mx-2 px-2 rounded-lg border-b border-line/60 last:border-b-0",
        !disabled && "hover:bg-panelHi active:bg-panelHi",
        "transition-[background-color]",
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
          disabled={disabled}
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
   * collapsed (the common case since forced-first-of-tab was retired by
   * owner decision 2026-09-11), or the full expanded-content height for a
   * section whose `defaultOpen` resolves `true` from a hash-deep-link
   * target or a remembered user override (see
   * `SettingsGroupDefaultOpenContext` above). This is no longer "header +
   * collapsed SubGroups" (adversarial review 2026-08-08, дефект №4):
   * Варіант A removed `SettingsSubGroup`'s own collapse state entirely —
   * its content is always visible now — so there's no in-between
   * middle-height state left to match; it's either the closed header or
   * the section's true rendered height.
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
 * Shape mirrors the `<SettingsGroup>` hairline row (title only), so the
 * swap from fallback to
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
    <div
      className="-mt-px flex items-center border-y border-line first:mt-0"
      role="status"
      aria-label={ariaLabel ?? messages.loaders.loadingSection}
      aria-busy="true"
      style={style}
    >
      <SkeletonText shimmer className="w-1/3 max-w-[180px]" />
    </div>
  );
}
