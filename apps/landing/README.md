# @sergeant/landing

> **Last touched:** 2026-09-02 by @claude. **Next review:** 2026-12-05.
> **Status:** Active

Маркетинговий лендінг Sergeant. Одна сторінка, одна дія — перехід у
Telegram-бот вейтліста. Окремий static-білд (Vite + React + Tailwind 4),
деплоїться окремим Vercel-проєктом, не разом із `apps/web`.

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
```

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

Дві події, обидві з `ANALYTICS_EVENTS` у `@sergeant/shared` (імена не
вигадуються локально — ренейм ламає дашборди й губить історію):

| Подія                      | Коли           | Payload                            |
| -------------------------- | -------------- | ---------------------------------- |
| `landing_viewed`           | зміна маршруту | `path`, `locale`, `referrer?`      |
| `landing_telegram_clicked` | клік по CTA    | `source: hero \| footer`, `locale` |

⚠️ **Воронка розірвана між двома системами.** Клік — остання подія, яку бачить
клієнт; сам `/start` відбувається вже в Telegram і потрапляє в
`telegram_waitlist`. Тобто чисельник у БД, знаменник у PostHog — зводити
вручну, автоматичного звіту не буде. Деталі —
[спека](../../docs/90-work/planning/specs/archive/telegram-waitlist.md).

Свідомі обмеження:

- **Cookieless** (`persistence: "memory"`). Банер згоди не потрібен, але
  крос-сесійна аналітика неможлива — кожне завантаження сторінки це новий
  анонім.
- **Без autocapture, session-recording і pageview-хуків.**
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

Новий контентний маршрут = запис у `routeMeta.json` з `ogImage` + прогін
генератора в тому ж PR.
