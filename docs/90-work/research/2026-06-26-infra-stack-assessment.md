# Оцінка стеку інфраструктури, авторизації та вартості Sergeant

> **Last touched:** 2026-06-26 by @dimastahov16012003. **Next review:** 2026-09-24.
> **Status:** Active

## Питання

Чи правильно підібрано стек інфраструктури й авторизації Sergeant, на який обсяг
роботи (масштаб користувачів) він розрахований і скільки коштуватиме на місяць —
для трьох сценаріїв: **(A)** personal / single-user (як зараз), **(B)** закрита
бета 10–500 users, **(C)** публічний SaaS 1k–10k+ users.

> Метод: пайплайн `sergeant-research-pipeline` → платформенний `deep-research`
> (5 пошукових напрямів, 23 джерела, 25 тверджень крізь 3-голосову adversarial-
> перевірку, 0 відхилено). Зовнішні факти (ціни/ліміти) тримаються **окремо** від
> repo reality (квоти, SLO, конфіг), як вимагає пайплайн.

## Висновок

**Стек підібрано правильно** для indie/solo-продукту: Railway + Vercel +
self-hosted Better Auth + Railway Postgres/pgvector + Railway Redis — дешевий,
зв'язний і достатній аж до межі сценарію C. **Домінантний драйвер вартості на
будь-якому значимому масштабі — це токени Anthropic Claude, а не інфраструктура.**

- **A (personal):** ~**$5–25/міс** усе разом. Railway Hobby ($5 з $5 кредиту),
  Vercel Hobby (free), free-tier Sentry/PostHog/Resend/Stripe. Claude — кілька $.
- **B (бета 10–500):** ~**$150–800/міс**, домінує Claude. Примусово переходиш на
  платні тарифи (Vercel Pro, Sentry Team). **Перше тверде вузьке місце — ліміт
  Anthropic Tier 1 у 50 RPM**, не вартість.
- **C (SaaS 1k–10k+):** Claude перекриває все інше. На бюджеті 50 запитів/день/user
  на Sonnet — **~$5–25 на активного користувача/міс** без кешу; на Haiku ~⅓ цього.
  **Prompt caching — головний важіль** (−60…90% вартості input + знімає кешовані
  токени з rate-limit).

**Дві зміни, що найбільше де-ризикують перехід B→C:** (1) винести Redis у managed
serverless (Upstash) і **явно ввімкнути + протестувати** Railway PITR; (2) агресивний
prompt caching + model-tiering (Haiku/Sonnet/Opus — 5× розкид) + завчасне підняття
Anthropic usage-tier, щоб зняти 50 RPM.

## Деталі

### 1. Правильність вибору стеку

| Компонент                                                        | Вердикт             | Нюанс / ризик                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Railway** (API, OpenClaw gateway, n8n, Postgres, Redis)        | ✅ доречно          | Усе в одному провайдері — просто, але 3 сервіси + БД + Redis накопичують usage-cost швидше за headline-ліміти.                                            |
| **Vercel** (фронт + Edge Middleware proxy `/api/*`)              | ✅ доречно          | I/O-wait (стрімінг Claude, запити в БД) **не** тарифікується як active CPU → cross-provider hop Vercel→Railway додає **латентність (UX), а не вартість**. |
| **Better Auth** (self-hosted, cookie+bearer, OAuth, AES-256-GCM) | ✅ розумно для solo | ⚠️ зрілість vs Clerk/Auth0 **не верифікована** в цьому прогоні (див. «Невідоме»). Self-host = повний контроль + нуль per-MAU плати, ціна — own-ops.       |
| **Postgres 17 + pgvector** на Railway                            | ✅ доречно          | ⚠️ **бекапи opt-in і не-ретроактивні** (див. §2) — головна durability-діра.                                                                               |
| **Redis на Railway** (ioredis + BullMQ)                          | ⚠️ ок, але          | Self-managing Redis = більше ops, ніж serverless. На B→C — кандидат №1 на Upstash.                                                                        |
| **Anthropic Claude**                                             | ✅ ядро продукту    | Домінантна вартість; керується model-tiering + caching.                                                                                                   |

