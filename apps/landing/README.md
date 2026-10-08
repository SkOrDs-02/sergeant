# @sergeant/landing

> **Last touched:** 2026-10-08 by @claude (аудит сайту: телеметрія, гейт дат, іконки й og, preview як Vercel). **Next review:** 2027-01-08.
> **Status:** Active

Маркетинговий сайт Sergeant: 31 маршрут із `src/lib/routeMeta.json`, кожен
під своє питання людини, і одна дія на всіх — перехід у Telegram-бот
вейтліста. Окремий static-білд (Vite + React + Tailwind 4), деплоїться
окремим Vercel-проєктом, не разом із `apps/web`.

## Локальний запуск

```bash
pnpm --filter @sergeant/landing dev     # http://localhost:3100
```

Бекенд не потрібен ні для запуску, ні для роботи: сторінка не робить жодного
запиту до API — конверсія веде на `t.me`.

## Команди

Усі скрипти `package.json`; з кореня — `pnpm --filter @sergeant/landing <script>`.

```bash
pnpm --filter @sergeant/landing dev             # Vite dev-сервер → http://localhost:3100
pnpm --filter @sergeant/landing build           # клієнтська + SSR-збірка, post-build SEO і prerender сторінок
pnpm --filter @sergeant/landing preview         # превʼю збірки на :3100
pnpm --filter @sergeant/landing lint            # ESLint
pnpm --filter @sergeant/landing test            # Vitest
pnpm --filter @sergeant/landing typecheck       # TypeScript
pnpm --filter @sergeant/landing shots           # скріншоти сторінок (`scripts/shot-pages.mjs`)
pnpm --filter @sergeant/landing verify:browser  # браузерна перевірка збірки (`scripts/verify-browser.mjs`)
pnpm --filter @sergeant/landing test:a11y       # axe-core по ВСІХ маршрутах із routeMeta (гейт CI)
pnpm --filter @sergeant/landing lighthouse      # Lighthouse-бюджети на чотирьох маршрутах (гейт CI)
pnpm --filter @sergeant/landing preview:lhci    # превʼю на :4175 для прогону Lighthouse
```

Обидва гейти якості будують сайт самі й міряють пререндерений `dist/`, тобто
рівно те, що бачать людина і краулер. Пороги Lighthouse і причина саме таких
чисел лежать у `lighthouserc.json`.

## Деплой на Vercel

Окремий проєкт у тому ж акаунті, що й `apps/web`.

| Налаштування     | Значення                         |
| ---------------- | -------------------------------- |
| Root Directory   | `apps/landing`                   |
| Framework Preset | Vite                             |
| Build Command    | з `vercel.json` (не чіпати в UI) |
| Output Directory | `dist`                           |

> **Root Directory обовʼязково задати явно.** У проєкті з `rootDirectory: null`
> Vercel білдить корінь монорепо й падає на кожному SHA, включно з docs-only —
> така пастка вже трапилась із проєктом `mapleravenlucky-8058s`.

### Змінні оточення

| Змінна              | Обовʼязкова | Навіщо                                                                     |
| ------------------- | ----------- | -------------------------------------------------------------------------- |
| `VITE_TELEGRAM_BOT` | ні          | Юзернейм бота без `@`. Дефолт `serg_qa_bot` — єдина точка конверсії сайту. |
| `SITE_URL`          | ні          | Публічний URL сайту без слеша. Вмикає `canonical`, `og:url`, `og:image`.   |
| `VITE_POSTHOG_KEY`  | ні          | Без неї телеметрія — повний no-op, SDK навіть не вантажиться.              |
| `VITE_POSTHOG_HOST` | ні          | Дефолт `https://eu.i.posthog.com`.                                         |

`SITE_URL` можна не задавати: якщо його немає, підхоплюється Vercel-івський
`VERCEL_PROJECT_PRODUCTION_URL`. Задавати вручну треба лише коли зʼявиться
власний домен.

