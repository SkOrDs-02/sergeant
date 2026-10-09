#!/usr/bin/env node
// scripts/check-ui-canon-ratchet.mjs
//
// Храповик канонічного UI-API в `apps/web/src`.
//
// ЩО МІРЯЄ І ЧОМУ САМЕ ТАК. Одинадцять метрик, усі — «скільки місць вживає
// НЕканонічний спосіб зробити те, що має канонічний»:
//
//   1. `legacyButton`  — легасі-варіанти `<Button>` (`primary`, `secondary`,
//      `danger`, `finyk-soft`, …) і застарілий проп `module=`. Канон —
//      `(variant, tone)`, де `variant` ∈ solid|soft|outline|ghost.
//   2. `handRolledFocusRing` — рукописний `focus-visible:ring-2` там, де є
//      готова утиліта `.focus-ring`.
//   3. `offCanonRingOpacity` — `ring-focus` із непрозорістю, відмінною від
//      канонічної (і без суфікса теж: це 1.0, а не дефолт). CSS виключено —
//      там ВИЗНАЧЕННЯ утиліт, а не call-site-и.
//   4. `numericIconSize` — `<Icon size={N}>`, де N збігається з токеном шкали.
//      Позашкальні числа легальні: числовий API лишається для one-off.
//   5. `cyrillicJsxAllowlist` — записи в `apps/web/eslint.i18n-allowlist.json`,
//      тобто файли, яким дозволено кирилицю в JSX-літералах повз каталог
//      `@shared/i18n`. Міряється не скан джерел, а сам список: правило
//      `no-cyrillic-jsx-literal` стоїть у `warn`, і єдиний спосіб не
//      червоніти — дописати файл сюди. Так список ріс 239 → 300 за літо.
//   6. `heroInkAlpha` — `text-hero-ink/NN`, альфа на ТЕКСТОВОМУ чорнилі
//      hero-картки. З 2026-10-01 baseline = 0 і це ЗАБОРОНА, а не стеля:
//      рішення власника по аудиту контрасту (A9) — «чорнило без альфи»,
//      ієрархію тримають кегль і вага. Декор (`bg-`/`border-`/`stroke-
//      hero-ink/NN`) метрика не чіпає.
//
//   7. `hoverMotion` — `hover:scale-*`, `active:scale-*`, `hover:-translate-y-*`,
//      `hover:shadow-glow*` (з будь-яким префіксом-варіантом: `group-hover:`,
//      `md:hover:` тощо). Рух на hover/press не входить у канон.
//   8. `enterMotion` — вхідна анімація: класи `animate-stagger-in`, `page-enter`
//      і JSX-використання `<StaggerChild`. Саму обгортку (імпорт, визначення)
//      не рахуємо, лише call-site-и.
//   9. `glass` — `backdrop-blur-*` (будь-який суфікс, включно з голим
//      `backdrop-blur`).
//  10. `bigRadius` — `rounded-xl|2xl|3xl|full` і їхні сторонні форми
//      (`rounded-t-2xl`, `rounded-tl-xl`, `rounded-ss-full`, …), з будь-яким
//      префіксом-варіантом. `rounded-full` легальний лише у файлах з
//      `ROUNDED_FULL_ALLOWLIST` (список шляхів нижче, причина на кожен).
//      Allowlist ПОФАЙЛОВИЙ, а не порядковий: у такому файлі дозволено ВСІ
//      `rounded-full`, зате `rounded-xl|2xl|3xl` рахуються скрізь. Порядковий
//      allowlist (за `// ui-canon-allow`) відхилено: це ще один спосіб
//      обійти гейт одним коментарем.
//  11. `kicker` — проп `eyebrow` (кікер) на `<SectionHeading`. Назва пропа в
//      `SectionHeading.tsx` саме `eyebrow` (супутні `eyebrowTone|As|Id` не
//      рахуються: без `eyebrow` вони безглузді). Скануємо РІВНО тег
//      `<SectionHeading`, як метрику кнопки.
//
// Нові метрики 7-11 (CSS не скануємо: там ВИЗНАЧЕННЯ утиліт) стартують зі
// стелі = факт на момент заведення, потім лише вниз. Без запису в
// `.tech-debt/ui-canon-budget.json` гейт падає голосно (exit 1, «немає
// baseline»), а не приймає поточне значення: стартове число вписується
// `--update` не вміє (воно лише ЗНИЖУЄ), тож перший baseline нових ключів
// пишеться руками разом з абзацом у `rationale`.
//
// Додаєш метрику — це рівно пʼять місць (константа канону → гілка скану →
// ключ у лічильниках → число + абзац у бюджеті → вивід і тести), і обовʼязково
// break-тест. Покроково: docs/start/instructions/unify-ui-to-canon.md.
//
// ЧОМУ ХРАПОВИК, А НЕ ЗАБОРОНА. Заборонити все одразу не можна: фокус-рамку
// свідомо не мігрували цим раундом (256 дрібних правок у розмітці, кожна з
// ризиком зачепити верстку, і жодна не видна користувачу окремо — див.
// § Поза скоупом у docs/work/specs/c-section-consistency-migration.md).
// Але саме ЗРОСТАННЯ і є проблемою: замір 2026-09-16 показав +14 рукописних
// рамок за три дні звичайної роботи. Причина не в тому, що хтось наплутав, а
// в тому, що кожен новий код копіює найближчий сусідній. Храповик розриває
// саме це: стелю можна лише опускати.
//
// Форма — та сама, що в `.tech-debt/dead-doc-links-budget.json`, і вона вже
// довела себе: борг мертвих посилань упав 469 → 468 без окремого проєкту,
// просто тому, що PR, який чіпав ті файли, заодно їх полагодив.
//
// Запуск:   node scripts/check-ui-canon-ratchet.mjs
// Оновити:  node scripts/check-ui-canon-ratchet.mjs --update   (лише вниз)

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const WEB_SRC = resolve(REPO_ROOT, "apps", "web", "src");
const BUDGET_PATH = resolve(REPO_ROOT, ".tech-debt", "ui-canon-budget.json");
export const I18N_ALLOWLIST_PATH = resolve(
  REPO_ROOT,
  "apps",
  "web",
  "eslint.i18n-allowlist.json",
);