### 2. Ліміти й вузькі місця (що впреться першим A→B→C)

- **Anthropic Tier 1 = 50 RPM** (Sonnet 4.x: 50 RPM / 30k ITPM / 8k OTPM; Opus:
  50 RPM / 500k ITPM / 80k OTPM). **Впирається першим на A→B** — задовго до того,
  як вартість токенів стане проблемою. Тіри підіймаються автоматично за
  кумулятивними покупками кредитів ($5/$40/$200/$400 → Tier 1–4; стелі витрат
  $500/$500/$1000/$200000/міс; Monthly Invoicing знімає cap). De-risk: front-load
  кредитів до Tier 3/4 перед публічним запуском.
- **Vercel Hobby — лише non-commercial.** Щойно з'являються бета-користувачі (B) —
  **примусовий** перехід на Pro ($20/user/міс). Це не опція.
- **Sentry free Developer — лише 1 user** (5k errors + 5M spans). Другий колаборатор
  → Team $26/міс (annual); далі стеля 50k errors — це вже C. `traces sample rate 0.1`
  тримає span-volume у межах 5M.
- **PostHog free — 1M analytics events/міс** (+5k recordings, 1M flag-req, 100k
  error-exceptions). Стеля впирається десь на B→C залежно від щільності інструментації.
- **Railway:** реальні per-replica defaults (~24–32 GB RAM) значно нижчі за
  headline-стелі (48 GB Hobby / 1 TB Pro). Впирається radше накопичений usage-cost
  по 3 сервісах + БД + Redis, ніж стеля.
- **Vercel Functions payload cap 4.5 MB** — обмежує proxy `/api/*` для великих
  завантажень (HTTP 413).

### 3. Прогноз вартості ($/міс)

| Сервіс                             | A — personal   | B — бета 10–500               | C — SaaS 1k–10k+             |
| ---------------------------------- | -------------- | ----------------------------- | ---------------------------- |
| Railway (API+gateway+n8n+PG+Redis) | $5 (Hobby)     | ~$20–60 (Pro + usage)         | usage-scaled, сотні $        |
| Vercel                             | $0 (Hobby)     | $20+ (Pro, commercial)        | $20 + bandwidth/invocations  |
| **Anthropic Claude**               | кілька $       | **домінує (десятки–сотні $)** | **домінує (×активні users)** |
| Sentry                             | $0 (Developer) | $26 (Team)                    | $26 + overage                |
| PostHog                            | $0             | $0 → usage                    | usage                        |
| Resend / Stripe                    | $0 / %         | free-tier / %                 | tier / %                     |
| **Разом (порядок)**                | **$5–25**      | **$150–800**                  | **Claude-dominated**         |

**Claude на активного користувача:** при 50 req/день, ~2–5k input + ~500–1k output
токенів/запит на **Sonnet** ($3/$15 за MTok) — **~$5–25/user/міс без кешу**; на
**Haiku** (~$1/$5) — близько ⅓; на **Opus** ($5/$25) — у кілька разів більше.
**Prompt caching:** cache read = 0.1× base input (−90%); 5-хв cache write = 1.25×,
окупається після **одного** читання (1.25×+0.1× = 1.35× проти 2× без кешу). Кешовані
токени **не рахуються** в ITPM (виняток — Haiku 3.5) → і дешевше, і вищий throughput.
Для tool-use + AI-memory workload Sergeant (стабільні system-prompt / tool-defs /
повторюваний контекст) це дає реальні −60…90% на input.

### 4. Repo reality (звірено з кодом — окремо від зовнішніх фактів)

- **AI-квота ≠ env.example.** Продуктові тарифи в коді: **Free = 5 AI-req/день**,
  **Pro = unlimited**, анонім = 40/день (`apps/server/src/modules/chat/aiQuota.ts`).
  «Pro unlimited» — **прямий ризик вартості на C** (один важкий Pro-user може з'їсти
  непропорційний Claude-бюджет). Tool-call дефолт `DEFAULT_TOOL_COST=3`, хоча
  `.env.example` згадує `2` — **розбіжність дефолтів, варто звести**.
