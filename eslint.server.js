// PR-31 phase 2 — server-only flat-config blocks extracted from the root
// `eslint.config.js`. Composed back into the root array via `...serverBlocks`
// so `eslint --print-config` stays byte-identical (verified by
// `pnpm lint:eslint-config-diff`). Scope: `apps/server/**` Express/Node code.

export const serverBlocks = [
  // Stack-pulse PR-07 — body-size declarative policy.
  // Inline `express.json({ limit })` / `express.raw({ ..., limit })`
  // у server-коді (поза `apps/server/src/http/bodySizePolicy.ts`)
  // обходить декларативну `BODY_SIZE_POLICY`-таблицю — додавай rule
  // у policy замість того, щоб mount-ити inline-парсер. Скоупимо
  // виключно у `apps/server/**`, бо лише там Express body-парсери
  // мають значення (web/mobile не мають Express-сервера).
  {
    files: ["apps/server/**/*.{ts,js,mjs}"],
    rules: {
      "sergeant-design/no-inline-body-size-limit": "error",
    },
  },
  // Stack-pulse PR-16 — Pino redaction policy.
  // Pino logger у `apps/server/src/obs/logger.ts` має
  // `redact: { paths: [...] }` зі списком ~50 sensitive-полів
  // (Authorization, Cookie, password, email, …). Але redact-paths
  // працюють тільки на КЛЮЧАХ, які явно перераховані. Якщо хтось
  // пише `logger.info(req)` — у JSON-output потрапляють УСІ поля
  // Express Request, включно з тими, що не у redact-list (custom
  // proxy headers, `req.signedCookies`, `req.user` від Better Auth,
  // `req.body` для нових endpoint-ів). Це rule змушує робити явний
  // destructure (`logger.info({ url: req.url, status: res.statusCode },
  // 'msg')`) — контракт стає видимим у diff. Доповнення до
  // redact-paths, не заміна. Test-файли свідомо лишаємо у scope:
  // тести теж не мають логувати raw req/res. Скоупимо виключно у
  // `apps/server/**` — лише там живе Pino-stack. Hard rule #21,
  // докладніше у `docs/governance/security/logging-redaction-policy.md`.
  {
    files: ["apps/server/**/*.{ts,js,mjs}"],
    rules: {
      "sergeant-design/no-raw-req-in-pino-log": "error",
    },
  },
  // Backend-perf PR-11 — prefer-parseBody governance rule.
  // `validateBody` / `validateQuery` — застарілий sentinel-pattern
  // (`{ ok: false }` + ручний `if (!parsed.ok) return`), де забутий
  // `return` породжував double-response 500-ки на проді. Throw-based
  // `parseBody` / `parseQuery` у парі з `asyncHandler` + centralised
  // `errorHandler` дає той самий 400 з `code: "VALIDATION"` автоматично.
  // PR-09 + PR-10 мігрували усі наявні callsite-и; це правило
  // запобігає регресії в нових handler-ах.
  // Rollout: `warn` зараз → `error` через 1 sprint (governance-sync).
  // Виключаємо `apps/server/src/http/validate.ts` (де функції визначені)
  // і `*.test.*` (legacy-перевірки у тестах) — виключення живуть
  // всередині самого rule (дивись index.js § prefer-parse-body-over-validate-body).
  {
    files: ["apps/server/src/**/*.{ts,js,mjs}"],
    ignores: [
      "apps/server/src/http/validate.ts",
      "apps/server/src/http/validate.test.ts",
    ],
    rules: {
      "sergeant-design/prefer-parse-body-over-validate-body": "warn",
    },
  },
  // Server bigint→string guardrail — the `pg` driver returns `int8` /
  // `bigint` columns as JavaScript strings; every `.rows.map(…)` that
  // constructs a response object must wrap numeric-looking columns in
  // `Number(…)`. See AGENTS.md hard rule #1 and issue #708.
  //
  // Scoped to `apps/server/src/**` only — the web app never queries
  // pg directly.
  {
    files: ["apps/server/src/**/*.{js,ts}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/__tests__/**",
    ],
    rules: {
      "sergeant-design/no-bigint-string": "error",
    },
  },
  // Тон голосу UA-копії на сервері — але НЕ по всьому серверу, і це головне.
  //
  // Правило `ukrainian-copy` стояло в `eslint.web.js` і `eslint.mobile.js`, а
  // тут його не було, хоча сервер віддає людині текст: листи серії знайомства,
  // відповіді телеграм-бота, сторінки відписки. Тому «Спробуйте пізніше»
  // (ви-форма, заборонена §1.1) жила в `modules/mono/connection.ts` із самого
  // початку і жоден гейт її не бачив (знахідка PR-T3, 2026-09-13).
  //
  // ЧОМУ СКОУП, А НЕ ВЕСЬ `apps/server`. Замір 2026-09-14 дав 144 влучання в
  // 46 файлах, і 129 із них — довге тире. Верхня дюжина файлів — це
  // `modules/chat/toolDefs/*`, `nutrition/recommend-recipes.ts`,
  // `chat/coach.ts`: кирилиця там не копія, а ПРОМПТ до моделі. Тире в
  // промпті не «читається як ШІ-текст», бо його не читає людина. Вмикання по
  // всьому серверу дало б ~129 хибних влучань проти ~15 справжніх, тобто
  // рівно той стан «червоне завжди = гейт вимкнено», яким у цьому репо вже
  // обґрунтовано три ратчети бандла.
  //
  // Розділити промпт і копію ШЛЯХОМ не можна: у `coach.ts` і `day-plan.ts`
  // вони лежать в одному файлі. Тому скоуп — рівно ті теки, де кирилиця
  // гарантовано адресована людині й нічого іншого там немає. Розширення
  // скоупу потребує ЗАМІРУ на нових шляхах, не інтуїції.
  //
  // Гейт зелений від народження: шість порушень, знайдених цим заміром,
  // виправлено в тому ж PR (листи й бот перейшли на 1-шу однини — рішення
  // founder-а 2026-09-01, style-guide §2, знахідка TXT-5).
  {
    files: [
      "apps/server/src/email/**/*.{js,ts}",
      "apps/server/src/modules/telegram/**/*.{js,ts}",
      "apps/server/src/routes/email-unsubscribe.ts",
    ],
    rules: {
      "sergeant-design/ukrainian-copy": "error",
    },
  },
  // Hard Rule #18 — Module-size discipline: max-lines 600 for server.
  // Mirrors the web-side `max-lines` block in eslint.web.js.
  // Enforces decomposition: every .ts/.js file under apps/server/src/
  // must have ≤ 600 LOC (skipBlankLines + skipComments). Tests and
  // __tests__/ are exempt. The burndown allowlist
  // (`apps/server/eslint.server-maxlines-allowlist.json`) reached zero and
  // was removed — there are no grandfathered monoliths; a new violation
  // is fixed, not allowlisted.
  // See docs/governance/governance/rules/18-module-size-discipline-600.md
  // and docs/work/specs/tech-debt/archive/technical-assessment-2026-06-05.md Theme 2.
  {
    files: ["apps/server/src/**/*.{js,ts}"],
    ignores: [
      "apps/server/src/**/*.test.{js,ts}",
      "apps/server/src/**/*.spec.{js,ts}",
      "apps/server/src/**/__tests__/**",
    ],
    rules: {
      "max-lines": [
        "error",
        { max: 600, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