/** Легасі-union з `Button.tsx` — усе, що НЕ є emphasis-словом. */
/**
 * Канонічна непрозорість фокус-токена. Обрана НЕ смаком, а заміром: із семи
 * живих варіантів `/45` стоїть у 124 місцях проти 21 у наступного. Тобто це
 * не «новий стандарт», який треба розкотити, а той, що вже де-факто є.
 */
export const CANON_RING_OPACITY = "45";

/**
 * Числові розміри іконок, які ТОЧНО збігаються з токеном шкали `ICON_SIZES`
 * (`Icon.tsx`). Докстрінг самого компонента каже «new code should prefer the
 * tokens», але конвенція без механізму трималась лише на рев'ю — і не
 * втрималась: 329 викликів сиділи на числах при 845 на токенах.
 *
 * Позашкальні числа (9, 10, 11, 13, 15, 18, 22, 26, 28, 32) СЮДИ НЕ ВХОДЯТЬ:
 * той самий докстрінг лишає числовий API «for one-off cases», і вимагати
 * токен там, де токена немає, означало б вимагати зміни вигляду.
 */
export const ICON_SIZE_TOKENS = {
  12: "xs",
  14: "sm",
  16: "md",
  20: "lg",
  24: "xl",
};

/**
 * Файли, де `rounded-full` легальний (форма об'єкта кругла за змістом, а не
 * за смаком). Шляхи від кореня репо, з прямими слешами. Новий запис - лише з
 * причиною.
 */
export const ROUNDED_FULL_ALLOWLIST = [
  // аватар: круг і бейдж статусу на ньому
  "apps/web/src/shared/components/ui/Avatar.tsx",
  // спінер: кругле кільце
  "apps/web/src/shared/components/ui/Spinner.tsx",
  // індикатор pull-to-refresh: круглий спінер
  "apps/web/src/shared/components/ui/PullToRefreshIndicator.tsx",
  // чекбокс-кружок і конфеті-крапки
  "apps/web/src/shared/components/ui/AnimatedCheckbox.tsx",
  // перемикач: трек і кругла ручка
  "apps/web/src/shared/components/ui/Switch.tsx",
  // кружки звичок у місячній сітці Рутини
  "apps/web/src/modules/routine/components/RoutineCalendarMonthGrid.tsx",
  // скелет аватарів/кілець модулів
  "apps/web/src/shared/components/ui/ModulePageLoader.tsx",
];

