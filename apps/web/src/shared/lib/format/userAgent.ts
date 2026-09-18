/**
 * Перетворює навмисно крихкий User-Agent рядок на «людську» назву пристрою —
 * «Chrome 132 на Windows», «Safari 17 на iPhone», «Firefox 122 на Linux».
 *
 * Підмодуль PR-10 (ux-roast 2026-Q2 / §10.3): попередній `parseUA` у
 * `core/profile/sessions.ts` склеював брудні токени UA-рядка через слеш —
 * «Chrome/132.0.0.0 / Windows NT 10.0», що сесії перетворювало на читабельну
 * лише наполовину інформацію. Тут вибираємо читабельний browser+version,
 * нормалізуємо OS-родину до коротких назв, а версії стискаємо до major-у.
 *
 * Не намагаємося замінити повноцінний UA-парсер (`ua-parser-js` — 30 КБ
 * gzip-у і 200+ кейсів). Якщо UA не розпізнано — повертаємо «Невідомий
 * пристрій» і не шумимо у консоль.
 */

interface ParsedUserAgent {
  /** Людська репрезентація для UI: `Chrome 132 на Windows`. */
  readonly label: string;
  /** Лоу-кейс slug браузера або `null`, якщо не розпізнано. */
  readonly browser: string | null;
  /** Major-версія браузера або `null`. */
  readonly browserVersion: string | null;
  /** Лоу-кейс slug ОС або `null`. */
  readonly os: string | null;
}

const UNKNOWN_LABEL = "Невідомий пристрій";

interface BrowserMatcher {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
}

// Порядок ВАЖЛИВИЙ. Edge UA включає `Chrome/`, тому мусимо матчити Edge
// раніше; те саме для Opera (`OPR/`). Safari виявляємо тільки якщо в UA
// немає Chrome/Chromium токенів — інакше Chrome на Mac OS ловиться як
// Safari.
const BROWSERS: readonly BrowserMatcher[] = [
  { id: "edge", label: "Edge", pattern: /Edg(?:e|A|iOS)?\/(\d+)/ },
  { id: "opera", label: "Opera", pattern: /OPR\/(\d+)/ },
  { id: "firefox", label: "Firefox", pattern: /Firefox\/(\d+)/ },
  { id: "chrome", label: "Chrome", pattern: /Chrome\/(\d+)/ },
  // Safari iOS UA-string розриває "Version/17.4" і "Safari/604.1" токеном
  // "Mobile/15E148". Тому шукаємо `Version/N` за наявності `Safari/` десь
  // далі у рядку, не вимагаючи прилеглості.
  {
    id: "safari",
    label: "Safari",
    pattern: /Version\/(\d+)(?=[\s\S]*Safari\/)/,
  },
];

interface OSMatcher {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
}

// `iPad` / `iPhone` мусимо мати пріоритет над `Mac OS X`, бо iPadOS-Safari
// теж рапортує `Mac OS X`. Так само Android — раніше Linux.
const OPERATING_SYSTEMS: readonly OSMatcher[] = [
  { id: "iphone", label: "iPhone", pattern: /iPhone|iPod/ },
  { id: "ipad", label: "iPad", pattern: /iPad/ },
  { id: "android", label: "Android", pattern: /Android/ },
  { id: "windows", label: "Windows", pattern: /Windows NT|Windows Phone/ },
  { id: "macos", label: "macOS", pattern: /Mac OS X|Macintosh/ },
  { id: "linux", label: "Linux", pattern: /Linux|X11/ },
];

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) {
    return {
      label: UNKNOWN_LABEL,
      browser: null,
      browserVersion: null,
      os: null,
    };
  }

  let browser: string | null = null;
  let browserLabel: string | null = null;
  let browserVersion: string | null = null;
  for (const matcher of BROWSERS) {
    const m = matcher.pattern.exec(ua);
    if (m) {
      browser = matcher.id;
      browserLabel = matcher.label;
      browserVersion = m[1] ?? null;
      break;
    }
  }

  let os: string | null = null;
  let osLabel: string | null = null;
  for (const matcher of OPERATING_SYSTEMS) {
    if (matcher.pattern.test(ua)) {
      os = matcher.id;
      osLabel = matcher.label;
      break;
    }
  }

  if (!browserLabel && !osLabel) {
    return {
      label: UNKNOWN_LABEL,
      browser: null,
      browserVersion: null,
      os: null,
    };
  }

  const browserPart = browserLabel
    ? browserVersion
      ? `${browserLabel} ${browserVersion}`
      : browserLabel
    : null;

  let label: string;
  if (browserPart && osLabel) {
    label = `${browserPart} на ${osLabel}`;
  } else if (browserPart) {
    label = browserPart;
  } else if (osLabel) {
    label = osLabel;
  } else {
    label = UNKNOWN_LABEL;
  }

  return {
    label,
    browser,
    browserVersion,
    os,
  };
}

export type { ParsedUserAgent };