`VITE_*` вкомпільовуються в бандл під час білду, а не читаються в рантаймі —
зміна такої змінної в UI не діє, поки не перебілдиш.

### 404 і статичні маршрути

У `vercel.json` немає catch-all rewrite. Кожен маршрут із `routeMeta.json`
існує як `dist/<path>/index.html` (postbuild-seo + prerender), а для
невідомого шляху Vercel віддає `dist/404.html` зі статусом 404: її кладе
`prerender.mjs` з тіла маршруту `/404`. До 2026-09-02 rewrite віддавав 200 і
пререндер головної на будь-який битий URL, тобто soft-404 (знахідка
GEO-аудиту 2026-08-27, P1-1), і краулер індексував дубль головної під кожним
таким URL. Перевірка після деплою:

```bash
curl -o /dev/null -w "%{http_code}\n" https://sergeant.com.ua/nope     # 404
curl -o /dev/null -w "%{http_code}\n" https://sergeant.com.ua/hroshi   # 200
```

### Що сайт віддає ШІ-краулерам

Краулери ШІ-пошуковиків переважно не виконують JS, тож кожен маршрут
пререндериться в повний HTML (`scripts/prerender.mjs` через
`src/entry-server.tsx`) разом із JSON-LD сторінки. Поверх цього білд кладе
три файли:

| Файл            | Що це                                         | Хто пише            |
| --------------- | --------------------------------------------- | ------------------- |
| `sitemap.xml`   | індексовані маршрути з `lastmod`              | `postbuild-seo.mjs` |
| `llms.txt`      | карта сайту для агентів, рукописна            | руками, `public/`   |
| `llms-full.txt` | суцільний текст усіх сторінок (лише `<main>`) | `prerender.mjs`     |

`llms.txt` — єдиний із трьох, який ніхто не генерує, тож його покриття
стереже `src/lib/routeRegistry.test.ts` разом із межами title (30–60) і
description (120–160). Публічний адрес у всіх трьох місцях приходить з
`scripts/site-url.mjs` — не вписуй домен у другому місці руками.

### Якщо тут колись зʼявиться запит до API

Проксі більше немає: сторінка API не викликає, тож edge-middleware лише
створював враження, що десь тут є `fetch`. Коли запит зʼявиться, поверни
проксі з історії git (`apps/landing/middleware.ts`) замість абсолютного URL на
бекенд — `getAllowedOrigins()` у
[`apps/server/src/http/cors.ts`](../server/src/http/cors.ts) fail-closed, і
same-origin-проксі дешевший, ніж вписувати туди домен лендінга.

## Конверсія

Єдина точка — [`TelegramCta`](./src/components/TelegramCta.tsx) → deep link
`t.me/<bot>?start=<placement>`. Email-форми на сторінці **немає**: бот не може
написати першим, тож зібраний контакт має сенс лише коли людина сама відкриє
діалог. Серверний `POST /api/v1/waitlist` і таблиця `waitlist_entries` живі —
ними користується `apps/web`, — але лендінг у них більше не пише.

`start`-payload = `placement`, тому канал видно і в PostHog, і в базі бота.

## Телеметрія

Чотири події, усі з `ANALYTICS_EVENTS` у `@sergeant/shared` (імена не
вигадуються локально — ренейм ламає дашборди й губить історію). Той самий
перелік словами стоїть у політиці приватності — нова подія = новий рядок
і там:

| Подія                      | Коли                        | Payload                                                   |
| -------------------------- | --------------------------- | --------------------------------------------------------- |
| `landing_viewed`           | зміна маршруту              | `path`, `locale`, `referrer?`                             |
| `landing_telegram_clicked` | клік по CTA                 | `source: hero \| footer \| beta`, `locale`, `ref`, `path` |
| `landing_widget_changed`   | перемикач 1/3/5 на головній | `trainings: 1 \| 3 \| 5`, `locale`                        |
| `landing_faq_opened`       | розкриття питання у FAQ     | `question` (літерал із `FAQ_ITEMS`), `locale`             |

