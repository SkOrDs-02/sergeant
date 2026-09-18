/**
 * Coarse User-Agent normaliser → "<browser-family> <major-version>" or
 * "unknown". Input лишається опціонально null/undefined для сейфного виклику
 * на поляри-шунтах (наприклад, sendBeacon без `User-Agent`).
 *
 * Призначення (M12): дати анонімним endpoint-ам (`/api/metrics/web-vitals`,
 * `/api/csp-report`, кандидати на push-audit) канонічну форму UA, яку
 * безпечно логувати / агрегувати. Сирий `User-Agent` несе достатньо ентропії,
 * щоб слугувати квазі-ідентифікатором (≈3-4 біт за GA4, але в комбінації з
 * IP + час — більше) і його не можна просто персистити в Postgres / Sentry
 * без політики ретеншену.
 *
 * Що повертає нормалізатор:
 *   - `"chrome 121"`, `"firefox 121"`, `"safari 17"`, `"edge 121"`,
 *     `"opera 105"`, `"safari-mobile 17"`, `"chrome-mobile 121"`
 *   - `"unknown"` — все інше (боти, curl, нестандартні UA, відсутній header).
 *
 * Кардинальність: ~7 family × ~30 major versions = ~210 значень. Безпечно для
 * Prometheus-метрик з лейблом `ua_family`, безпечно для логів / Sentry tags.
 *
 * Чому regex, а не `ua-parser-js`: детермінований невеликий набір сімейств,
 * нульові залежності, форсимо консервативну поведінку (default `unknown`
 * замість дикого fallback-а на платформу). Якщо колись потрібен ширший
 * список ботів — мігруємо на `ua-parser-js`, але інтерфейс залишиться той самий.
 *
 * See `docs/security/hardening/M12-web-vitals-hardening.md`.
 */

const UNKNOWN = "unknown";

/**
 * Порядок важливий: Edge / Opera / Brave містять "Chrome" і "Safari" у своєму
 * UA, Chrome містить "Safari", тому specific-перші.
 *
 * Mobile-варіанти Safari (`Mobile/...` segment) і Chrome (`CriOS/`, `Chrome/`
 * на Android) виокремлені, бо клієнтський профіль (тривалість сесій, web-vitals
 * baseline) суттєво відрізняється і змішувати їх у дашбордах втрачає сигнал.
 */
const PATTERNS: { family: string; pattern: RegExp }[] = [
  // iOS/iPadOS Safari: "Mobile/15E148 Safari/604.1" + "Version/17.2"
  {
    family: "safari-mobile",
    pattern: /Version\/(\d+)[.\d]*\s+Mobile\/[^ ]+\s+Safari\//,
  },
  // Chrome on iOS uses CriOS prefix (WKWebView wrapper).
  { family: "chrome-mobile", pattern: /CriOS\/(\d+)/ },
  // Firefox on iOS uses FxiOS.
  { family: "firefox-mobile", pattern: /FxiOS\/(\d+)/ },
  // Edge desktop uses Edg/ (новіший Chromium-based) або EdgA/ (Android).
  { family: "edge", pattern: /Edg(?:A|iOS)?\/(\d+)/ },
  // Opera Chromium-based використовує OPR/, legacy — Opera/.
  { family: "opera", pattern: /OPR\/(\d+)/ },
  { family: "opera", pattern: /Opera\/(\d+)/ },
  // Chrome (Android має Mobile; ми мітимо це як chrome-mobile нижче).
  {
    family: "chrome-mobile",
    pattern: /Chrome\/(\d+)[.\d]*\s+Mobile\s+Safari\//,
  },
  { family: "chrome", pattern: /Chrome\/(\d+)/ },
  // Firefox standalone (rv: групує major у Gecko-build, але FirefoxLogfox має
  // власний токен).
  { family: "firefox", pattern: /Firefox\/(\d+)/ },
  // Safari desktop — після Chrome / Edge / Opera, бо ті теж містять "Safari".
  { family: "safari", pattern: /Version\/(\d+)[.\d]*\s+Safari\// },
];

/**
 * Повертає коарсну сігнатуру UA. Безпечно викликати з `req.headers["user-agent"]`
 * без додаткових перевірок типу.
 */
export function normaliseUserAgent(input: string | null | undefined): string {
  if (typeof input !== "string") return UNKNOWN;
  const trimmed = input.trim();
  if (trimmed.length === 0) return UNKNOWN;
  // Hard cap на довжину вхідного UA — будь-що понад 512 байт це або bot з
  // padded fingerprint-ом, або payload-injection. Канонічна відповідь на
  // overflow — `unknown`, без частих regex-проходів по мегабайтних рядках.
  if (trimmed.length > 512) return UNKNOWN;

  for (const { family, pattern } of PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match && match[1]) {
      return `${family} ${match[1]}`;
    }
  }
  return UNKNOWN;
}