export const LEGACY_BUTTON_VARIANTS = [
  "primary",
  "primary-ink",
  "secondary",
  "danger",
  "destructive",
  "success",
  "finyk",
  "fizruk",
  "routine",
  "nutrition",
  "finyk-soft",
  "fizruk-soft",
  "routine-soft",
  "nutrition-soft",
];

/**
 * Індекси, що лежать усередині рядка або коментаря.
 *
 * Не косметика: без цього гейт рахував би `<Button>` у тексті помилки
 * (`DropdownMenu.tsx` кидає «must be a single React element (e.g.
 * <Button>…</Button>)») як живий call-site. Саме на цьому спіткнувся
 * codemod цієї ж міграції, і повторювати помилку в гейті не можна — гейт,
 * який рахує неіснуючі місця, гірший за відсутній.
 */
export function maskedRanges(s) {
  const bad = new Array(s.length).fill(false);
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < s.length && s[i] !== "\n") bad[i++] = true;
      continue;
    }
    if (c === "/" && c2 === "*") {
      const st = i;
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i = Math.min(i + 2, s.length);
      for (let k = st; k < i; k++) bad[k] = true;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      const st = i;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      for (let k = st; k < i; k++) bad[k] = true;
      continue;
    }
    i++;
  }
  return bad;
}

/**
 * Кінець відкривного JSX-тега: `>` на глибині фігурних дужок 0, поза рядками.
 *
 * Потрібен, бо метрику треба міряти РІВНО на `<Button>`. Перша версія гейта
 * шукала `variant="danger"` де завгодно й нарахувала 203 «легасі-кнопки» —
 * серед них `EmptyState`, `Badge`, `Banner`, `ProgressBar`, у яких
 * `variant="danger"` є ЇХНІМ власним канонічним API. Гейт, що червоніє на
 * чужому компоненті, блокує легальний код і привчає обходити себе.
 */
