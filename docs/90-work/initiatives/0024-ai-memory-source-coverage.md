# 0024 — Памʼять ШІ: звузити список джерел до тих, що справді пишуться

> **Last touched:** 2026-08-26 by @Skords-01 (spec-інтервʼю з founder-ом — усі чотири відкриті рішення ратифіковані). **Next review:** 2026-11-26.
> **Status:** Proposed — рішення ухвалені 2026-08-26, скоуп закритий, виконується без додаткових питань. Три PR-и, порядок обовʼязковий (§ План змін).
> **Agent-ready:** yes
> **Priority:** P2 (не блокер launch-у [0010](./0010-revenue-first-launch.md); псує якість AI-шару і вводить в оману ops-документи)
> **Owner:** `@SkOrDs-02`
> **ETA:** PR-1 ≈ 0.5 спринту, PR-2 ≈ 0.2, PR-3 ≈ 0.2 + операторський замір між PR-2 і PR-3
> **Sources:**
>
> - Скарга власника 2026-08-18 на список «Що ШІ про тебе памʼятає» (полотно з тижневих звітів + службові рядки нарівні з фактами).
> - Розбір під час PR [#826](https://github.com/SkOrDs-02/sergeant/pull/826) — там закрито симптом (групування + демоут службових джерел), причина лишилась.
> - Spec-інтервʼю з founder-ом 2026-08-26 — ратифіковані рішення в § «Ратифіковані рішення».

## TL;DR

`ai_memories` оголошує **10 джерел**, а пишуть у неї **4**. Шість — `chat`, `finyk`, `fizruk`, `nutrition`, `routine`, `journal` — не мають жодного продюсера в дереві, але мають CHECK-констрейнт, union-тип, zod-схему, мітку в UI, фіче-флаг, рядок в ops-runbook і тести, які перевіряють, що ingest **не** викликано.

Рішення founder-а 2026-08-26: **прибрати всі шість**, повністю — включно зі звуженням CHECK-констрейнта двофазно. `ALLOWED_MEMORY_SOURCES` стає `['digest', 'cofounder', 'product', 'profile']`.

> ⚠️ **Заміри нижче застаріли після PR [#928](https://github.com/SkOrDs-02/sergeant/pull/928)** (2026-08-29, зняття атавізмів AI-шару). Той PR видалив `eventSync.ts`, `backfill.ts`, `forgetCleanup.ts` і `scripts/ai-memory-backfill.mjs`, тож рядки `product` і `cofounder` у таблиці нижче більше не мають продюсерів, а посилання на ці файли зняті (лишились назвами, щоб історію було видно). Скільки джерел лишилось насправді і що з цього випливає для плану змін — перезаміряти має власник ініціативи; цей коміт лише прибрав биті посилання, статусів у таблиці не чіпав.

## Виміряний стан (перевірено на HEAD 2026-08-26)

| Джерело     | Продюсер у дереві                                                                                                      | Стан                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `digest`    | [`weekly-digest.ts`](../../../apps/server/src/modules/digest/weekly-digest.ts) — `enqueueMemoryIngest` після генерації | ✅ пише                                                         |
| `product`   | `eventSync.ts` (видалено PR #928) ← `POST /api/ai-memory/event-sync` ← веб                                             | ✅ пише (4 події allowlist-у)                                   |
| `profile`   | [`profileMirror.ts`](../../../apps/server/src/modules/ai-memory/profileMirror.ts) — дзеркало банку памʼяті профілю     | ✅ пише (міграція 118, фаза 2 приземлена)                       |
| `cofounder` | `backfill.ts` (видалено PR #928) + CLI `pnpm ai-memory:backfill`                                                       | ✅ пише (founder-only, Telegram-архів)                          |
| `chat`      | —                                                                                                                      | ❌ дозволений у zod-схемі ingest-у, але веб туди не ходить      |
| `fizruk`    | —                                                                                                                      | ❌ те саме                                                      |
| `nutrition` | —                                                                                                                      | ❌ те саме                                                      |
| `routine`   | —                                                                                                                      | ❌ те саме                                                      |
| `journal`   | —                                                                                                                      | ❌ те саме; продуктової поверхні «щоденник» у репо немає        |
| `finyk`     | —                                                                                                                      | ❌ у `modules/mono/**` немає `enqueueMemoryIngest` поза тестами |

**Відтворити замір:**

```bash
grep -rn "enqueueMemoryIngest" apps/server/src --include=*.ts | grep -v "\.test\." | grep -v "ai-memory/"
```

Очікується: лише `weekly-digest.ts`. Решта продюсерів живе всередині `modules/ai-memory/`.

```bash
grep -rn "enqueueMemoryIngest" apps/server/src/modules/mono/*.ts | grep -v "\.test\."
```

Очікується порожньо — продюсера finyk-джерела немає.

## Три знахідки, без яких план буде неправильним

### 1. Факти з чату вже потрапляють у памʼять — під міткою `profile`

Поширене хибне уявлення: «сказав у чаті про алергію → нікуди не записалось». Насправді ланцюг існує і працює: інструмент `remember` ([`toolDefs/memory.ts`](../../../apps/server/src/modules/chat/toolDefs/memory.ts), `strict: true`) → клієнтський банк памʼяті `hub_user_profile_v1` → write-through у серверний `user_profile` → [`profileMirror.ts`](../../../apps/server/src/modules/ai-memory/profileMirror.ts) дзеркалить у `ai_memories` як `source='profile'` з дифом і `source_ref`.

Тому `chat` як окреме джерело — **дубль наявного шляху**, а не дірка. Два джерела під одну й ту саму річ дали б два списки в UI і конкуренцію за ті самі 4 слоти RAG.

Справжня (вужча) дірка: коли модель **не викликала** `remember` — факт, сказаний мимохідь, не осідає ніде. Це не проблема таблиці джерел, це якість tool-calling. Її вимірюємо (PR-1, крок 7), а лікуємо окремим таском.

### 2. Прибирання `finyk` вбиває єдиний актуатор гейта якості RAG

`MONO_AI_MEMORY_INGEST_ENABLED` гейтить рівно одну умову — у [`ingestQueue.ts`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts) це `payload.source === "finyk"`. Поверх неї сидить рантайм kill-switch `mono_ai_memory_ingest`, який автоматично зводить [`eval-rag.ts`](../../../apps/server/src/routes/internal/eval-rag.ts), коли тижневий recall@4 падає нижче порогу kill.

`runtimeKillSwitch.ts` має рівно одне значення `KillSwitchName`. Прибрати `finyk` мовчки означає лишити гейт якості без важеля.

Рішення founder-а: **перецілити на `digest`** — на те, що справді забиває слоти RAG полотнами тижневих звітів.

### 3. Прибирання client-driven джерел вбиває сам ендпоінт ingest-у

`CLIENT_DRIVEN_MEMORY_SOURCES` у [`ingestRoute.ts`](../../../apps/server/src/modules/ai-memory/ingestRoute.ts) = `['chat', 'fizruk', 'nutrition', 'routine', 'journal']` — **рівно пʼять мертвих джерел, і жодного живого**. Після прибирання список порожній, `z.enum([])` не компілюється, а `POST /api/ai-memory/ingest` лишається ендпоінтом без жодного допустимого входу.

Тому ендпоінт іде разом із ними: [`routes/ai-memory.ts`](../../../apps/server/src/routes/ai-memory.ts) (маунт), `ingestRoute.ts`, `ingestRoute.test.ts`, `ingestRoute.integration.test.ts`. Внутрішній `enqueueMemoryIngest` лишається — ним ходять усі чотири живі продюсери.

## Ратифіковані рішення (founder, 2026-08-26)

| #   | Питання                                        | Рішення                                                                                                      |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `chat` — автовитяг фактів чи ні                | **Прибрати як джерело.** Шлях уже є під міткою `profile`. Замість витягу — покращувати виклик `remember`.    |
| 2   | `finyk` — відновлювати ingest чи прибрати      | **Прибрати разом із флагом** `MONO_AI_MEMORY_INGEST_ENABLED`.                                                |
| 3   | `fizruk` / `nutrition` / `routine` / `journal` | **Прибрати всі чотири.** Модульні події вже мають власні поверхні; `journal` не має поверхні взагалі.        |
| 4   | Глибина прибирання                             | **Повна, включно зі звуженням CHECK** двофазно за Hard Rule #4.                                              |
| 5   | Старі рядки на проді з мертвим `source`        | **DELETE у тій самій міграції**, що звужує CHECK. Втрати немає — це рядки з конвеєрів, яких більше нема.     |
| 6   | Доля kill-switch після зникнення `finyk`       | **Перецілити на `digest`.** Механіка та сама, змінюється лише джерело-ціль.                                  |
| 7   | Дірка «модель не викликала `remember`»         | **Заміряти в цьому ж скоупі**, лікувати окремим таском.                                                      |
| 8   | Форма eval-кейсів                              | **Окремий блок із власним підсумком** — не входить у загальний бал, щоб історія звітів лишалась порівнянною. |
| 9   | Гейт від рецидиву                              | **Unit-тест у модулі** `ai-memory`, без нового CI-скрипта.                                                   |
| 10  | Розбивка робіт                                 | **Три PR-и** в жорсткому порядку (§ План змін).                                                              |

## Скоуп

**In:** звуження `ALLOWED_MEMORY_SOURCES` до чотирьох живих; видалення ендпоінта клієнт-driven ingest-у; перецілювання kill-switch на `digest`; приведення UI-міток, архітектурного опису й ops-runbook-ів у відповідність; міграція 128 (DELETE + звуження CHECK); unit-гейт від рецидиву; eval-кейси на неявний факт.

**Out:**

- Зміна складу `PRODUCT_MEMORY_EVENTS` — окреме продуктове рішення рівня ADR.
- Перегляд `topK` / релевантності recall-у — тюнити ранжування, поки корпус змінюється, означає вимірювати шум.
- Подання списку в налаштуваннях — уже зроблено в PR [#826](https://github.com/SkOrDs-02/sergeant/pull/826).
- Приватність / консент — `AI_MEMORY_ENABLED` + per-user preference лишаються як є.
- **Лікування** дірки з `remember` (промпт, автовитяг, підтвердження) — окремий таск; тут лише замір.

## План змін

### PR-1 — Перестати приймати мертві джерела (`feat(server)`)

Сервер більше не приймає жодного з шести значень. БД поки що дозволяє — це фаза 1 двофазного DROP.

1. [`modules/ai-memory/types.ts`](../../../apps/server/src/modules/ai-memory/types.ts) — `ALLOWED_MEMORY_SOURCES` = `['digest', 'cofounder', 'product', 'profile']`. Оновити docstring: двофазність лишається для **додавання**, тут описати і зворотний шлях.
2. Видалити ендпоінт клієнт-driven ingest-у цілком: `modules/ai-memory/ingestRoute.ts`, `ingestRoute.test.ts`, `ingestRoute.integration.test.ts`, маунт у [`routes/ai-memory.ts`](../../../apps/server/src/routes/ai-memory.ts). Перед видаленням — `grep -rn "ai-memory/ingest" apps packages` і зняти згадки з коментарів `index.ts`, `lib/jobs/connection.ts`, `ingestQueue.ts`.
3. [`ingestQueue.ts`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts) — прибрати гілку `payload.source === "finyk"`. Перецілення — у PR-2; тут лише зняти мертву умову.
4. [`AiMemoryList.tsx`](../../../apps/web/src/core/settings/AiMemoryList.tsx) — `SOURCE_LABEL` лишає чотири живі мітки. `TECHNICAL_SOURCES` (`product`, `digest`) не чіпати.
5. `modules/mono/webhook.test.ts`, `historyFetch.test.ts`, `webhook.integration.test.ts` — прибрати мок `enqueueMemoryIngest` і асерти `not.toHaveBeenCalled()`. Такий тест зелений і коли хук свідомо прибрано, і коли його випадково загубили; після PR-3 він охороняє неіснуючу можливість.
6. **Гейт від рецидиву** — новий `modules/ai-memory/sources.test.ts`: для кожного значення `ALLOWED_MEMORY_SOURCES` у дереві має існувати виклик `enqueueMemoryIngest` із цим source **або** запис у явній константі `RESERVED_SOURCES` (нині порожній) із посиланням на цю ініціативу. Тест читає дерево `apps/server/src` через `node:fs`, без нового CI-скрипта — іде в `pnpm check` сам собою.
7. **Замір дірки `remember`** — у [`scripts/tool-selection-eval.ts`](../../../apps/server/scripts/tool-selection-eval.ts) додати `IMPLICIT_FACT_CASES` (3–5 кейсів на кшталт «Я взагалі не їм глютен, тому обід був без хліба», «У мене травма коліна, присідання пропускаю») з `accept: ["remember"]`. Рахувати окремим рядком звіту `implicit remember: N/M` і **не** додавати в загальний бал — інакше історичні звіти стають непорівнянними. Наявний кейс «факт про себе» (явне «Запамʼятай:») лишається в основному наборі.
8. Доки: [`ai-memory.md`](../../02-engineering/architecture/ai-memory.md) (діаграма ingest-потоку — прибрати `mono webhook (source=finyk)` і клієнт-driven гілку), [`ai-memory-activation.md`](../../01-product/launch/tech/ai-memory-activation.md) (прибрати обіцянку «finyk-ingest стартує автоматично»).

### PR-2 — Перецілити kill-switch на `digest` (`feat(server)` + ops)

**Перед мержем — операторський крок:** перевірити поточне значення `MONO_AI_MEMORY_INGEST_ENABLED` на Coolify. Дефолт в [`env.ts`](../../../apps/server/src/env/env.ts) — `boolFromEnv(true)`, тож після перейменування відсутня змінна означає «увімкнено». Якщо на проді стоїть `false`, нову змінну треба виставити явно, інакше ingest тихо ввімкнеться.

1. [`env.ts`](../../../apps/server/src/env/env.ts) — `MONO_AI_MEMORY_INGEST_ENABLED` → `DIGEST_AI_MEMORY_INGEST_ENABLED`.
2. [`runtimeKillSwitch.ts`](../../../apps/server/src/lib/featureFlags/runtimeKillSwitch.ts) — `KillSwitchName` `"mono_ai_memory_ingest"` → `"digest_ai_memory_ingest"`; оновити docstring-діаграму (там же прибрати згадку Railway — бекенд живе на Hetzner/Coolify, [ADR-0074](../../04-governance/adr/0074-hosting-hetzner-coolify.md)).
3. [`ingestQueue.ts`](../../../apps/server/src/modules/ai-memory/ingestQueue.ts) — повернути per-source гілку, тепер на `payload.source === "digest"`. Метрика `mode="source_disabled"` лишається як є.
4. [`eval-rag.ts`](../../../apps/server/src/routes/internal/eval-rag.ts) — перейменувати `shouldAutoDisableMonoIngest` і рядок `activateKillSwitch`.
5. [`obs/metrics.ts`](../../../apps/server/src/obs/metrics.ts), [`obs/metrics/jobs.ts`](../../../apps/server/src/obs/metrics/jobs.ts) — коментарі з назвою switch-а.
6. Доки: [`runbook.md`](../../03-operations/observability/runbook.md) (§ «RagQualityGateKillSwitch»), [`feature-flags.md` (engineering)](../../02-engineering/architecture/feature-flags.md), [`feature-flags.md` (governance)](../../04-governance/governance/feature-flags.md), [`env-vars.md`](../../02-engineering/integrations/env-vars.md), [`rag-eval.md`](../../02-engineering/architecture/rag-eval.md), [`voyage-pgvector.md`](../../02-engineering/integrations/voyage-pgvector.md), [`ops/n8n-workflows/manifest.json`](../../../ops/n8n-workflows/manifest.json) (WF-30 notes), `scripts/ai-memory-backfill.mjs` (видалено PR #928) (коментар шапки).

### Замір на проді (між PR-2 і PR-3, операторський крок)

```sql
SELECT source, count(*) FROM ai_memories GROUP BY 1 ORDER BY 2 DESC;
```

Результат вклеїти в PR-3. Він визначає, скільки рядків видалить міграція; нулі по всіх шести — теж валідний результат, який треба зафіксувати.

### PR-3 — Міграція 128: DELETE + звуження CHECK (`feat(migrations)`)

Наступний вільний номер — **128** (останній зайнятий — `127_silpo_link_rejections`). Обовʼязково з `.down.sql`.

`128_ai_memories_prune_dead_sources.sql`:

1. `DELETE FROM ai_memories` для шести мертвих значень `source`.
2. `ALTER TABLE ai_memories DROP CONSTRAINT IF EXISTS ai_memories_source_check;` → `ADD CONSTRAINT ai_memories_source_check CHECK (source IN ('digest','cofounder','product','profile'));`
3. `COMMENT ON CONSTRAINT` — дописати рядок історії: «128 -> звужено до чотирьох джерел, що мають продюсера (ініціатива 0024, рішення founder-а 2026-08-26)».

Партиційний caveat уже перевірений у міграції 118 і лишається чинним: `ai_memories` HASH-партиційована на 32 партиції, `DROP`/`ADD CONSTRAINT` на батьківській таблиці каскадиться в партиції автоматично — `ALTER TABLE ai_memories` достатньо.

`128_ai_memories_prune_dead_sources.down.sql` повертає широкий CHECK (усі 10 значень). Видалені рядки down-міграція **не** повертає — це задокументована однобічність, як у `forgetSource()`.

## Верифікація

**Після PR-1:**

```bash
pnpm --filter @sergeant/server test -- ai-memory
```

```bash
pnpm --filter @sergeant/server test -- mono
```

```bash
pnpm check
```

Очікується: новий `sources.test.ts` зелений; жодного посилання на видалений ендпоінт.

```bash
grep -rn "ai-memory/ingest\b" apps packages --include=*.ts --include=*.tsx | grep -v event-sync
```

Очікується порожньо.

Замір дірки `remember` (потрібен `OPENROUTER_API_KEY`, мережевий виклик):

```bash
OPENROUTER_API_KEY=... pnpm --filter @sergeant/server eval:tools
```

Очікується: у звіті новий рядок `implicit remember: N/M`, а загальний бал моделей **не** змінився проти попереднього прогону. Число N/M вклеїти в PR-1 — воно є входом до окремого таска про якість `remember`.

**Після PR-2:**

```bash
pnpm --filter @sergeant/server test -- eval-rag
```

```bash
grep -rn "MONO_AI_MEMORY_INGEST_ENABLED\|mono_ai_memory_ingest" . --exclude-dir=node_modules --exclude-dir=.git
```

Очікується: лише історичні згадки в `migrations/065_ai_memory_backfill_state.sql` і в цьому файлі.

**Після PR-3:**

```bash
pnpm dev:db
```

```bash
psql "$DATABASE_URL" -c "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'ai_memories_source_check';"
```

Очікується `CHECK (source = ANY (ARRAY['digest','cofounder','product','profile']))`.

```bash
psql "$DATABASE_URL" -c "INSERT INTO ai_memories (user_id, source, content) VALUES ('t','chat','x');"
```

Очікується `ERROR: new row violates check constraint "ai_memories_source_check"`.

Клік-through на вебі: Налаштування → «Що ШІ про тебе памʼятає» — у списку лишаються тільки чотири групи (Підсумок тижня, Співзасновник, Події застосунку, Профіль), жодного `chat` / `Фінік` / `Щоденник`.

## Ратифіковані рішення

1. **`chat` — без окремого конвеєра автовитягу** (2026-08-26, рішення власника). Закриває відкрите рішення №1 у бік «лишити явний шлях, але навчити модель ловити неявне». Факти й далі потрапляють у памʼять ЛИШЕ через інструмент [`remember`](../../../apps/server/src/modules/chat/toolDefs/memory.ts) → банк памʼяті профілю → [`profileMirror.ts`](../../../apps/server/src/modules/ai-memory/profileMirror.ts) → `ai_memories` з `source='profile'`. Окремий постобробник розмови, який сам витягує кандидатів у факти, **не будуємо**: ризик «запамʼятає зайве» з § Ризики оцінено дорожчим за виграш, а другий продюсер на ті самі факти довелося б ще й дедуплікувати проти банку профілю.

   Дірка, яку це лишає, названа явно: факт, сказаний мимохідь («я взагалі не їм глютен», «у мене травма коліна»), без слова «запамʼятай» не осідає ніде — ланцюг цілий, але стартує лише тоді, коли модель сама викликала `remember`. Лікування промптове, не конвеєрне: опис інструмента `remember` і відповідна секція [`SYSTEM_PREFIX`](../../../apps/server/src/modules/chat/toolDefs/systemPrompt.ts) мають ловити неявні твердження про користувача.

   Замір — блок `IMPLICIT_FACT_CASES` у [`tool-selection-eval.ts`](../../../apps/server/scripts/tool-selection-eval.ts): шість реплік, де факт конкурує зі звичайним проханням, і окремий підсумок `implicit remember: N/M` у звіті `pnpm --filter @sergeant/server eval:tools`. Без цього числа промптові правки непроверяємі — «стало краще» на око тут не працює.

### Замір 2026-08-27 (базова лінія, `--repeat=3`)

`pnpm --filter @sergeant/server eval:tools --models=<model> --repeat=3`, 18 кейсів × 3 прогони:

| Модель                                       | implicit remember | Загалом | Вигадані id |
| -------------------------------------------- | ----------------- | ------- | ----------- |
| `google/gemini-3.7-flash` (прод, перший хід) | **18/18**         | 53/54   | 0/54        |
| `anthropic/claude-haiku-4.5` (фолбек)        | **14/18**         | 48/54   | 2/54        |

**Висновок: промптова правка не потрібна.** Правило вже стоїть у `SYSTEM_PREFIX` («Якщо користувач каже щось важливе про себе … АВТОМАТИЧНО використай remember»), і на моделі, яка реально робить перший хід, воно спрацьовує в усіх 18 прогонах. Чіпати текст промпта заради цього — це інвалідація кеш-префікса і бамп версії (зараз v23) без вимірюваного виграшу.

Чотири промахи Haiku розкладаються на два різні: три — кейс «ціль ваги», де модель обрала `set_goal` замість `remember` (структурований дім для цілі є, але в `ai_memories` вона не потрапляє, тож для RAG-контексту невидима); один — «час тренувань», де модель написала «Запамʼятав» текстом, не викликавши інструмент. Другий — справжня дірка, але одна з вісімнадцяти на не-прод моделі.

## Критерії DONE

- [ ] `ALLOWED_MEMORY_SOURCES` містить рівно чотири значення, і кожне має продюсера в дереві.
- [ ] `sources.test.ts` падає, якщо додати значення без продюсера і без запису в `RESERVED_SOURCES`.
- [ ] `POST /api/ai-memory/ingest` не існує; жодного посилання на нього в коді й доках.
- [ ] Kill-switch націлений на `digest`, авто-фліп у `eval-rag.ts` працює, runbook описує актуальну назву.
- [ ] CHECK-констрейнт на проді звужений; замір `GROUP BY source` до міграції зафіксований у PR-3.
- [ ] Жоден UI-підпис, архітектурний опис чи ops-runbook не описує поведінки, якої немає в коді.
- [ ] Число `implicit remember: N/M` зафіксоване, і на його основі заведено окремий таск.
- [ ] `pnpm check` зелений.

## Ризики

| Ризик                                                            | Мітигація                                                                                                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| На проді є рядки з мертвим `source`, і DELETE забирає щось цінне | Замір `GROUP BY source` **до** PR-3 — обовʼязковий крок, результат у тілі PR. Нулі підтверджують безпеку; ненулі founder переглядає вручну.   |
| Перейменування env-змінної тихо вмикає ingest на проді           | Дефолт `boolFromEnv(true)` явно описаний у PR-2; операторський крок «перевірити поточне значення» стоїть **перед** мержем.                    |
| Між PR-1 і PR-2 kill-switch не має цілі                          | Один PR у вікні. Гейт і сьогодні no-op (душить джерело, яке нічого не пише), тож фактичного регресу немає.                                    |
| Прибрали `chat`, а потім вирішили робити автовитяг               | Повернення — той самий двофазний шлях, що описаний у docstring `ALLOWED_MEMORY_SOURCES`. Ціна повернення нижча за ціну шести мертвих значень. |
| Видалення ендпоінта ламає зовнішнього клієнта                    | Клієнтів немає: `grep` по `apps/web` не знаходить жодного POST на цей маршрут, у `packages/api-client` його теж нема.                         |

## Посилання

- PR [#826](https://github.com/SkOrDs-02/sergeant/pull/826) — подання списку памʼяті. Симптом закрито там; причина — тут.
- [`docs/02-engineering/architecture/ai-memory.md`](../../02-engineering/architecture/ai-memory.md) — архітектура ingest / recall / backfill.
- [`docs/01-product/launch/tech/ai-memory-activation.md`](../../01-product/launch/tech/ai-memory-activation.md) — runbook увімкнення на проді.
- [`docs/01-product/model/hub-coach.md`](../../01-product/model/hub-coach.md) — продуктовий канон AI-шару (D5/G3: памʼять, якої не видно, юзер не контролює).
- [`docs/90-work/audits/product-knowledge-hub-coach.md`](../audits/product-knowledge-hub-coach.md) — напруга 4 (замикання AI-шару на власний вихід).