⚠️ **Воронка розірвана між двома системами.** Клік — остання подія, яку бачить
клієнт; сам `/start` відбувається вже в Telegram і потрапляє в
`telegram_waitlist`. Тобто чисельник у БД, знаменник у PostHog — зводити
вручну, автоматичного звіту не буде. Деталі —
[спека](https://github.com/Skords-01/Sergeant/blob/d1a37e0bed4e403477376eae9ee9a078e4179da8/docs/90-work/planning/specs/archive/telegram-waitlist.md).

Поруч із подіями SDK шле теплову карту (`$$heatmap`: кліки й рух курсора) і
`$web_vitals`. Обидва задекларовані в політиці приватності і задані в
`posthog.init` явно, як і вимкнені surveys, dead clicks і exceptions: без
явних прапорців збором керував remote config спільного з `apps/web` проєкту
(аудит сайту 2026-10-08, priv-27).

Свідомі обмеження:

- **Cookieless** (`persistence: "memory"`). Банер згоди не потрібен, але
  крос-сесійна аналітика неможлива — кожне завантаження сторінки це новий
  анонім.
- **Без autocapture, session-recording, surveys і pageview-хуків.**
- SDK вантажиться динамічним імпортом, тому ~220 kB аналітики не стоять на
  критичному шляху першого рендера.

На [головній](./src/pages/HomePage.tsx) під CTA лишається коротка обіцянка про
приватність. Технічні межі cookieless-аналітики документуємо тут, а не
перевантажуємо ними перший екран.

## Токени дизайну

Кольори в [`src/index.css`](./src/index.css) дзеркалять
`@sergeant/design-tokens`, але імпорту немає: пакет віддає Tailwind-3 preset
для `apps/web`, а лендінг на Tailwind 4 з `@theme`. Синхронність тримає
[`src/tokens.drift.test.ts`](./src/tokens.drift.test.ts) — він падає, щойно
значення розійдуться.

## og-картинки

Дві родини, обидві закомічені:

- `public/og.png` – брендовий макет головної (і дефолт для сторінок без
  власної картинки);
- `public/og/*.png` – per-route превʼю контентних сторінок. Джерело правди –
  поле `ogImage` у `src/lib/routeMeta.json`: заголовок і опис картинки
  беруться з мети маршруту, а `postbuild-seo.mjs` підставляє
  `og:image`/`twitter:image` у per-route HTML на білді.

Перегенерувати після зміни копірайту, мети маршруту чи токенів:

```bash
node apps/landing/scripts/generate-og.mjs
```

Іконки (`favicon.ico`, `apple-touch-icon.png`) збираються з
`public/icon.svg`: `node apps/landing/scripts/generate-icons.mjs`. Обом
скриптам потрібен Chromium Playwright (у контейнері –
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`).

## Дата «Оновлено»

`lastmod` маршруту в `routeMeta.json` іде в sitemap, у видиму дату і в
`dateModified` розмітки. Гейт `src/lib/contentFreshness.test.ts` хешує текст
`<main>` кожної сторінки разом із title і description і падає, якщо текст
змінився, а `lastmod` ні. Змінив текст – підніми `lastmod`, потім:

```bash
pnpm --filter @sergeant/landing content:hashes
```

## Превʼю збірки

`vite preview` поводиться як Vercel (`vercelLikePreview` у `vite.config.ts`):
`/hroshi` віддає `dist/hroshi/index.html`, невідомий шлях – `404.html` зі
статусом 404. Без цього preview віддавав HTML головної на будь-який шлях без
слеша, і Lighthouse та браузерна перевірка міряли не ту сторінку.

Новий контентний маршрут = запис у `routeMeta.json` з `ogImage` + прогін
генератора в тому ж PR.