export function tagEnd(s, start) {
  let i = start;
  let brace = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          i += 2;
          continue;
        }
        if (s[i] === q) break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "{") {
      brace++;
      i++;
      continue;
    }
    if (c === "}") {
      brace--;
      i++;
      continue;
    }
    if (c === ">" && brace === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Гасить КОМЕНТАРІ (не рядки) пробілами тієї ж довжини.
 *
 * Потрібне всередині вирізаного тега: JSX дозволяє `// коментар` між
 * пропами, і перша версія гейта порахувала за живий проп рядок
 * `// module="finyk" → \`finyk\`` з пояснення в `ReceiptScanSheet`. Рядкові
 * літерали гасити не можна — у них живуть самі значення пропів.
 */
export function blankComments(s) {
  let out = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    const c2 = s[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < s.length && s[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && c2 === "*") {
      const st = i;
      i += 2;
      while (i < s.length && !(s[i] === "*" && s[i + 1] === "/")) i++;
      i = Math.min(i + 2, s.length);
      for (let k = st; k < i; k++) out += s[k] === "\n" ? "\n" : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      out += c;
      i++;
      while (i < s.length) {
        if (s[i] === "\\") {
          out += s[i] + (s[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += s[i];
        if (s[i] === q) {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Рахує обидві метрики в одному тексті. Повертає масив влучань із рядками. */
export function scanSource(relPath, src) {
  const hits = [];
  const masked = maskedRanges(src);
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;

  // ── 1. легасі-кнопка — РІВНО в тегах `<Button>`, не деінде ──
  const legacySet = new Set(LEGACY_BUTTON_VARIANTS);
  const btnRe = /<Button\b/g;
  let m;
  while ((m = btnRe.exec(src))) {
    if (masked[m.index]) continue;
    const end = tagEnd(src, m.index + m[0].length);
    if (end === -1) continue;
    const tag = blankComments(src.slice(m.index, end + 1));
    const line = lineOf(m.index);

    const v = tag.match(/\svariant=("([^"]*)"|'([^']*)')/);
    const value = v ? (v[2] ?? v[3]) : null;
    if (value !== null && legacySet.has(value)) {
      hits.push({
        metric: "legacyButton",
        file: relPath,
        line,
        detail: `variant="${value}" — легасі; канон: (variant, tone)`,
      });
    }
    if (/\smodule=("[^"]*"|'[^']*'|\{)/.test(tag)) {
      hits.push({
        metric: "legacyButton",
        file: relPath,
        line,
        detail:
          "проп `module=` застарілий (@removeBy 2026-12-01); канон: `tone`",
      });
    }
  }

  // ── 2. рукописна фокус-рамка ──
  // Гасимо САМЕ коментарі, не рядки. Метрика кнопки маскує і те, і те
  // (`maskedRanges`), бо `<Button` у коді ніколи не є рядковим літералом —
  // а фокус-класи, навпаки, ЖИВУТЬ усередині `className="…"`. Спроба
  // перевикористати ту саму маску обвалила замір 235 → 7: гейт перестав
  // бачити власний предмет і при цьому лишився зеленим. Тобто маска не
  // «трохи сувора», вона вимикає перевірку — рівно та форма мовчазного
  // гейта, проти якої цей файл і написаний.
  //
  // Навіщо гасити коментарі взагалі: `routineIconButton.ts` описує, що
  // `.focus-ring` у `WeekDayStrip` підміняв успадкований
  // `focus-visible:ring-2` — тобто файл, який рукописну рамку ПРИБИРАЄ,
  // сирий скан рахував як такий, що її додає, і вимагав ратчет угору на
  // борг, якого не існує.
  const ringSrc = blankComments(src);
  const ringRe = /focus-visible:ring-2/g;
  while ((m = ringRe.exec(ringSrc))) {
    hits.push({
      metric: "handRolledFocusRing",
      file: relPath,
      line: lineOf(m.index),
      detail: "рукописна фокус-рамка; канон: утиліта `focus-ring`",
    });
  }

  // ── 3. непрозорість фокус-токена ──
  // Знахідка PR-C4, друга її половина — та, що лишилась живою після того, як
  // HC-ширину полагодили механізмом (`theme.css:1573` доводить
  // `--focus-ring-width` до рукописних кілець, тож a11y-розриву вже немає).
  // Один і той самий токен `ring-focus` пишуть СІМОМА рівнями непрозорості:
  // `/45` 124 рази, без суфікса 21, `/60` 14, `/30` 12, `/50` 5, `/40` 2,
  // `/25` 1. Жодна з цих сімок не є рішенням — це наслідок того, що новий код
  // копіює найближчий сусідній, а сусід трапляється який завгодно.
  //
  // Міряємо САМЕ `ring-focus`, не модульні тони (`ring-finyk`,
  // `ring-nutrition/60`, `ring-fizruk/50`): там різниця може бути задумом, бо
  // акцент модуля має власну насиченість. Звужувати чуже — рівно та помилка,
  // через яку перша версія метрики кнопки дала 203 хибні влучання на
  // `EmptyState` і `Badge`.
  //
  // Без суфікса — це НЕ «дефолт», а непрозорість 1.0, тобто найгучніший
  // варіант із семи.
  //
  // CSS не скануємо: там живуть ВИЗНАЧЕННЯ утиліт, а не call-site-и. `.input-focus`
  // у `utilities.css` стоїть на `/30` навмисно — це інша роль (кільце БЕЗ офсету,
  // щоб читалось усередині заповненого поля), і його модульні побратими свідомо
  // на `/25`. Порахувати визначення як дрейф — та сама помилка, що дала 203 хибні
  // влучання на `EmptyState` у першій версії метрики кнопки: гейт міряв чужий
  // канон своєю міркою.
  if (relPath.endsWith(".css")) return hits;

  const opacityRe = /focus-visible:ring-focus(?:\/(\d+))?(?![\w/-])/g;
  while ((m = opacityRe.exec(ringSrc))) {
    if (m[1] === CANON_RING_OPACITY) continue;
    hits.push({
      metric: "offCanonRingOpacity",
      file: relPath,
      line: lineOf(m.index),
      detail: m[1]
        ? `ring-focus/${m[1]} — канон \`ring-focus/${CANON_RING_OPACITY}\``
        : `ring-focus без суфікса (непрозорість 1.0) — канон \`ring-focus/${CANON_RING_OPACITY}\``,
    });
  }

  // ── 4. числовий розмір іконки там, де є токен ──
  // Скануємо РІВНО теги `<Icon`, як і метрика кнопки: `size={16}` є в інших
  // компонентів (`IconButton`, `Avatar`), і в них власний API без цієї шкали.
  const iconRe = /<Icon\b/g;
  while ((m = iconRe.exec(ringSrc))) {
    const end = tagEnd(ringSrc, m.index + 5);
    if (end < 0) continue;
    const tag = ringSrc.slice(m.index, end + 1);
    for (const hit of tag.matchAll(/\bsize=\{(\d+)\}/g)) {
      const token = ICON_SIZE_TOKENS[Number(hit[1])];
      if (!token) continue;
      hits.push({
        metric: "numericIconSize",
        file: relPath,
        line: lineOf(m.index),
        detail: `size={${hit[1]}} — канон \`size="${token}"\``,
      });
    }
    iconRe.lastIndex = end + 1;
  }

  // ── 5. альфа на `hero-ink` ──
  // Знахідка WF-23 (аудит шуму 2026-09-16) і найдорожча з усіх: полагодити
  // ОДИН файл було мало. `hero-ink` (#fdf9f3) лежить на геро-градієнті
  // модуля, і кожен крок непрозорості підмішує в чорнило колір фону. Замір
  // на СВІТЛОМУ (гіршому) кінці кожного з чотирьох градієнтів:
  //
  //   альфа   finyk   fizruk  routine  nutrition
  //   /100    5.22    5.11    5.04     4.67
  //   /95     4.88    4.78    4.72     4.39  ← вже провал
  //   /90     4.55    4.46    4.41     4.12
  //   /80     3.95    3.87    3.83     3.62
  //   /70     3.40    3.33    3.31     3.15
  //   /60     2.90    2.85    2.84     2.73
  //
  // Поріг AA для 12-14px тексту — 4.5:1, тож на nutrition не проходить
  // навіть повна непрозорість із запасом. Жоден чинний гейт цього не
  // бачив: ESLint-правило `no-opacity-on-text-token` не знає токена
  // `hero-ink`, контрастний тест у `design-tokens` міряє лише 100%-пари,
  // а axe на `/pricing` дає `incomplete` замість `violation`, бо фон —
  // `linear-gradient`, для якого він не вміє визначити колір тла.
  //
  // З 2026-10-01 метрика — ЗАБОРОНА, а не стеля над боргом: рішення
  // власника по аудиту контрасту (A9) — «чорнило без альфи», baseline = 0.
  // Було 20 місць; їх прибрано, ієрархію тримають кегль і вага, градієнт
  // не чіпали. Сканер ловить ЛИШЕ текстову утиліту `text-hero-ink/NN`:
  // декор (доріжка кільця `stroke-hero-ink/20`, ink-wash `bg-hero-ink/10`,
  // `border-hero-ink/20`) не текст, до порога 4.5:1 не підлягає й
  // метрикою не рахується. Нова альфа на текстовому чорнилі валить гейт.
  const heroInkRe = /text-hero-ink\/(\d+)/g;
  while ((m = heroInkRe.exec(ringSrc))) {
    hits.push({
      metric: "heroInkAlpha",
      file: relPath,
      line: lineOf(m.index),
      detail: `text-hero-ink/${m[1]} — альфа на геро-чорнилі заборонена (A9, 2026-10-01): бери \`text-hero-ink\` і тримай ієрархію кеглем/вагою`,
    });
  }

  // ── 7-11. рух, скло, радіуси, кікер ──
  // Без `blankComments` була б та сама фантомна згадка в докстрінгах; рядки
  // не гасимо: класи живуть у `className="…"`.
  const norm = relPath.replaceAll("\\", "/");
  const simple = (metric, re, detail) => {
    for (const x of ringSrc.matchAll(re)) {
      hits.push({
        metric,
        file: relPath,
        line: lineOf(x.index),
        detail: detail(x[0]),
      });
    }
  };
  simple(
    "hoverMotion",
    /(?:hover|active):(?:scale|-translate-y|shadow-glow)[\w.[\]/-]*/g,
    (t) => `${t} - рух/glow на hover/press поза каноном`,
  );
  simple(
    "enterMotion",
    /animate-stagger-in|page-enter|<StaggerChild(?![\w])/g,
    (t) => `${t} - вхідна анімація поза каноном`,
  );
  simple("glass", /backdrop-blur[\w[\]-]*/g, (t) => `${t} - скло поза каноном`);
  const radiusRe =
    /(?<![\w-])rounded-(?:(?:tl|tr|bl|br|ss|se|es|ee|t|r|b|l|s|e)-)?(xl|2xl|3xl|full)(?![\w-])/g;
  const fullOk = ROUNDED_FULL_ALLOWLIST.includes(norm);
  for (const x of ringSrc.matchAll(radiusRe)) {
    if (x[1] === "full" && fullOk) continue;
    hits.push({
      metric: "bigRadius",
      file: relPath,
      line: lineOf(x.index),
      detail: `${x[0]} - великий радіус поза каноном (rounded-full лише з ROUNDED_FULL_ALLOWLIST)`,
    });
  }
  const headingRe = /<SectionHeading(?![\w])/g;
  while ((m = headingRe.exec(ringSrc))) {
    const end = tagEnd(ringSrc, m.index + m[0].length);
    if (end < 0) continue;
    if (/\seyebrow(?=[=\s/>{])/.test(ringSrc.slice(m.index, end + 1))) {
      hits.push({
        metric: "kicker",
        file: relPath,
        line: lineOf(m.index),
        detail: "проп `eyebrow` (кікер) на <SectionHeading> поза каноном",
      });
    }
    headingRe.lastIndex = end + 1;
  }

  return hits;
}

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "DesignShowcase" || entry === "__tests__") continue;
      walk(full, acc);
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry)) continue;
    if (/\.(test|spec)\.(ts|tsx)$/.test(entry)) continue;
    if (/\.stories\.(ts|tsx)$/.test(entry)) continue;
    acc.push(full);
  }
  return acc;
}

/**
 * Метрика 5 — allowlist кирилиці в JSX. Рішення власника 2026-09-16
 * (варіант B аудиту дизайн-доків): EN-локаль заморожена як фундамент, але
 * ерозія каталогу зупиняється — новий UA-рядок іде в `@shared/i18n`, а не в
 * компонент із записом сюди. Кожен запис списку — один hit, щоб звіт
 * «перевищення» називав файли, як і решта метрик.
 */
export function allowlistHits(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("eslint.i18n-allowlist.json має бути масивом шляхів");
  }
  return entries.map((file, i) => ({
    metric: "cyrillicJsxAllowlist",
    file: String(file),
    line: i + 2,
    detail: "файл у allowlist `no-cyrillic-jsx-literal` — рядки повз каталог",
  }));
}

function collect() {
  const hits = [];
  for (const file of walk(WEB_SRC)) {
    hits.push(
      ...scanSource(relative(REPO_ROOT, file), readFileSync(file, "utf8")),
    );
  }
  hits.push(
    ...allowlistHits(JSON.parse(readFileSync(I18N_ALLOWLIST_PATH, "utf8"))),
  );
  return hits;
}

export function counts(hits) {
  const out = {
    legacyButton: 0,
    handRolledFocusRing: 0,
    offCanonRingOpacity: 0,
    numericIconSize: 0,
    cyrillicJsxAllowlist: 0,
    heroInkAlpha: 0,
    hoverMotion: 0,
    enterMotion: 0,
    glass: 0,
    bigRadius: 0,
    kicker: 0,
  };
  for (const h of hits) out[h.metric]++;
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  const hits = collect();
  const now = counts(hits);

  const budget = JSON.parse(readFileSync(BUDGET_PATH, "utf8"));

  // Метрика без запису в baseline проходить МОВЧКИ: `55 > undefined` — це
  // `false`, тож гейт друкує «порушень немає» і виходить нулем. Спіймано на
  // собі, коли додавали `offCanonRingOpacity`. Відсутній ключ — це не «нова
  // метрика з нульовим боргом», це вимкнена перевірка, і вона мусить падати
  // голосно, а не мовчки дозволяти.
  const missing = Object.keys(now).filter(
    (k) => typeof budget.budgets[k] !== "number",
  );
  if (missing.length) {
    console.error(
      `❌ У ${BUDGET_PATH} немає baseline для метрик: ${missing.join(", ")}.\n` +
        `   Метрика без baseline не перевіряється — додай число, а не лишай ключ порожнім.`,
    );
    return 1;
  }

  if (argv.includes("--update")) {
    let lowered = false;
    for (const key of Object.keys(now)) {
      if (now[key] < budget.budgets[key]) {
        console.log(`↓ ${key}: ${budget.budgets[key]} → ${now[key]}`);
        budget.budgets[key] = now[key];
        lowered = true;
      } else if (now[key] > budget.budgets[key]) {
        console.log(
          `✋ ${key}: ${now[key]} > ${budget.budgets[key]} — храповик піднімати НЕ можна.`,
        );
        return 1;
      }
    }
    if (!lowered) console.log("Нічого опускати — числа збігаються з baseline.");
    else writeFileSync(BUDGET_PATH, JSON.stringify(budget, null, 2) + "\n");
    return 0;
  }

  console.log(
    `🔍 UI-канон: легасі-кнопок ${now.legacyButton} (бюджет ${budget.budgets.legacyButton}), ` +
      `рукописних фокус-рамок ${now.handRolledFocusRing} (бюджет ${budget.budgets.handRolledFocusRing}), ` +
      `неканонічної непрозорості ${now.offCanonRingOpacity} (бюджет ${budget.budgets.offCanonRingOpacity}), ` +
      `числових розмірів іконок ${now.numericIconSize} (бюджет ${budget.budgets.numericIconSize}), ` +
      `файлів у allowlist кирилиці ${now.cyrillicJsxAllowlist} (бюджет ${budget.budgets.cyrillicJsxAllowlist}), ` +
      `альфи на геро-чорнилі ${now.heroInkAlpha} (бюджет ${budget.budgets.heroInkAlpha}), ` +
      `hover/press-руху ${now.hoverMotion} (бюджет ${budget.budgets.hoverMotion}), ` +
      `вхідної анімації ${now.enterMotion} (бюджет ${budget.budgets.enterMotion}), ` +
      `скла ${now.glass} (бюджет ${budget.budgets.glass}), ` +
      `великих радіусів ${now.bigRadius} (бюджет ${budget.budgets.bigRadius}), ` +
      `кікерів ${now.kicker} (бюджет ${budget.budgets.kicker}).`,
  );

  const over = Object.keys(now).filter((k) => now[k] > budget.budgets[k]);
  if (over.length === 0) {
    const lower = Object.keys(now).filter((k) => now[k] < budget.budgets[k]);
    if (lower.length) {
      console.log(
        `\n✅ Нових порушень немає. Борг зменшився (${lower.join(", ")}) — опусти baseline:\n` +
          "   node scripts/check-ui-canon-ratchet.mjs --update\n",
      );
    } else {
      console.log("\n✅ Нових порушень немає.\n");
    }
    return 0;
  }

  console.log(`\n❌ Перевищення храповика: ${over.join(", ")}\n`);
  for (const metric of over) {
    const list = hits.filter((h) => h.metric === metric);
    console.log(`  ${metric}: ${list.length} > ${budget.budgets[metric]}`);
    for (const h of list.slice(0, 15)) {
      console.log(`    ${h.file}:${h.line}  ${h.detail}`);
    }
    if (list.length > 15) console.log(`    …ще ${list.length - 15}`);
    console.log("");
  }
  console.log(
    "Храповик можна лише опускати. Новий код мусить вживати канонічну форму:\n" +
      "  кнопка — `variant` ∈ solid|soft|outline|ghost + `tone`;\n" +
      "  фокус — утиліта `focus-ring`, не рукописний `focus-visible:ring-2`;\n" +
      "  UA-рядок — у каталог `@shared/i18n`, не в компонент із записом в allowlist.\n" +
      "Мапа легасі→канон і причини — docs/work/specs/c-section-consistency-migration.md\n",
  );
  return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