- **Observability наполовину wired.** `prom-client`/`/metrics`, Sentry, PostHog,
  Pino-логи — реально працюють. Усі 24 Prometheus-правила (включно
  `BackendHealthP95High`) — **design-only, ніким не evaluat-яться**; реальний сигнал
  про downtime = UptimeRobot + Sentry (SLO.md § Статус wiring).
- **Бекапи перевіряються.** `.github/workflows/db-backup-verify.yml` щотижня
  репетирує restore Railway Postgres — реальна практика, не лише дизайн. Але PITR
  все одно opt-in/не-ретроактивний → переконатися, що ввімкнено в prod.
- **SLO-цілі** (SLO.md): HTTP 99%, Sync 99.5%, Auth 99%, AI 97%. Документ прямо
  позиціонує продукт як **«персональний PWA, не SaaS із SLA»** — тобто архітектурні
  припущення сьогодні відповідають сценарію A, і їх треба переглянути на B→C.

## Джерела

**Зовнішні (deep-research, 2026, primary якщо не вказано інакше):**

- https://docs.railway.com/pricing/plans, https://railway.com/pricing — тарифи Railway, usage-rates, per-service стелі.
- https://docs.railway.com/volumes/point-in-time-recovery — PITR: 4 full backups (~4 тижні), opt-in/non-retroactive.
- https://vercel.com/pricing, https://vercel.com/docs/functions/usage-and-pricing, https://vercel.com/docs/functions/limitations — Hobby non-commercial, Pro $20/user, I/O-wait не біллиться, payload 4.5 MB.
- https://platform.claude.com/docs/en/about-claude/pricing — Opus 4.8 $5/$25, Sonnet $3/$15, Haiku $1/$5; cache read 0.1×.
- https://platform.claude.com/docs/en/api/rate-limits — 4-тірна система, Tier 1 = 50 RPM, кеш поза ITPM.
- https://sentry.io/pricing/, https://docs.sentry.io/pricing/ — Developer $0 (1 user), Team $26/міс.
- https://posthog.com/pricing — free 1M events + 5k recordings + 1M flags + 100k exceptions.
- https://docs.voyageai.com/docs/pricing, https://upstash.com/pricing/redis, https://resend.com/pricing — зібрані, але **без підтверджених тверджень** (див. «Невідоме»).
- Stack-trade-offs (blog-quality): makerkit.dev (Better Auth vs Clerk), designrevision.com (Vercel vs Railway), solodevstack.com (Redis vs Upstash).

**Repo reality (file:line):**

- `apps/server/src/modules/chat/aiQuota.ts` — Free=5 / Pro=unlimited / anon=40, `DEFAULT_TOOL_COST=3`.
- `.env.example:30-32` — `AI_TOOL_COST=2` (розбіжність).
- `docs/03-operations/observability/SLO.md` — SLO-цілі + «не wired» статус Prometheus.
- `.github/workflows/db-backup-verify.yml` — щотижневий restore-rehearsal.
- `docs/02-engineering/integrations/railway-vercel.md` — топологія деплою, same-origin proxy.

## Невідоме / наступні кроки

deep-research **не покрив** (твердження не пройшли верифікацію — потрібен окремий
прогін або ручна звірка цінників):

1. **Voyage AI** — точна ціна за MTok 2026 і доплата за pgvector AI-memory на
   активного користувача (фіча за feature-flag).
2. **Resend** — місячний cap і тіри; чи перевищує обсяг password-reset/verification
   від Better Auth free-tier на C.
3. **Upstash** — реальна ціна serverless Redis vs self-host на Railway (щоб
   кількісно обґрунтувати рекомендацію №1).
4. **Better Auth зрілість/безпека vs Clerk/Auth0** для single-maintainer — і реальна
   вартість міграції, якщо self-host стане тягарем.
5. **Expo/EAS** — build/seat-тіри 2026 для мобільної поверхні (вторинна).

**Дії в коді (незалежні від зовнішнього ресьорчу):** (a) звести `DEFAULT_TOOL_COST`
↔ `.env.example`; (b) розглянути cap для Pro `aiRequestsPerDay` замість unlimited
перед C; (c) переглянути SLO-припущення «персональний PWA» на горизонті B→C.
