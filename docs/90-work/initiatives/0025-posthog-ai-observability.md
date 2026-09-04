# 0025 — PostHog AI Observability для AI-шару (traces + evals)

> **Last touched:** 2026-09-03 by @claude (Фаза 1 реалізована — `posthogAi.ts`, тумблер `POSTHOG_AI_OBSERVABILITY_KEY`). **Next review:** 2027-03-14.
> **Status:** In progress (2026-09-03) — Фаза 1 у коді (див. § Прогрес), Фаза 2 не почата. Фази 1–2 виконуються без рішень власника; Фаза 3 (LLM-judge evals) чекає рішень — див. § Відкриті рішення.
> **Agent-ready:** yes
> **Priority:** P2 (не блокер launch-у [0010](https://github.com/SkOrDs-02/sergeant/blob/625921e85c7e961883d4cca64d9f6a177dbba823/docs/90-work/initiatives/0010-revenue-first-launch.md); без цього AI-шар лишається чорною скринькою на рівні розмов — дебаг скарг і контроль якості коуча зараз неможливі)
> **Owner:** `@SkOrDs-02`
> **ETA:** Фаза 1 ≈ 0.5 спринту; Фаза 2 ≈ 0.5 спринту; Фаза 3 — після рішень власника
> **Sources:**
>
> - Розвідка екосистеми 2026-08-25 (ця сесія): PostHog перейменував LLM Analytics на AI Observability, додав evals на live-трафіку (LLM-as-a-judge / Hog / sentiment), anomaly alerts і кластеризацію трейсів; перші 100k AI-івентів/міс безкоштовні, окремий білінг від product analytics.
> - Доки: [AI Observability](https://posthog.com/docs/ai-observability), [manual capture](https://posthog.com/docs/ai-observability/installation/manual-capture), [privacy mode](https://posthog.com/docs/ai-observability/privacy-mode), [AI Evals](https://posthog.com/docs/ai-evals).
> - Код: [`apps/server/src/lib/anthropic.ts`](../../../apps/server/src/lib/anthropic.ts) (центральний fetch-клієнт, `recordUsage`/`recordStreamUsage`), [`apps/server/src/lib/anthropicUsageStore.ts`](../../../apps/server/src/lib/anthropicUsageStore.ts) (DB-ledger `ai_usage_daily`, ініціатива 0019), [`apps/server/src/lib/llm/provider.ts`](../../../apps/server/src/lib/llm/provider.ts), [`apps/server/src/modules/chat/chatStream.ts`](../../../apps/server/src/modules/chat/chatStream.ts).

## TL;DR

AI-шар (HubChat, weekly digest, vision-аналіз чеків і їжі) сьогодні спостережуваний лише **агрегатами**: Prometheus-метрики + DB-ledger `ai_usage_daily` (ініціатива 0019) відповідають на «скільки токенів і грошей за день», але не на «що сталося в конкретній розмові», «чи не деградувала якість відповідей після зміни промпту» і «чи AI-фічі впливають на retention». PostHog — уже в стеку (EU cloud, той самий проєкт, що й продуктова аналітика) — має окремий продукт **AI Observability**: trace-дерево розмови з tool-викликами, дашборд cost/latency/TTFT, anomaly alerts і **evals на живому трафіку** (LLM-as-a-judge, безкоштовні Hog-перевірки і sentiment) з авто-звітами. План: слати `$ai_generation`/`$ai_span` події **вручну з центрального клієнта** `lib/anthropic.ts` — ми на raw `fetch` (з OpenRouter-транспортом), тож drop-in wrapper `@posthog/ai/anthropic` не застосовний, а ручний капчур дає одну точку інтеграції на всі AI-шляхи. Privacy-first за конструкцією: **контент промптів/відповідей не відправляється взагалі** — лише метадані (модель, токени, кеш, кост, латентність, назви tool-ів).

## Чому зараз

1. **Дебаг скарг неможливий.** Коли коуч відповів дивно, сьогодні немає жодного місця, де видно ланцюжок «запит → tool-виклики → відповідь» конкретної розмови. Ledger 0019 бачить тільки суми.
2. **Якість ніяк не вимірюється.** Зміни системних промптів (`SYSTEM_PROMPT_VERSION` уже трекається в cache-hit метриці) виїжджають у прод без жодного сигналу «стало краще чи гірше». Evals на 5–10% семплі — найдешевший спосіб це побачити.
3. **Дешево саме зараз.** Перші 100k AI-івентів/міс безкоштовні — на поточному масштабі це $0; інтеграція — одна точка в `anthropic.ts`, куди вже стікаються всі виклики з `usage`, `model`, `endpoint`, `userId` і кост-оцінкою `estimateAnthropicCostUsd`.
4. **Зв'язка з продуктовою аналітикою.** AI-івенти живуть поряд зі звичайними подіями PostHog → можна відповісти на питання «чи користувачі, що говорять з коучем, ретейняться краще» без нового вендора (LangSmith/Braintrust не потрібні).

## Скоуп

**In:**

1. `$ai_generation` з обох шляхів центрального клієнта (`anthropicMessages` + `anthropicMessagesStream`), включно з OpenRouter-транспортом (поле `$ai_provider`).
2. Прошивка `traceId` через chat tool-loop (`$ai_span` на tool-виклики) і batch-джоби (digest) — щоб розмова/прогін читались одним деревом.
3. Privacy-режим за замовчуванням: без `$ai_input` / `$ai_output_choices` на всіх шляхах.
4. Evals у PostHog UI: sentiment + Hog-перевірки одразу; LLM-judge — після рішень власника.
5. Дашборд cost/latency per feature + anomaly alerts.

**Out:**

- **Заміна `ai_usage_daily`.** DB-ledger 0019 лишається source of truth для білінгу/quota (`aiQuota.ts`, budget-alert). PostHog — спостережуваність, не облік.
- **Відправка контенту розмов/чеків.** Фінансові й харчові дані не покидають сервер; якщо колись знадобиться контент для judge-evals — окреме рішення власника (Фаза 3) на вузькому не-чутливому семплі.
- **Frontend-зміни.** Зв'язка з session replay (`$session_id` з `posthog-js`) — опційний follow-up, не в базовому скоупі.
- **Заміна Prometheus/Grafana-метрик** — вони лишаються для SLO/алертингу інфрарівня.

## Контракт даних (нормативний для всіх фаз)

Знахідка ревʼю PR #857: правила ідентичності й складу даних мають бути явними, а не «мається на увазі». Фіксуємо:

**Ідентичність.** `distinctId` = Better Auth opaque userId — **свідомий** лінк «людина ↔ AI-використання»: той самий проєкт PostHog уже повʼязує цього ж userId з продуктовими подіями, тож нового класу лінкування не зʼявляється; без userId (системні джоби) — константний `server`. AI-івенти підпадають під наявний GDPR-шлях видалення користувача (модуль `gdpr`) так само, як решта PostHog-подій цього distinctId.

**Allowlist властивостей** (вичерпний; нове поле = правка цієї секції у тому ж PR): `$ai_model`, `$ai_provider`, лічильники токенів (input/output/cache_read/cache_creation), кост USD з `estimateAnthropicCostUsd`, `$ai_latency`, `$ai_is_error`/`$ai_http_status`, `$ai_trace_id`/`$ai_span_id`/`$ai_parent_id`, `$ai_span_name` = **імʼя** tool-а з реєстру (не аргументи), `feature` = значення `endpoint`, `job` для batch-джоб, `SYSTEM_PROMPT_VERSION`.

**Deny-list** (не потрапляє ніколи, незалежно від флагів): текст повідомлень і відповідей (`$ai_input`, `$ai_output_choices`), аргументи й результати tool-викликів (`$ai_input_state`/`$ai_output_state` лишаються порожніми у Фазі 2 — доки власник явно не затвердить санітизований піднабір), **бізнес**-суми/баланси/валюти користувача (єдине дозволене фінансове поле — телеметрійний кост виклику в USD з `estimateAnthropicCostUsd` з allowlist-у вище; грошові дані самого користувача — ніколи), назви контрагентів і мерчантів, назви страв і нутрієнти, OCR-текст і зображення чеків, email/імена. Канонічний перелік чутливих полів — той самий, що в pino-redaction (Hard Rule #21, `llmRedaction.ts`): розширення redaction-списку = перевірка цієї секції.

**Enforcement.** Капчур іде через єдиний хелпер у `anthropic.ts`, який приймає лише поля allowlist-у (типізований обʼєкт, без spread довільних властивостей) — щоб deny-list тримався конструкцією, а не дисципліною; unit-тест фіксує, що хелпер відкидає невідомі ключі.

## План змін

### Фаза 1 — `$ai_generation` з центрального клієнта (без рішень)

Поверхня: `apps/server` (скіл `sergeant-server-api`).

- `pnpm add posthog-node` у `apps/server`; singleton-клієнт (host `https://eu.i.posthog.com`, ключ — новий server-side env через Coolify, **не** `VITE_*`; зафіксувати в [`feature-flags.md`](../../02-engineering/architecture/feature-flags.md) і `env.ts` за патерном single-source).
- У `recordUsage`/`recordStreamUsage` ([`anthropic.ts`](../../../apps/server/src/lib/anthropic.ts)) — поряд з наявним записом у Prometheus і ledger — `posthog.capture({ event: "$ai_generation", ... })`: `$ai_model`, `$ai_provider` (`anthropic`/`openrouter` з `transport`), `$ai_input_tokens`, `$ai_output_tokens`, `$ai_cache_read_input_tokens`, `$ai_cache_creation_input_tokens`, `$ai_latency`, `$ai_is_error`/`$ai_http_status`, кост із `estimateAnthropicCostUsd`, властивість `feature` з `endpoint` (chat/digest/vision-*). `distinctId` = наявний `userId` (Better Auth opaque string), без userId — системний `server`.
- **Без контенту**: `$ai_input`/`$ai_output_choices` не заповнюються ніколи (privacy-first за конструкцією, узгоджено з Hard Rule #21 і `llmRedaction.ts`).
- **Fail-open** як у ledger: помилка PostHog глушиться `logger.warn`, виклик Anthropic не ламається.
- Graceful shutdown сервера → `posthog.shutdown()`; для одноразових процесів (migrate-style джоби, якщо колись слатимуть) — `flush()`.

#### Прогрес Фази 1 (2026-09-03)

- [x] `posthog-node@5.51.6` (exact) у `apps/server`; singleton у [`apps/server/src/lib/posthogAi.ts`](../../../apps/server/src/lib/posthogAi.ts): EU host (`POSTHOG_HOST` або `https://eu.i.posthog.com`), `disableGeoip`, `privacyMode`, без autocapture; слухач `error` SDK → `logger.warn`.
- [x] Тумблер — серверний env `POSTHOG_AI_OBSERVABILITY_KEY` (ingestion key; задано → увімкнено). Зафіксовано в `env/env.ts`, [`feature-flags.md § 3.3`](../../02-engineering/architecture/feature-flags.md#33-інфраструктура-і-спостережуваність), [`env-vars.md § 14`](../../02-engineering/integrations/env-vars.md#14-posthog-product-analytics), [`observability/env-vars.md`](../../03-operations/observability/env-vars.md).
- [x] `$ai_generation` з `recordUsage` (non-stream, з латентністю і `$ai_http_status`), з `recordAnthropicUsage(..., meta)` для стріму (chat передає `provider`/`elapsedMs` з `AnthropicStreamResult`), на всі помилки клієнта (`$ai_is_error`, статус для HTTP-помилок; timeout/мережа — без статусу), і з `recordOpenRouterUsage` у `lib/llm/provider.ts` (`$ai_provider=openrouter`, без латентності — цей шар її не міряє).
- [x] Enforcement § «Контракт даних»: `captureAiGeneration` приймає типізований `AiGenerationEvent`, `buildAiGenerationProperties` збирає властивості явним перелічуванням; unit-тест фіксує, що `$ai_input`/`$ai_output_choices`/бізнес-поля відкидаються.
- [x] Fail-open на всіх шляхах (`posthogAi.test.ts`, `anthropic.test.ts`); graceful shutdown → `shutdownPostHogAi(2000)` після Sentry-flush в `index.ts`; `flushPostHogAi()` для одноразових процесів.
- [ ] Перевірка на живих подіях у PostHog після деплою з ключем (критерій DONE #3) — операторська дія.
- Відхилення від плану: `$ai_trace_id` у Фазі 1 — випадковий UUID per-call (PostHog вимагає поле для групування); стабільний id розмови/прогону приходить у Фазі 2 через `AnthropicCallOptions.traceId`.

### Фаза 2 — Trace-дерево: tool-loop, digest, vision

- Новий опційний параметр `traceId` в `AnthropicCallOptions`; chat-шлях передає стабільний id розмови/повідомлення, digest — id прогону, vision — id обробки чека/фото.
- У tool-execution loop чату — `$ai_span` на кожен tool-виклик (`$ai_span_name` = імʼя tool-а, latency, is_error; `$ai_input_state`/`$ai_output_state` — **тільки санітизовані** метадані або нічого).
- Дашборд у PostHog: cost/latency/error-rate за `feature` і моделлю; anomaly alerts на спайки cost/latency/errors.

### Фаза 3 — Evals (потребує власника)

- Sentiment eval на chat-трафіку (100%, безкоштовно, локальна модель) + Hog-перевірки формату — вмикаються одразу після Фази 1, без ключів.
- LLM-judge (Helpfulness/Hallucination або кастомний промпт): потребує окремого Anthropic API-ключа в PostHog Settings → AI Observability і **рішення власника** щодо не-privacy семплу (judge не бачить відповіді, якщо контент не відправляється — див. § Відкриті рішення).
- Авто-звіти evals на email + anomaly alert на падіння pass rate.

### Фаза 4 (опційна) — Session replay зв'язка

`posthog-js` на фронті вже є: прокинути `$session_id` у запит `/api/chat` → у `posthogProperties`. Дає перехід «трейс розмови → відеозапис сесії». Окремий маленький PR, коли Фази 1–2 доведені.

## Критерії DONE

- [ ] Кожен Anthropic/OpenRouter-виклик сервера видно в PostHog як `$ai_generation` з моделлю, токенами (вкл. cache), костом, латентністю і `feature`; помилки — з `$ai_is_error`.
- [ ] Розмова HubChat читається одним trace-деревом (generation + tool-спани); digest-прогін — одним трейсом.
- [ ] У жодному AI-івенті немає контенту промптів/відповідей/чеків — перевірено на живих подіях у PostHog.
- [ ] Дашборд cost/latency per feature існує; щонайменше один anomaly alert увімкнено.
- [ ] Sentiment + щонайменше один Hog-eval активні; по LLM-judge зафіксоване рішення власника (увімкнено на семплі / відкладено).
- [ ] Ledger `ai_usage_daily` і Prometheus-метрики не змінені (PostHog — додатковий sink, не заміна).
- [ ] `pnpm check` зелений.

## Відкриті рішення (потрібен власник)

1. **LLM-judge і контент.** Privacy-режим ховає input/output від judge. Варіанти: (а) залишити тільки sentiment+Hog (нуль контенту назовні); (б) дозволити контент для вузького семплу не-фінансових флоу (напр. small-talk чату) — тоді потрібен окремий judge-ключ і фіксація семплу; (в) відкласти.
2. **Session replay зв'язка (Фаза 4)** — вмикати чи ні: це додає видимість поведінки користувача навколо розмови, але й новий шлях даних фронт→бек.
3. **Квота подій.** На free tier 100k/міс; якщо vision-шляхи (чеки Silpo батчами) почнуть генерувати великі обсяги — вирішити, чи семплити `$ai_generation` для vision.

## Ризики

| Ризик                                                            | Мітигація                                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Подвійний облік коштів: PostHog-числа розійдуться з ledger 0019. | Ledger — source of truth; у PostHog слати кост із того самого `estimateAnthropicCostUsd`, розбіжності трактувати як спостережуваність, не білінг.           |
| Витік чутливого контенту в аналітику.                            | Контент не відправляється за конструкцією (поля не заповнюються); ревʼю PR-ів Фаз 1–2 через `sergeant-security-audit`-оптику; перевірка живих подій у DONE. |
| PostHog-збій ламає AI-виклики.                                   | Fail-open (`logger.warn`), як уже зроблено для ledger; capture — після відповіді Anthropic, не на hot path.                                                 |
| Події губляться в batch-джобах.                                  | `shutdown()`/`flush()` наприкінці процесу; перевірити digest-джобу окремо.                                                                                  |
| Обсяг подій виходить за free tier.                               | 1 повідомлення ≈ 1 generation + N спанів; моніторити usage у PostHog billing; за потреби семплити спани, залишаючи generations повними.                     |

## Посилання

- [`docs/90-work/initiatives/0024-ai-memory-source-coverage.md`](./0024-ai-memory-source-coverage.md) — суміжна ініціатива по AI-шару (памʼять); трейси з 0025 покажуть, що реально потрапляє в RAG-контекст.
- Ініціатива 0019 (AI cost tracking) — ledger `ai_usage_daily`, який лишається source of truth для витрат: [`anthropicUsageStore.ts`](../../../apps/server/src/lib/anthropicUsageStore.ts).
- [PostHog AI Observability docs](https://posthog.com/docs/ai-observability) · [AI Evals](https://posthog.com/docs/ai-evals) · [privacy mode](https://posthog.com/docs/ai-observability/privacy-mode) · [pricing](https://posthog.com/ai-observability).
- [`docs/01-product/model/hub-coach.md`](../../01-product/model/hub-coach.md) — продуктовий канон AI-шару.
