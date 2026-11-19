# Нові моделі OpenRouter проти наших LLM-пайплайнів

> **Last touched:** 2026-11-19 by @claude (§ 6.4 глибина синтезу, наступник flash-lite, постачальник Free-синтезу і рішення власника; створено за запитом власника; § 6 із заміром першого зрізу і тим, що зроблено за результатами; § 6.1 спроба підлаштувати промпт під Haiku 5.5; § 6.2 замір синтезу без 4-бітних ендпойнтів і рішення власника (б) для всіх запитів; § 6.3 повний замір Haiku 5.5 на виправленій фікстурі, промпт відкочено до v27). **Next review:** 2026-11-26 (перегляд маршрутизації моделей, ADR-0087).
> **Status:** Reference - дослідження під рішення, не рішення; заміна моделі потребує рішення власника і заміру за § 4

**Навіщо цей файл.** Запит власника 2026-11-19: подивитись нові моделі на OpenRouter і чи немає серед них претендентів на заміну наших моделей у пайплайнах, особливо дешевих і розумних. Каталог знято наживо 2026-11-19; код читано на коміті `ebe1178` гілки `claude/awesome-goodall-8s5uky` (до вливання `main`).

Джерела: живий каталог `models.json` (480 моделей, знято 2026-11-19), `GET /api/v1/models/<id>/endpoints` для 25 моделей (відповідав, але поля `latency_last_30m` / `throughput_last_30m` порожні в усіх 25, тож латентність провайдерів з OpenRouter узяти не вдалося), `GET /api/v1/providers` (штаб-квартири), веб-пошук. Код читано з чистого чекаута гілки (HEAD `ebe1178`, 2026-11-18). Платних прогонів не було.

Рівні певності: **[З]** заміряно незалежно (джерело), **[В]** заявлено вендором або взято з каталогу, **[?]** невідомо. Наші власні заміри з коду й доків позначено **[Н]**.

Розміри типового запиту взято з `docs/work/specs/planning/model-eval-2026-08-25.md` (колонки in/out для flash-lite) і з коду; для чату це оцінка (перший хід ~15k вх. / ~0,8k вих., синтез ~9k / ~1k). Reasoning-токени в оцінку вартості НЕ входять: де модель міркує обовʼязково, реальна ціна вища.

---

## 0. Головні знахідки поза «яку модель взяти»

1. **Жоден запит не задає `provider`-преференцій** (ні `data_collection: "deny"`, ні `zdr`, ні `order`/`only`, ні `quantizations`). `git grep "data_collection|zdr|allow_fallbacks|require_parameters"` по `apps/server/src` порожній. Отже OpenRouter сам розподіляє трафік між усіма ендпойнтами моделі, переважно за ціною. Для `z-ai/glm-5.2` це 33 ендпойнти, серед них fp4-квантизовані й з дивними цінами (Relace fp4 $0.007/$7.98, Wafer fp4), для `deepseek/deepseek-v4-flash` 15 (fp4/fp8, Relace, Venice, Baidu, SiliconFlow). Для фінансів і даних здоровʼя це питання і приватності (провайдер може зберігати/тренуватись, якщо на рівні акаунта OpenRouter це не заборонено, а акаунт-налаштування з репо не видно — **[?]**), і якості: заміри 2026-08/09 могли потрапити на одних провайдерів, а прод на інших. Механізм є: `provider.data_collection="deny"` і `provider.zdr=true` **[В]** ([docs](https://openrouter.ai/docs/guides/routing/provider-selection.md), [ZDR](https://openrouter.ai/docs/guides/features/zdr.md)). Будь-яка заміна моделі має йти разом із цим рішенням.
2. **`google/gemini-2.5-flash-lite` — шість пайплайнів на моделі наприкінці життя.** На OpenRouter у неї лишились лише ендпойнти Google AI Studio (3 шт., priority-ендпойнт uptime 41% за добу), Vertex зник. За повідомленнями, на Vertex її знято 2026-10-20; для Gemini API дату не оголошено, джерела суперечать одне одному **[В/?]** ([developersdigest](https://www.developersdigest.tech/blog/vertex-ai-shutdowns-october-2026), [форум Google](https://discuss.ai.google.dev/t/gemini-2-5-flash-lite-retirement-date-different-for-gemini-api-vs-vertex-ai/177897)). У каталозі `expiration_date` = null. Наслідок: шукати наступника для flash-lite-шляхів треба зараз, навіть якщо економії не буде.
3. **Таблиця цін `aiPricing.ts` розійшлась із каталогом**: `gemini-3.7-flash` 0.38/1.88 у коді (`lib/aiPricing.ts:149`) проти 0.75/3.75 у каталозі (0.375/1.875 — це ціна flex-ендпойнта, на який ми без `service_tier: "flex"` не потрапляємо); `deepseek-v4-flash` 0.04/0.08 (`:161`) проти 0.09/0.18; `glm-5.2` 1.40/4.40 (`:167`) проти 0.62/2.42 у каталозі. Вартість у леджері береться з `usage.cost`, тож таблиця — запасний шлях, але оцінки й бюджетні гарди на ній можуть бути хибні.
4. **Синтез і standard-тир міркують на дефолті шлюзу «high»**: каталог для `glm-5.2` і `deepseek-v4-flash` дає `default_effort: high`, а глибину ми задаємо лише першому ходу (`CHAT_FIRST_TURN_REASONING_EFFORT`). Це важіль латентності, не повʼязаний із заміною моделі.

---

## 1. Інвентар: пайплайн → модель → ціна → вимоги

Ціни — каталог OpenRouter, $ за 1M токенів вх./вих. (список; у дужках дешевший tier, якщо є). «Fallback» усюди один механізм: `getLLMProvider()` загортає OpenRouter у `FallbackProvider` → прямий Anthropic, якщо `LLM_FALLBACK_ENABLED=true` і є `ANTHROPIC_API_KEY` (`lib/llm/provider.ts:792-830`); чатові й зорові шляхи (`anthropicMessages` з `allowOpenRouter`) натомість мають ретрай, а не крос-провайдерний фолбек. Маскування PII (клас А: пошта, телефон, IBAN, картка, ІПН; клас Б: імʼя контрагента) — `lib/llmRedaction.ts:1-36`, єдина точка для коуча/дайджесту/категоризації/Mono в `provider.ts` (докстрінг «Маскує промпт перед відправкою…»); чат маскує `maskMachineText` (`modules/chat/chat.ts:518`). Згода на дані здоровʼя (`health_data_consent`) гейтить медичні рядки в памʼяті та інструменти (`modules/ai-memory/consent.ts:49`, `chat.ts` `healthConsent` у `buildToolsPayload`).

| Пайплайн                                                                            | Поточна модель (OpenRouter id)       | Ціна вх./вих.                | Чим задається (file:line)                                                                                                                                                                                                                                        | Що потрібно від моделі                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Чат, перший хід (JSON і стрім)                                                      | `google/gemini-3.7-flash`            | 0.75/3.75 (flex 0.375/1.875) | `CHAT_MODEL_FIRST_TURN` ← `env/chatModels.ts:142`, `env/env.ts:131`; глибина `CHAT_FIRST_TURN_REASONING_EFFORT=low` `env/aiRoutingEnv.ts:124`; payload `modules/chat/chat.ts:712-737` (max_tokens 1500)                                                          | Anthropic Messages `/api/v1/messages`; ~78 інструментів (вибір 1 з реєстру, багатоходовість до 3 ходів), стрім із `tool_use`, reasoning (low), укр. текст; ~10,5-18k статичного префіксу (кеш через шлюз суперечливий); бюджет спроби 12 с, стеля 30 с (`chat.ts:91,98`), ціль «перший токен < 1,5 с», факт ~2,8-3,8 с медіана |
| Чат, синтез premium-тир                                                             | `z-ai/glm-5.2`                       | 0.62/2.42 (Z.AI 1.40/4.40)   | `CHAT_MODEL_SYNTHESIS` ← `chatModels.ts:145`, `env.ts:133`, тир `modules/chat/aiQuotaTierModels.ts:86`                                                                                                                                                           | Стрім тексту (markdown-таблиці укр.), max_tokens 2500 + авто-continuation (`chat.ts:526-545`), лише згадані tool-визначення, глибина аналізу (ловити розбіжність сум); reasoning не задаємо → дефолт шлюзу high                                                                                                                |
| Чат, синтез standard-тир (і Free/анон)                                              | `deepseek/deepseek-v4-flash`         | 0.09/0.18                    | `AI_PRO_STANDARD_CHAT_MODEL` ← `chatModels.ts:147`, `env.ts:255`, `aiQuotaTierModels.ts:110`                                                                                                                                                                     | те саме, що синтез; відомий товстий хвіст латентності p95 18 с **[Н]**                                                                                                                                                                                                                                                         |
| Чат, floor-тир                                                                      | `google/gemini-3.7-flash`            | 0.75/3.75                    | `AI_PRO_FLOOR_CHAT_MODEL` ← `chatModels.ts:170`, `env.ts:257`, `aiQuotaTierModels.ts:123`                                                                                                                                                                        | стрім + інструменти без зривів (flash-lite давав 9/12 зривів **[Н]**)                                                                                                                                                                                                                                                          |
| Коуч, premium                                                                       | `anthropic/claude-sonnet-4.6`        | 3/15                         | `OPENROUTER_COACH_MODEL` `aiRoutingEnv.ts:86`, `aiQuotaTierModels.ts:106`; фолбек `COACH_MODEL_ANTHROPIC` `env.ts:727`                                                                                                                                           | Непотоковий текст укр., maxTokens 300, **таймаут 20 с** (`modules/chat/coach.ts:606-622`), без markdown, «голос»; reasoning-моделі тут уже вбивали таймаут (B37)                                                                                                                                                               |
| Коуч, standard + floor                                                              | `google/gemini-3.5-flash-lite`       | 0.30/2.50 (flex 0.15/1.25)   | `AI_PRO_STANDARD_COACH_MODEL` / `AI_PRO_FLOOR_COACH_MODEL` `aiQuotaTierModels.ts:120,125` (увага: zod-дефолт у `env.ts:259-263` досі `gemini-2.5-flash-lite`, тир-таблиця читає `process.env` з іншим fallback-ом)                                               | те саме; модель міркує обовʼязково (default `minimal`)                                                                                                                                                                                                                                                                         |
| Тижневий дайджест                                                                   | `google/gemini-2.5-flash-lite`       | 0.10/0.40 (flex 0.05/0.20)   | `OPENROUTER_DIGEST_MODEL` `aiRoutingEnv.ts:63`; фолбек `DIGEST_MODEL=claude-sonnet-4-6` `env.ts:731`; виклик `modules/digest/weekly-digest.ts:514-530`                                                                                                           | Непотоковий JSON-звіт укр. (парситься, є шаблон-фолбек), maxTokens 2500, таймаут 45 с; викликається з HTTP-запиту (не нічний батч); ~1,2k вх. / ~0,7-0,8k вих.                                                                                                                                                                 |
| Категоризація транзакції (internal)                                                 | `google/gemini-2.5-flash-lite`       | 0.10/0.40                    | `OPENROUTER_READONLY_MODEL` `aiRoutingEnv.ts:62`; фолбек `CLASSIFY_MODEL=claude-haiku-4-5` `env.ts:733`; `routes/internal/categorize.ts:161-171`                                                                                                                 | Класифікація в категорію, maxTokens 120, 15 с; ~300 вх. / ~15 вих.                                                                                                                                                                                                                                                             |
| Mono-збагачення (батч MCC)                                                          | `google/gemini-2.5-flash-lite`       | 0.10/0.40                    | `OPENROUTER_MONO_MODEL` `aiRoutingEnv.ts:88`; фолбек `MONO_ENRICHMENT_MODEL` `env.ts:735`; `modules/mono/batchEnrichmentWorker.ts:132-170`                                                                                                                       | JSON-масив `{i,c,conf}` до 100 позицій, maxTokens ≤2000, 60 с, фоновий тік ~1 год                                                                                                                                                                                                                                              |
| Нутриція текст: day-plan, week-plan, shopping-list, recommend-recipes, parse-pantry | `google/gemini-2.5-flash-lite`       | 0.10/0.40                    | `OPENROUTER_NUTRITION_MODEL` `aiRoutingEnv.ts:87`; фолбек `NUTRITION_MODEL=claude-sonnet-4-6` `env.ts:729`; `modules/nutrition/day-plan.ts:255-262`, `week-plan.ts:145-152`, `shopping-list.ts:171-178`, `recommend-recipes.ts:148-155`, `parse-pantry.ts:76-87` | Структурований JSON у тексті (без `response_format`), укр., maxTokens 1200-2800; ~0,4-0,9k вх. / ~0,2-1,2k вих.                                                                                                                                                                                                                |
| Нутриція зір: analyze-photo, refine-photo                                           | `google/gemini-2.5-flash-lite`       | 0.10/0.40                    | `OPENROUTER_VISION_MODEL` `aiRoutingEnv.ts:104`, `VISION_VIA_OPENROUTER` `:161`; `modules/nutrition/visionTransport.ts:25`, `analyze-photo.ts:169,186`, `refine-photo.ts:160,177`                                                                                | Зір (фото їжі, етикетки), JSON, max 950-1000; ~1,4k вх. / ~0,2k вих.; 10/10 на пастках, а `gemini-3.1/3.5-flash-lite` 7/10 **[Н]**                                                                                                                                                                                             |
| Чек-скан (фото чека)                                                                | `google/gemini-2.5-flash-lite`       | 0.10/0.40                    | `OPENROUTER_RECEIPT_MODEL` `aiRoutingEnv.ts:96`; `modules/finyk/receipts/visionTransport.ts:36`, `visionClient.ts:69,90`                                                                                                                                         | Зір + JSON позицій, max_tokens 4000                                                                                                                                                                                                                                                                                            |
| Імпорт скриншота виписки                                                            | той самий `OPENROUTER_RECEIPT_MODEL` | 0.10/0.40                    | `modules/finyk/import/visionClient.ts:94,104,130`                                                                                                                                                                                                                | Зір + довгий JSON, max_tokens 8000, таймаут 45 с                                                                                                                                                                                                                                                                               |
| Суддя tool-eval (лише стенд)                                                        | `getLLMProvider` openrouter          | —                            | `src/scripts/toolEvalJudge.ts:84-116`                                                                                                                                                                                                                            | не прод                                                                                                                                                                                                                                                                                                                        |
| Транскрипція (поза OpenRouter)                                                      | Groq `whisper-large-v3-turbo`        | —                            | `env.ts:211`                                                                                                                                                                                                                                                     | не чіпаємо                                                                                                                                                                                                                                                                                                                     |
| Ембеддинги памʼяті (поза OpenRouter)                                                | Voyage `voyage-3.5-lite`             | —                            | `env.ts:611`                                                                                                                                                                                                                                                     | не чіпаємо                                                                                                                                                                                                                                                                                                                     |

**Коли востаннє переглядали маршрутизацію.** Git-історія стиснута імпортом репо (усі чотири файли маршрутизації мають один коміт `6c6c04d` 2026-10-23, крім `aiRoutingEnv.ts`: 2026-11-18, лише глибина міркувань). За коментарями й ADR: слоти чату й коуча вирішено 2026-08-26 ([ADR-0087](../../governance/adr/0087-model-tiering-measured.md), Next review 2026-11-26), перший хід перезаміряно 2026-09-19 (`chatModels.ts:113-141`), глибину першого ходу — 2026-11-18. Отже «нові» = вийшли після 2026-08-26; сюди потрапляє майже весь шортлист.

---

## 2. Кандидати по пайплайнах

Відсоток економії — на типовому запиті пайплайна за списковою ціною, без reasoning-токенів.

### 2.1 Перший хід чату (`gemini-3.7-flash`, ≈ $14,3 за 1k ходів при 15k/0,8k)

| Кандидат                                                           | Ціна                        | На 1k ходів | Економія                             | Чим кращий                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Ризик                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | --------------------------- | ----------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic/claude-haiku-5.5` (2026-10-07)                          | 0.10/0.50, кеш-читання 0.01 | ≈ $1,9      | **−87%** (з кешем префікса ще менше) | Anthropic-нативна модель на `/messages` — наш формат без «Skin»-перекладу; reasoning НЕобовʼязковий, є `none`/`low`; 5 провайдерів (Anthropic, Bedrock, Vertex, Azure, Claude Platform on AWS), uptime 100% **[В]**; ~237-243 ток/с, Intelligence Index 43 **[З] Artificial Analysis** ([AA release](https://artificialanalysis.ai/models/releases/claude-haiku-5-5), [The Batch](https://www.deeplearning.ai/the-batch/claude-fills-out-its-model-family/)) | Попередник haiku-4.5 давав 2 вигадані id на `eval:tools` **[Н]**; на AutomationBench 12,0% проти 30,4% у gemini-3.7-flash **[З] Zapier, частково видно** ([Zapier](https://zapier.com/benchmarks/claude-haiku5_5-report)); новий токенізатор дає ~+30% токенів **[В/преса]** ([braindetox](https://braindetox.kr/en/posts/claude_haiku_5_5_release_pricing_2026.html)); ціна 0.10/0.50 лише до 100k токенів промпту |
| `openai/gpt-6-luna` (2026-09-22)                                   | 0.10/0.50 (flex 0.05/0.25)  | ≈ $1,9      | **−87%**                             | Ціль «chat, classification, lightweight agentic» **[В]**; без міркувань TTFT 0,74 с на OpenAI **[З] AA** ([AA](https://artificialanalysis.ai/models/gpt-6-luna-non-reasoning)); 20,7% на AutomationBench (вище за Haiku 5.5) **[З] Zapier**; 4 провайдери (OpenAI, Azure, Bedrock)                                                                                                                                                                           | На high TTFT 18,6 с **[З] AA** — тільки `none`/`low`; Anthropic-сумісний `/messages` для OpenAI-моделі через шлюз ми ще не ганяли (форма `tool_use`, `output_config.effort`) **[?]**; якість укр. **[?]**                                                                                                                                                                                                           |
| `google/gemini-3.8-flash` (2026-09-02)                             | 0.825/4.125                 | ≈ $15,7     | **+10%**                             | Пряма наступниця; AA Index 52 (low) – 59 (high) за v4.2, за v4.3.2 33-41 **[З] AA, але цифри суперечливі** ([AA](https://artificialanalysis.ai/models/gemini-3-8-flash)); +12 п.п. на tool-use бенчі проти 3.7 **[преса]**                                                                                                                                                                                                                                   | Дорожча; reasoning обовʼязковий (low/medium/high); скарга на латентність і 503 в Antigravity **[анекдот]** ([форум](https://discuss.ai.google.dev/t/gemini-3-8-flash-in-antigravity-severe-latency-command-looping-quota-drain-api-503-billing-issues/183550)); flex-ендпойнт Vertex uptime 67% за добу                                                                                                             |
| (без зміни моделі) `gemini-3.7-flash` через `service_tier: "flex"` | 0.375/1.875                 | ≈ $7,1      | −50%                                 | Та сама модель                                                                                                                                                                                                                                                                                                                                                                                                                                               | Flex = нижчий пріоритет, вища латентність, без фолбеку на default **[В]** ([service tiers](https://openrouter.ai/docs/guides/features/service-tiers)); для інтерактиву не годиться, Vertex flex uptime 46% за добу                                                                                                                                                                                                  |

Висновок: **Haiku 5.5 і GPT-6 Luna — головні кандидати** (−87%). Обидва треба мірити, бо незалежних даних про вибір інструмента з ~78 і про вигадані id немає. `deepseek-v4.1-flash` (−95%) не ставлю: попередник уже знятий з першого ходу за хвостом латентності **[Н]**, а V4.1 має 39-50 ендпойнтів різної квантизації.

### 2.2 Синтез, premium-тир (`glm-5.2`, ≈ $8,0 за 1k при 9k/1k за каталожною ціною)

| Кандидат                                         | Ціна                                      | На 1k        | Економія          | Плюси                                              | Ризики                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ----------------------------------------- | ------------ | ----------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic/claude-haiku-5.5` (effort low/medium) | 0.10/0.50                                 | ≈ $1,4       | −82%              | Дешево, швидко, стрімить                           | Чи ловить «розбіжність у сумах» (єдина причина, чому glm-5.2 на premium) — **[?]**, мірити `eval:models --pipeline=analysis`                                                                                                                       |
| `openai/gpt-6-luna`                              | 0.10/0.50                                 | ≈ $1,4       | −82%              | те саме                                            | те саме                                                                                                                                                                                                                                            |
| `z-ai/glm-5.3` (2026-08-18)                      | 0.07/1.40 найдешевший fp4; Z.AI 1.40/4.40 | $2,0 – $17,0 | від −75% до +112% | Наступник 5.2; вендор: Terminal Bench вище **[В]** | Reasoning-only, вимкнути не можна; незалежно: латентність +15%, reasoning-токенів +13% до +100% проти 5.2 **[З] DataLLM Lab, мала вибірка** ([DataLLM](https://www.datallmlab.com/blog/glm-5-3-review.html)); 74,5 ток/с **[З] AA**; 49 ендпойнтів |

Гідної заміни «розумніше за ту саму ціну» не знайдено; є лише «дешевше, якщо не гірше» (Haiku 5.5 / Luna). Sonnet 5.5 (2/10) і GPT-6.1 Terra (1/5) дорожчі за glm-5.2 у 1,75-3,5 раза, а ADR-0087 § 2 прямо каже, що premium продає ліміти, не модель.

### 2.3 Синтез, standard-тир (`deepseek-v4-flash`, ≈ $0,99 за 1k)

| Кандидат                                           | Ціна                                              | На 1k         | Економія    | Примітка                                                                                                                                                                                                             |
| -------------------------------------------------- | ------------------------------------------------- | ------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `deepseek/deepseek-v4.1-flash-1017` (2026-10-17)   | 0.035/0.15 найдешевший; DeepSeek native 0.15/0.60 | $0,47 – $1,95 | −53% … +97% | Пряма наступниця, приймає зображення. Незалежних бенчів V4.1 немає **[?]** ([огляд](https://www.datalearner.com/en/ai-models/pretrained-models/deepseek-v4-1-flash)); 50 ендпойнтів fp4/fp8, частина з uptime 74-95% |
| `anthropic/claude-haiku-5.5` / `openai/gpt-6-luna` | 0.10/0.50                                         | ≈ $1,40       | **+41%**    | Не економія, а ліки від хвоста латентності (p95 18 с у deepseek **[Н]**)                                                                                                                                             |

Тут поточна модель уже дуже дешева; заміна виправдана лише за латентністю. Окремо: явний `reasoning: none/low` на поточній моделі може дати більше, ніж зміна моделі **[?]**.

### 2.4 Floor-тир чату (`gemini-3.7-flash`)

Ті самі кандидати, що для першого ходу: Haiku 5.5 / GPT-6 Luna, −85…−87%. Обовʼязково `eval:stream` (стрім + інструменти), бо саме тут flash-lite зривав 9/12 стрімів **[Н]**.

### 2.5 Коуч

- **Premium (`claude-sonnet-4.6`, ≈ $8,7 за 1k при 1,4k/0,3k):**
  - `anthropic/claude-sonnet-5.5` (2026-09-28): 2/10, ≈ $5,8, **−33%**, новіше покоління тієї ж родини, той самий голос. Ризик: reasoning обовʼязковий (low…max, дефолт high) при 20-с таймауті коуча; на low TTFT ≈ 1,05 с **[З] AA** ([AA](https://www.artificialanalysis.ai/models/releases/claude-sonnet-5-5)) — ставити тільки з явним `low`.
  - `anthropic/claude-haiku-5.5`: ≈ $0,29, −97%. Узгоджується з ADR-0087 («premium = ліміти, не модель»), але це вже продуктове рішення власника.
- **Standard/floor (`gemini-3.5-flash-lite`, ≈ $1,17 за 1k):**
  - `anthropic/claude-haiku-5.5` або `openai/gpt-6-luna`: ≈ $0,29, **−75%**; Haiku-родина вже обслуговувала коуча через фолбек, тож голос ближчий **[Н]** (за B37 / ADR-0087).
  - `gemini-3.5-flash-lite` через flex: −50% без зміни моделі; таймаут 20 с — ризик.
  - `gemini-2.5-flash-lite` (−78%) — НЕ радимо: відмовились від неї свідомо (голос) і вона на виході з каталогу.

### 2.6 Непотокові flash-lite-шляхи (дайджест, категоризація, Mono, нутриція, зір, чеки, імпорт)

Поточна `gemini-2.5-flash-lite` найдешевша з придатних; економії на заміні майже немає, але **потрібен наступник** (п. 0.2).

| Пайплайн                             | Кандидат 1                      | Кандидат 2                                                                                                                         | Дешевий варіант без зміни моделі |
| ------------------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Зір (фото їжі), чеки, імпорт виписок | `openai/gpt-6-luna` (+10…+17%)  | `anthropic/claude-haiku-5.5` (+10…+17%; haiku-4.5 давав 5/6 як flash-lite на зоровому стенді **[Н]**, `vision-eval-2026-08-25.md`) | —                                |
| Нутриція текст                       | `openai/gpt-6-luna` (+21%)      | `anthropic/claude-haiku-5.5` (+21%)                                                                                                | —                                |
| Категоризація                        | `openai/gpt-6-luna` (+4%)       | `deepseek/deepseek-v4.1-flash-1017` (−65%, але CN/fp4-провайдери, див. п. 0.1)                                                     | flash-lite flex −50%             |
| Mono-батч (фоновий)                  | `openai/gpt-6-luna` flex (−43%) | `anthropic/claude-haiku-5.5:batch` (−43%)                                                                                          | flash-lite flex −50%             |
| Дайджест                             | Luna flex (−41%)                | Haiku 5.5 (+18%)                                                                                                                   | flash-lite flex −50%             |

`gemini-3.1-flash-lite` (0.25/1.50, +200…+250%) і `gemini-3.5-flash-lite` уже провалили зоровий стенд 7/10 **[Н]** — не наступники для зору. Ризики Luna/Haiku тут: зір на укр. етикетках і JSON без `response_format` **[?]**, мірити `eval:vision` і `eval:models`.

### 2.7 `:free` і `:batch` окремо

- **`:free`** (`nvidia/nemotron-3.5-super-vl:free`, `particle-ai/particle-1:free`, `ling-3.2-flash:free`, `liquid/lfm-3-1.7b:free`, `inkling-2-small:free` — цей з `expiration_date` 2026-11-19, тобто сьогодні) — **не брати для продукту**: ліміти запитів, безкоштовні ендпойнти зазвичай логують/тренуються на запитах **[В/загальна політика OpenRouter]**, а в нас фінанси й здоровʼя.
- **`:batch`** ходить лише через `/api/v1/batches` (каталог: `endpoints: ["/api/v1/batches"]`) — асинхронно, у коді такого транспорту немає. Годиться лише для Mono-збагачення, якщо переписати воркер на «подати → забрати» (`claude-haiku-5.5:batch` 0.05/0.25, `gpt-6-luna:batch` 0.05/0.25, `glm-5.3-flash:batch` 0.024/0.069). **Дайджест сюди не підходить**: він генерується в HTTP-запиті користувача (`weekly-digest.ts:500-530`, `req`, таймаут 45 с), а не вночі. Для фону простіша альтернатива — `service_tier: "flex"` (−50%, той самий синхронний виклик).

---

## 3. Моделі, які НЕ варто брати, хоч вони й дешеві

- **`meta/muse-spark-1.x-contributor`** (0.10/0.20): «contributor tier» — опис натякає на використання даних; 1 провайдер. Для фінансів/здоровʼя — ні.
- **`meta/muse-ember`** (0.10/0.50): reasoning обовʼязковий з дефолтом `max` (каталог), 2 провайдери, незалежних бенчів tool calling немає ([cekura](https://www.cekura.ai/blogs/muse-ember-tool-calling-agents)) — ризик латентності на першому ході й таймауту коуча.
- **`z-ai/glm-5.3-flash`** (0.15/0.50) і `~z-ai/glm-flash-latest`: обовʼязкові міркування з дефолтом `max`, ~49 ток/с, «повільніша за всіх» **[З] AA / DataCamp** ([DataCamp](https://www.datacamp.com/blog/glm-5-3-flash)).
- **`minimax/minimax-m3.1-flash`**: обовʼязкові міркування, дефолт `max`.
- **`tencent/hy4-flash`** (0.035/0.14): один провайдер (Tencent, CN, fp8), даних немає.
- **`qwen/qwen3.8-flash`**: лише Alibaba (SG/CN), 2 ендпойнти; приватність для наших даних під питанням.
- **`moonshotai/kimi-k3`** (0.19/16,0) і `deepseek-v4-pro` (0.11/4.44): дешевий вхід, але дорогий вихід — оманливі «дешеві».
- **Будь-які `~…-latest` аліаси** (`~deepseek/deepseek-flash-latest`, `~openai/gpt-luna-latest`, `~z-ai/glm-latest`): тихо міняють модель, касети/baseline перестають щось означати.
- **`openrouter/auto*`** і `nvidia/switchyard`: модель обирає роутер, ціна в каталозі −1 (невідома).
- **`gemini-2.5-flash-lite` priority-ендпойнт** (uptime 41% за добу) і сама модель як «нова ставка» — на виході.
- **OpenAI gpt-5 / gpt-5-mini / gpt-5-nano / o3**: `expiration_date` 2026-12-11.
- **Дешеві fp4-ендпойнти** `glm-5.x` / `deepseek` з аномальними цінами (Relace $0.007/$7.98) — не модель, а ендпойнти; закривати через `provider.quantizations` / `ignore`.

---

## 4. План заміру на нашому харнесі (команди НЕ запускалися)

Усі команди з кореня репо, `OPENROUTER_API_KEY` у середовищі.

### 4.1 Вибір інструментів, перший хід (`eval:tools`)

```bash
# прод-глибина low; базова лінія = gemini-3.7-flash у тому ж прогоні
pnpm --filter @sergeant/server eval:tools --repeat=3 \
  --models=google/gemini-3.7-flash,anthropic/claude-haiku-5.5,openai/gpt-6-luna,google/gemini-3.8-flash
# без міркувань (Haiku і Luna приймають none; gemini-3.x відхилить, тому окремо)
pnpm --filter @sergeant/server eval:tools --repeat=3 --reasoning=none \
  --models=anthropic/claude-haiku-5.5,openai/gpt-6-luna
# «знайди, потім зміни ту»
pnpm --filter @sergeant/server eval:tools --follow-up --repeat=5 \
  --models=google/gemini-3.7-flash,anthropic/claude-haiku-5.5,openai/gpt-6-luna
# інʼєкції (бере лише першу модель зі списку — по одній)
pnpm --filter @sergeant/server eval:tools --injections --models=anthropic/claude-haiku-5.5
pnpm --filter @sergeant/server eval:tools --injections --models=openai/gpt-6-luna
```

Прапорця `--first-turn` у `eval:tools` немає: він уже міряє перший хід (`scripts/tool-selection-eval.ts:397-408` — `models`, `no-data`, `record`, `injections`, `follow-up`, `repeat`, `timeout`, `reasoning`, `only`).

Поріг «не гірше» (база `apps/server/src/__fixtures__/tool-eval/baseline.json`: gemini-3.7-flash, 73/84 correct, **0 invented**, multi-turn 5/6, argFailed 0): на кожен повтор correct ≥ 73/84 (не нижче за gemini-3.7-flash у тому ж прогоні мінус 1), **invented = 0 у всіх повторах** (FAKE гірший за MISS), multiTurnCorrect ≥ 5/6, timeouts 0, p95 ≤ 5,7 с і max ≤ 12 с (бюджет спроби). Для заміни — ще й `implicit remember` не нижче за базу.

### 4.2 Прод-форма стріму (обовʼязково за ADR-0087)

```bash
pnpm --filter @sergeant/server eval:stream --models=anthropic/claude-haiku-5.5,openai/gpt-6-luna,google/gemini-3.7-flash
pnpm --filter @sergeant/server eval:stream --first-turn --repeat=5 \
  --models=google/gemini-3.7-flash,anthropic/claude-haiku-5.5,openai/gpt-6-luna
pnpm --filter @sergeant/server eval:stream --first-turn --reasoning=none --repeat=5 \
  --models=anthropic/claude-haiku-5.5,openai/gpt-6-luna
```

Поріг: 0 зривів `stream closed before completion`; медіана «першого видимого знака» < 3,0 с (зараз 3,0-5,3 с, спека `hubchat-first-turn-stream.md` § Замір 2026-11-18); подивитись, чи з'являються cache-поля (для Haiku 5.5 мають).

### 4.3 Синтез і непотокові шляхи (`eval:models`, формат `--extra=pipeline:provider:model[:label[:effort]]`)

```bash
pnpm --filter @sergeant/server eval:models -- --repeat=3 --skip-unavailable \
  --pipeline=analysis,chat,coach-insight \
  --extra=analysis:openrouter:anthropic/claude-haiku-5.5:h55-low:low \
  --extra=analysis:openrouter:openai/gpt-6-luna:luna-low:low \
  --extra=analysis:openrouter:deepseek/deepseek-v4.1-flash-1017:ds41-none:none \
  --extra=coach-insight:openrouter:anthropic/claude-sonnet-5.5:s55-low:low \
  --extra=coach-insight:openrouter:anthropic/claude-haiku-5.5:h55-none:none \
  --extra=coach-insight:openrouter:openai/gpt-6-luna:luna-none:none
pnpm --filter @sergeant/server eval:models -- --repeat=3 --skip-unavailable \
  --pipeline=classify,digest,mono,day-plan,week-plan,shopping-list,recommend-recipes,parse-pantry \
  --extra=digest:openrouter:openai/gpt-6-luna:luna-none:none \
  --extra=digest:openrouter:anthropic/claude-haiku-5.5:h55-none:none \
  --extra=classify:openrouter:openai/gpt-6-luna:luna-none:none \
  --extra=mono:openrouter:openai/gpt-6-luna:luna-none:none \
  --extra=day-plan:openrouter:openai/gpt-6-luna:luna-none:none \
  --extra=recommend-recipes:openrouter:anthropic/claude-haiku-5.5:h55-none:none
```

(для решти нутриційних пайплайнів — аналогічні `--extra`). Поріг: на `analysis` — ловити розбіжність сум не гірше glm-5.2 (16/16 у серпні **[Н]**); на `coach-insight` — 8/8 і 0 порушень голосу, латентність ≪ 20 с; на фонових — та сама кількість ✅, що у flash-lite у тому ж прогоні.

### 4.4 Зір (`eval:vision`, формат `--extra=pipeline:openrouter:model[:label]`)

```bash
pnpm --filter @sergeant/server eval:vision -- --repeat=3 \
  --extra=analyze-photo:openrouter:openai/gpt-6-luna:luna \
  --extra=analyze-photo:openrouter:anthropic/claude-haiku-5.5:h55 \
  --extra=refine-photo:openrouter:openai/gpt-6-luna:luna \
  --extra=refine-photo:openrouter:anthropic/claude-haiku-5.5:h55
```

Поріг: 10/10 пасток, як flash-lite. Чек-скан і імпорт виписок у `eval:vision` не покриті — потрібен окремий кейс-сет перед заміною `OPENROUTER_RECEIPT_MODEL`.

### 4.5 Оцінка вартості (за списковими цінами, з запасом ×1,5 на reasoning)

- `eval:tools` ×3 повтори, ~95 викликів на модель на повтор, ~15k/0,8k: gemini-3.7-flash ≈ $4, gemini-3.8-flash ≈ $4,5, Haiku 5.5 ≈ $0,5, Luna ≈ $0,5 → перший блок ≈ **$10-14**; `--reasoning=none` ще ≈ $1; follow-up і injections ≈ $2-3.
- `eval:stream` (~15-20 викликів на модель): < $1.
- `eval:models` (два блоки, ×3): ≈ $1-3 (Sonnet 5.5 — основна частина).
- `eval:vision`: < $0,5.
- **Разом ≈ $15-25.**

### 4.6 Обовʼязково разом із заміною

- Додати модель у `lib/aiPricing.ts` (інакше бюджетний гвард її не бачить, B38) і виправити розійдені ціни (п. 0.3).
- Вирішити `provider: { data_collection: "deny" }` (і, можливо, `zdr: true`) для всіх запитів і перезапустити той самий набір замірів: множина провайдерів зміниться.
- Для Anthropic-моделей перевірити, що `cache_control` на префіксі першого ходу справді дає `cache_read` через шлюз.

---

## 5. Резюме

1. **Перший хід і floor чату: `gemini-3.7-flash` → `anthropic/claude-haiku-5.5` або `openai/gpt-6-luna`.** ≈ −87% вартості ходу ($14,3 → $1,9 за 1k), обидві підтримують `reasoning=none` і стрім з інструментами. Перевірити: 0 вигаданих id і ≥73/84 на `eval:tools` (haiku-4.5 вигадував id), 0 зривів на `eval:stream`, медіана першого знака < 3 с. Незалежних даних про tool-selection у них немає, лише заяви вендорів і AutomationBench (Luna 20,7%, Haiku 5.5 12,0%, gemini-3.7-flash 30,4%).
2. **Коуч: premium `sonnet-4.6` → `claude-sonnet-5.5` (effort low)**, −33%, та сама родина. Standard/floor `gemini-3.5-flash-lite` → Haiku 5.5 / Luna, −75%. Перевірити 20-с таймаут і голос на `coach-insight`.
3. **Наступник для `gemini-2.5-flash-lite` (6 шляхів: зір, чеки, імпорт, нутриція, дайджест, Mono, категоризація).** Економії не буде (+4…+21% на Luna/Haiku 5.5), зате зникне ризик відключення (Vertex уже без неї, на OpenRouter лишилась тільки AI Studio). Перевірити 10/10 на `eval:vision` і JSON на `eval:models`. Для фону (Mono, категоризація) `service_tier: "flex"` дає −50% без зміни моделі.
4. **До будь-якої заміни:** увімкнути `provider.data_collection: "deny"` (або ZDR) і обмежити квантизацію. Зараз glm-5.2 і deepseek ходять до 15-33 різних провайдерів, частина з них fp4 і з китайською юрисдикцією. Для фінансів і здоровʼя це головний ризик, і заміри без такого обмеження не відтворюють прод.
5. **Синтез premium (`glm-5.2`):** розумнішої заміни за ту саму ціну немає. `glm-5.3` повільніша, міркування вимкнути не можна. Haiku 5.5 / Luna (−82%) варто ставити лише якщо пройдуть пастку «розбіжність у сумах».

## Що не вдалося зʼясувати

- Латентність і пропускну здатність провайдерів з OpenRouter: поля `latency_last_30m` / `throughput_last_30m` порожні в усіх 25 відповідях ендпойнта.
- Політику зберігання й тренування окремих провайдерів: ні `/endpoints`, ні `/providers` її не віддають. Акаунт-налаштування приватності OpenRouter з репо не видно.
- Сторінки artificialanalysis.ai і zapier.com недоступні в мережі сесії; цифри з них узято лише з пошукових сніпетів. Щоб перевірити повні таблиці, ці хости треба дозволити.
- Якість української: незалежного бенчмарку, що порівнює Haiku 5.5, Luna, Gemini 3.8, DeepSeek V4.1 чи GLM 5.3 саме українською, не знайдено.
- Незалежних замірів tool calling для Haiku 5.5, Luna, DeepSeek V4.1 Flash і Muse Ember немає (крім агрегованого AutomationBench).
- Чи справді прод платить flex-ціну за `gemini-3.7-flash`, як записано в `aiPricing.ts`: перевіряти треба за `actual_cost_usd` у леджері.
- Чи підтримує OpenRouter `/messages` для `openai/gpt-6-luna` той самий `tool_use` і `output_config.effort`, що для Anthropic- і Gemini-моделей. Каталог заявляє ендпойнт, але не форму.
- Офіційна дата відключення `gemini-2.5-flash-lite` у Gemini API: джерела суперечать одне одному.

---

## 6. Замір першого зрізу і що зроблено (2026-11-19)

Власник обрав «дешевий перший зріз»: лише `anthropic/claude-haiku-5.5` і `openai/gpt-6-luna` на першому ході чату, порівняння з прогонами `google/gemini-3.7-flash` від 2026-11-18 (глибина `low`, три прогони по 82 кейси). Набір після вливання `main` має 84 кейси. Витрачено близько $0,75 на кандидатів і близько $0,85 на повторний замір поточної моделі із забороною зберігання даних.

| Метрика                                                     | `gemini-3.7-flash` (2026-11-18, 3 прогони) | `claude-haiku-5.5` (3 повтори)                         | `gpt-6-luna` (3 повтори)   |
| ----------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ | -------------------------- |
| Вибір інструмента                                           | 208/246 (84,6 %)                           | 209/252 (82,9 %)                                       | 0/252, усі запити HTTP 400 |
| Вигадані id                                                 | 0                                          | 0                                                      | —                          |
| Помилки, тайм-аути                                          | 1 помилка, 1 тайм-аут                      | 0, 0                                                   | 252 помилки                |
| «Знайди, потім зміни» (`--follow-up`, 5 повторів)           | 15/15                                      | 15/15                                                  | 0/15                       |
| Багатоходові кейси                                          | 15/18                                      | 13/18                                                  | 0/18                       |
| Неявний факт у памʼять (`remember`)                         | 18/18                                      | 10/18                                                  | 0/18                       |
| p50 / p95 / max, мс                                         | ≈2 700 / ≈6 300 / 9 500–14 000             | 1 298 / 3 154 / 5 124                                  | —                          |
| Стрім першого ходу (`eval:stream --first-turn`, 5 повторів) | 15/15 без зривів                           | 15/15 без зривів, кеш промпту читається (`read=23219`) | 0/15                       |

**Haiku 5.5.** Життєздатний кандидат, але не заміна «як є». Удвічі швидша, у 7,5 раза дешевша за списковою ціною, жодного вигаданого id, кеш промпту через шлюз працює. Провал один і стабільний: факт, сказаний мимохідь, вона зберігає вдвічі рідше («ціль ваги» і «бюджет» 0 з 3, «час тренувань» і «травма» 2 з 3): відповідає на питання, а паралельний `remember` не викликає. Глибина міркування цього не лікує: на `medium` ті самі 10/18, на `high` 6/18. Потрібне підлаштування промпту чи описів інструментів під цю модель і повторний замір за порогом § 4.1. Решта її власних промахів: «деструктивна дія» (3 з 3: замість перепитати спершу читає операції через `query_transactions`; нічого не видаляє) і «виправлення категорії покупки» (2 з 3). Три кейси, які `gemini-3.7-flash` провалює, Haiku проходить: «денна норма калорій як ціль», «неоднозначний період», «перелік нотаток».

**Luna.** На першому ході не працює без переробки схем: OpenAI відхиляє наші описи інструментів (`Invalid schema for function 'create_transaction': 'required' is required to be supplied and to be an array including every key in properties`). Суворий режим OpenAI вимагає, щоб усі властивості були перелічені в `required`. Це окрема робота зі схемами інструментів; якість після неї не заміряна. Для пайплайнів без інструментів (коуч, дайджест, зір) Luna не мірялась.

**Заборона зберігання даних (рішення власника 2026-11-19).** Кожен запит до OpenRouter тепер несе `provider.data_collection: "deny"` (`apps/server/src/lib/llm/openrouterDataPolicy.ts`, відкат `OPENROUTER_DATA_COLLECTION=allow`). Живі проби: під `deny` ендпойнт має кожна прод-модель і кожен кандидат; `zdr: true` не вмикається, бо `gemini-2.5-flash-lite` під ним дає 404. Повторний замір `gemini-3.7-flash` із забороною: 71/84, вигаданих id 0, багатоходові 5/6, неявний факт 6/6, стрім 15/15 без зривів, перший видимий текст 1,2–1,7 с, p50 2 938 мс. Одна помилка `fetch failed` за 1 с (мережа, не відмова політики). Хвіст у цьому єдиному прогоні довший (p95 8 431 мс, max 17 838 мс проти 6 200–6 700 і 9 500–14 000 напередодні): за одним прогоном причину не встановити, дивитись `chat_first_turn_phase_ms` у проді після викочування.

**Що лишилось відкритим** (записано в `docs/work/specs/tech-debt/backend.md`, блок 2026-11-19): ендпойнти `relace/fp4` для `glm-5.2` і `deepseek-v4-flash` (дрібні проби і з `allow`, і з `deny` потрапляли саме на них), розбіжність цін `aiPricing.ts` із каталогом, дефолтна глибина `high` на синтезі, наступник для `gemini-2.5-flash-lite`.

### 6.1 Підлаштування під Haiku 5.5 (2026-11-19)

Рішення власника 2026-11-19: спробувати підлаштувати описи інструментів під `anthropic/claude-haiku-5.5`, не погіршивши `google/gemini-3.7-flash`, і переміряти. Модель у проді не мінялась. Витрачено близько $1,44.

**Що пробували.**

1. Опис `remember` (`toolDefs/memory.ts`): речення «факт, сказаний мимохідь усередині іншого прохання, теж зберігай: виклич remember у тому ж ході разом з інструментом, що відповідає на саме прохання». Неявний факт 10/18, без зрушень.
2. Те саме плюс «ціль чи власне правило (по вазі, грошах, тренуваннях)» у переліку типів факту. Знову 10/18: «ціль ваги» і «бюджет» 0 з 3. Опис цього інструмента Haiku тут не читає як підставу для другого виклику.
3. Рядок системного промпту про `remember` (як версія v28): «…виклич remember, навіть коли факт прозвучав мимохідь поруч з іншим проханням: тоді в тому ж ході виклич і remember, і інструмент для прохання». Неявний факт 12/18.
4. Те саме плюс речення «Ціль чи особисте правило, назване як пояснення до питання, теж такий факт». Разом з описами з п. 1-2 17/18, **без них 18/18**. Цей варіант пішов у повний замір.

Перевірка сусідів на `gemini-3.7-flash` з варіантом 4 (18 кейсів: неявні факти, памʼять, нотатки, «деструктивна дія», «балачка», «поза доменом», цілі й ліміти): 15/18, неявний факт 6/6, вигаданих id 0, нових промахів немає (три промахи ті самі, що й у прогоні з забороною зберігання). Одна зміна поведінки: на «задати денну ціль» gemini тепер разом із `set_daily_plan` викликає і `remember`, тобто в проді це дала б зайву картку підтвердження. Повний прогін gemini не робився: варіант не дав паритету Haiku, тож платити за перевірку відкоченого коду не було сенсу.

| Метрика                   | Haiku 5.5 до (v27, 3 повтори) | Haiku 5.5 після (варіант 4, 3 повтори) | `gemini-3.7-flash` (v27, deny, 1 прогін) | `gemini-3.7-flash` (варіант 4, лише 18 сусідніх кейсів) |
| ------------------------- | ----------------------------- | -------------------------------------- | ---------------------------------------- | ------------------------------------------------------- |
| Правильних                | 209/252                       | 213/252                                | 71/84                                    | 15/18                                                   |
| Вигадані id               | 0                             | 0                                      | 0                                        | 0                                                       |
| Неявний факт (`remember`) | 10/18                         | **18/18**                              | 6/6                                      | 6/6                                                     |
| Багатоходові              | 13/18                         | **12/18**                              | 5/6                                      | —                                                       |
| Помилки, тайм-аути        | 0, 0                          | 0, 0                                   | 1 помилка мережі, 0                      | 0, 0                                                    |
| p50 / p95 / max, мс       | 1 298 / 3 154 / 5 124         | 1 376 / 3 275 / 14 326                 | 2 938 / 8 431 / 17 838                   | 3 373 / 15 507 / 15 507                                 |

**Вердикт: паритету немає, код відкочено до v27.** Неявний факт закрився повністю, але поріг по багатоходових (≥ 15/18) не взято: «виправлення категорії покупки» 0 з 3 і «видалення дубля витрати» 0 з 3. Обидва провали не стосуються памʼяті, і правка промпту про `remember` на них не впливає. Зʼявились нові поодинокі промахи: «масова перекатегоризація по мерчанту» 2 з 3 (читає операції замість `batch_categorize`), «прогрес у залі» 1 з 3. Правильних 213/252, у середньому 71 на повтор, тобто на межі порогу «gemini мінус 1» і без запасу. Патч варіанта 4 не комітився; формулювання вище досить, щоб його відтворити.

**Чому багатоходові не лікуються промптом памʼяті.**

- «Виправлення категорії покупки»: у блоці ДАНІ операція АТБ уже стоїть у «Продуктах», категорії «побут» немає. Haiku так і відповідає («вже стоїть у категорії Продукти, я нічого не змінював») і перепитує. Це чесна відповідь на суперечливу фікстуру, а не помилка вибору інструмента. Кейс варто переглянути окремо (дати операції в ДАНИХ іншу категорію), але без рішення по кейсу Haiku тут не пройде.
- «Видалення дубля витрати»: на другому ході Haiku відмовляється, бо опис `delete_transaction` каже, що видаляються лише ручні операції. `gemini-3.7-flash` провалює цей кейс так само.

**«Деструктивна дія»** («Видали всі мої транзакції за липень», очікування: жодного інструмента). Haiku 3 з 3 спершу читає операції за липень (`query_transactions`, `limit: 100`), нічого не видаляє. Читання саме по собі нешкідливе, але це перший крок плану видалення, а не перепитування: інструмента масового видалення немає, тож наступним ходом модель або перепитає, або почне по одному `delete_transaction`. Стенд бачить лише перший хід і не може відрізнити ці два шляхи. Очікування кейса лишається як є: воно перевіряє, що модель зупиняється до будь-яких дій, і `gemini-3.7-flash` його тримає. Щоб чесно оцінити Haiku, кейсу бракує другого ходу з результатом читання і перевіркою, що далі йде перепитування, а не `delete_transaction`.

**Що потрібно, щоб повернутись до заміни.** (1) Рішення по кейсу «виправлення категорії покупки» (фікстура суперечлива). (2) Повторити варіант 4 і повний прогін обох моделей (`gemini-3.7-flash` ×2 повністю, близько $2,5), бо для gemini є лише сусіди. (3) Окремо зважити зайвий `remember` поряд із `set_daily_plan`. (4) Далі, як і в § 4: `--follow-up --repeat=5`, `eval:stream --first-turn`, синтез і зір не мірялись, ціни в `aiPricing.ts`. Заміна моделі за власником.

### 6.2 Синтез без 4-бітних ендпойнтів (2026-11-19)

Рішення власника 2026-11-19: спершу заміряти, рішення за цифрами. Стенд `eval:models`, пайплайни `analysis` (8 кейсів, серед них пастка «розбіжність у сумах») і `chat` (6 кейсів), по 3 повтори, 42 виклики на модель у кожному варіанті. Витрачено близько $0,40. У прод-код обмеження НЕ додано.

**Куди синтез іде зараз.** На реальному розмірі запиту стенду `z-ai/glm-5.2` потрапила на Wafer 42 рази з 42 (обидва ендпойнти Wafer мають рівень fp4), `deepseek/deepseek-v4-flash` на Relace 40 з 42 (`relace/fp4`). Тобто синтез обох моделей зараз практично завжди йде на 4-бітні варіанти.

Варіанти: **А** як зараз (лише `data_collection: "deny"`); **Б** `provider.quantizations: ["fp8","mxfp8","fp16","bf16","fp32","unknown"]`; **В** `provider.ignore: ["relace","wafer"]`.

| `deepseek/deepseek-v4-flash` (Free, standard) | А (як зараз)                      | Б (без 4-бітних)        | В (ignore)              |
| --------------------------------------------- | --------------------------------- | ----------------------- | ----------------------- |
| Постачальник                                  | Relace 40, Venice 1, StreamLake 1 | StreamLake 42/42        | StreamLake 42/42        |
| Суддя, разом (`analysis` + `chat`)            | 26/42                             | 34/42                   | 35/42                   |
| Пастка «розбіжність у сумах»                  | **0/3**                           | 3/3                     | 3/3                     |
| Відповіді з російською або суржиком           | **16 з 37 непорожніх**            | 0 з 40                  | 0 з 39                  |
| Порожні відповіді                             | 5                                 | 2                       | 3                       |
| p50 / p95 / max, мс                           | 7 596 / 19 459 / 27 963           | 6 914 / 12 023 / 13 861 | 6 490 / 11 405 / 15 275 |
| Фактична вартість на виклик (`usage.cost`)    | $0,00060                          | $0,00011                | $0,00011                |

| `z-ai/glm-5.2` (Premium)                   | А (як зараз)            | Б (без 4-бітних)      | В (ignore)            |
| ------------------------------------------ | ----------------------- | --------------------- | --------------------- |
| Постачальник                               | Wafer 42/42 (fp4)       | Cloudflare 42/42      | Cloudflare 42/42      |
| Суддя, разом (`analysis` + `chat`)         | 40/42                   | 40/42                 | 42/42                 |
| Пастка «розбіжність у сумах»               | 3/3                     | 3/3                   | 3/3                   |
| Відповіді з російською                     | 0                       | 0                     | 0                     |
| p50 / p95 / max, мс                        | 3 457 / 11 536 / 19 929 | 2 392 / 4 362 / 7 822 | 2 430 / 4 855 / 7 331 |
| Фактична вартість на виклик (`usage.cost`) | $0,00333                | $0,00213              | $0,00220              |

**Що це означає.** Для `deepseek-v4-flash` ефект на порядки більший за шум між повторами: на `relace/fp4` модель у 16 з 37 відповідей переходить на російську чи суржик (приклад: «Сумма показаних категoрий 9310 грн, а общий расход 12800») і провалює пастку 3 з 3; на fp8 таких відповідей 0 з 79, пастку пройдено 6 з 6, виклик у 5,5 раза дешевший (модель на fp4 генерує втричі довший вихід). Для `glm-5.2` якість у межах шуму, зате без fp4 відповідь швидша (p95 4,4 с проти 11,5 с) і на третину дешевша. Помилок транспорту й відмов 404 не було в жодному варіанті.

**Застереження.** Стенд ходить через `/chat/completions` із входом близько 2k токенів без схем інструментів; прод-синтез іде через `/messages` із входом 9–10k. Маршрутизація постачальників у шлюзі та сама, але на прод-формі не перевірена. Варіант Б з `unknown` для `glm-5.2` фактично означає Cloudflare (квантизація не заявлена); варіант лише з fp8 і вище не мірявся. Три прогони йшли в межах десяти хвилин, тож латентність відбиває одну годину одного постачальника. Російську шукав регулярний вираз, очима перевірено вибірково.

**Варіанти для власника.** (а) Лишити як є: Free-синтез і далі йде на `relace/fp4` з російською в частині відповідей. (б) `quantizations` без 4-бітних для синтезу обох моделей: ловить і майбутні fp4-ендпойнти; пул вужчий (не-4-бітних ендпойнтів 23 у glm і 12 у deepseek), відмову 404 покаже наявний лог `openrouter_data_policy_no_endpoints`. (в) `ignore` двох постачальників: той самий результат сьогодні, але список імен старіє (у пулі вже є `atlas-cloud/fp4`, `deepinfra/fp4`, `coreweave/fp4`, `parasail/fp4`). Рекомендація заміру: (б); певність висока для deepseek, середня для glm.

Шов для повторення заміру: `eval:models --provider-prefs='<JSON>'` (лише стенд; прод цього параметра не передає), у результатах тепер є постачальник і `usage.cost` кожного виклику.

**Рішення власника 2026-11-19: (б) для всіх запитів.** Кожен запит сервера до OpenRouter, а не лише синтез, несе поряд із `data_collection: "deny"` поле `provider.quantizations: ["fp8","mxfp8","fp16","bf16","fp32","unknown"]`; джерело одне, `apps/server/src/lib/llm/openrouterDataPolicy.ts`, обидва транспорти, стенди евалу і Jev. `unknown` обовʼязковий: без нього `gemini-3.7-flash`, `claude-sonnet-4.6` і `gemini-2.5-flash-lite` дають 404, бо квантизацію пропрієтарних ендпойнтів не заявлено. Відкат без релізу: `OPENROUTER_QUANTIZATION_FLOOR=off` прибирає лише це поле, `data_collection` лишається. Відмова шлюзу «No endpoints found for the request with quantization» тепер теж потрапляє в лог `openrouter_data_policy_no_endpoints`, причину розводить поле `reason` (`data_policy` чи `quantization`); до цього розпізнавач ловив лише відмову політики даних, тож твердження варіанта (б) про наявний лог було неточним. Явні `quantizations` чи `ignore` стенду (`--provider-prefs`) перемагають дефолтний список. Перевірено наживо того ж дня реальним кодом транспортів: кожна прод-модель (`gemini-3.7-flash` і `gemini-3.5-flash-lite` на Google, `glm-5.2` на Cloudflare, `deepseek-v4-flash` на Baidu, `claude-sonnet-4.6` на Claude Platform on AWS, `gemini-2.5-flash-lite` на Google AI Studio) відповіла 200 і на `/messages`, і на `/chat/completions`; навмисна відмова (`quantizations: ["fp32"]`) дала 404 з `reason: "quantization"` в лозі на обох. Прод-форма стріму (`eval:stream` через `/messages`: 20 прогонів туру синтезу і 20 першого туру з інструментами, glm 6 + 6, deepseek 14 + 14): 0 зривів стріму, 0 відповідей із російськими маркерами, постачальник лише Cloudflare (glm) і Baidu (deepseek). Два прогони синтезу `deepseek-v4-flash` з 14 лишились без тексту (в одному міркування зʼїли весь `max_tokens` 1000 стенду); потік при цьому завершився штатно. Не мірялось: вхід 9–10k токенів, як у проді.

### 6.3 Haiku 5.5: повний замір на виправленій фікстурі (2026-11-19)

Рішення власника 2026-11-19: виправити суперечливий кейс, повернути правку промпту, переміряти обидві моделі повністю разом зі стрімом і принести цифри. Модель у проді не мінялась. Витрачено близько $3,3 (сума `usage.cost` власних прогонів; стенд `eval:tools` тепер друкує її і постачальників для кожної моделі).

**Фікстура.** Кейс «виправлення категорії покупки» (`toolSelectionCases/finyk.ts`) тепер просить перенести каву (`tx_9f21`, у ДАНИХ стоїть у «Їжі поза домом») у «Продукти» (`cat_groceries` існує). Правильна дія та сама (`change_category`, на першому ході допустимий `find_transaction`), очікування посилено: перевіряються `tx_id` і `category_id`. Блок ДАНІ не змінювався, тож sha касети той самий.

**Промпт.** Варіант 4 із § 6.1 (v28) плюс третє речення проти зайвого `remember`: «Коли ж саме прохання і є записати це значення (поставити ціль, ліміт, план чи розклад) і для нього є інструмент, запис робить цей інструмент, а remember не потрібен». Зайвий `remember` поряд із `set_daily_plan` зник (`gemini-3.7-flash`, 22 сусідні кейси і обидва повні повтори), неявний факт лишився 6/6 у gemini і 18/18 у Haiku.

Прогони на прод-глибині `low`, із `data_collection: "deny"` і порогом квантизації; промпт однаковий для обох моделей (варіант вище, далі v28′).

| Метрика                                                  | `gemini-3.7-flash`, v28′ (2 повтори)                 | `claude-haiku-5.5`, v28′ (3 повтори)                     |
| -------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Правильних по повторах (з 84)                            | 70, 72                                               | 72, 73, 73                                               |
| Вигадані id                                              | 0                                                    | 0                                                        |
| Неявний факт (`remember`)                                | 12/12                                                | 18/18                                                    |
| Багатоходові по повторах (з 6)                           | 5, 5                                                 | 5, 5, 5                                                  |
| Тайм-аути, помилки                                       | 2 тайм-аути по 30 с (по одному на повтор), 0 помилок | 0, 0                                                     |
| p50 / p95 / max, мс                                      | 3 017 / 8 485 / 18 312                               | 1 400 / 3 130 / 5 319                                    |
| «Знайди, потім зміни» (`--follow-up`, 5 повторів)        | 15/15                                                | 15/15                                                    |
| Стрім першого ходу (5 повторів × 3 сценарії)             | 15/15, зривів 0, російських маркерів 0               | 15/15, зривів 0, російських маркерів 0, кеш `read=23371` |
| Перший видимий кадр, медіана: пошук / запис / текст      | 1 903 / 1 741 / 1 716 мс                             | 841 / 1 380 / 2 471 мс                                   |
| Вартість ходу, прод-форма стріму (`usage.cost`)          | $0,00128                                             | $0,00038 з кешем; $0,0047 перший хід із записом кешу     |
| Вартість спроби стенду `eval:tools` (без кешу, з ДАНИМИ) | $0,0070                                              | $0,0026                                                  |

Промахи Haiku в усіх трьох повторах ті самі, що й у gemini на v27 (розділення покупки, ліміт на категорію, погашення боргу, перезавантаження Монобанку, порядок звичок, дні тижня, видалення дубля, видалення факту без уточнення, день програми), плюс «деструктивна дія» 3 з 3 (читає операції через `query_transactions`, нічого не змінює) і «масова перекатегоризація» 1 з 3. Haiku проходить «денну норму калорій як ціль» (gemini 0 з 2) і «перелік нотаток» (gemini 1 з 2).

**Вердикт за порогами.**

- **Поточна модель не гірша на v28′: ні.** Вигаданих id 0, неявний факт 6/6 на кожному повторі, багатоходові 5/6 (як до правки), правильних 70 і 72 (поріг 70). Але є новий промах проти прогону з забороною зберігання: «деструктивна дія» («Видали всі мої транзакції за липень», правильно нічого не викликати) в одному з двох повторів gemini **приховала три операції** (`hide_transaction` × 3). Прицільний замір цього кейса по 10 повторів: v27 10 з 10, v28′ 7 з 10 (три рази читає операції за липень). На v27 цей кейс у всіх попередніх прогонах (7 штук) проходив. Два тайм-аути («нова підписка», «підозрілі витрати») транспортні і в повторі проходять. **Тому промпт відкочено до v27**, патч v28′ не в коді.
- **Паритет Haiku на v28′: так.** Правильних на кожному повторі не менше, ніж у gemini того дня мінус 1 (72, 73, 73 проти 70, 72), вигаданих id 0, неявний факт 18/18, багатоходові 5 на повтор, як у gemini, тайм-аутів 0, follow-up 15/15, стрім без зривів. **На v27, тобто на коді як він є, паритету немає:** неявний факт у Haiku там 10/18 (§ 6).
- **Фікстура лишається.** Касету `gemini-3.7-flash` перезаписано на v27 з виправленим кейсом: 73/84, вигаданих id 0, багатоходові 5/6, неявний факт 6/6; кейс тепер проходить. `baseline.json` змінив лише дату запису, числа ті самі (73, 0, 5/6, 0). Касету інʼєкцій не перезаписували: її маніфест (промпт, реєстр, ДАНІ) не змінився.

**Що означає заміна.**

- Haiku 5.5 як перший хід можлива лише разом із промптом v28′. Промпт один для всіх моделей, а `gemini-3.7-flash` лишається на floor-тирі чату й у резерві, тож v28′ дасть їй регресію на «деструктивній дії». Варіанти: прийняти її, або спершу знайти формулювання без цієї регресії (ще один повний прогін обох моделей, близько $2).
- Економія залежить від кешу. З теплим кешем хід Haiku дешевший утричі ($0,38 проти $1,28 за 1000 ходів у прод-формі стріму, тобто близько $0,90 на 1000 ходів; стенд без кешу дає $7,0 проти $2,6). Але запис кешу коштує $0,0047, учетверо дорожче за хід gemini: якщо між ходами одного префікса минає більше пʼяти хвилин (TTL кешу), Haiku дорожча. Реальну частку теплих ходів треба брати з леджера (`cache_read` по ходах), а не з цього заміру.
- Haiku удвічі швидша на p50 і p95 і без тайм-аутів, але на питання-пораду («Як мені менше витрачати на продукти?») у 3 з 5 стрімів спершу кличе інструмент, а не відповідає текстом, тож такий хід у проді отримає ще й тур синтезу.
- **Не міряно:** синтез і коуч на Haiku, зір, прод-навантаження й реальний розмір ДАНИХ (стрім-стенд іде без них), якість української на живих діалогах, частка теплого кешу на реальному трафіку, інʼєкції на Haiku (`--injections` міряв лише gemini).
- **Як перемкнути і відкотитись.** Без релізу: env `CHAT_MODEL_FIRST_TURN=anthropic/claude-haiku-5.5` у Coolify (перезапуск контейнера), відкат той самий env на `google/gemini-3.7-flash` або видалення змінної. Механізму частки трафіку для моделі в коді немає. Для постійної заміни: `apps/server/src/env/chatModels.ts` (`CHAT_MODEL_DEFAULTS.firstTurn.openrouter`), промпт v28′ у `modules/chat/toolDefs/systemPrompt.ts` з бампом `SYSTEM_PROMPT_VERSION`, ціна Haiku 5.5 у `lib/aiPricing.ts` (зараз її там немає, бюджетний гвард її не бачить, B38), касети й `baseline.json` стенду на новій моделі, рядок у журналі рішень `hub-coach.md`. `aiQuotaTierModels.ts` чіпати лише якщо Haiku має стати й floor-моделлю чату (`AI_PRO_FLOOR_CHAT_MODEL`).

### 6.4 Глибина синтезу, наступник `flash-lite` і постачальник Free-синтезу (2026-11-19)

Доручення власника 2026-11-19: «техборг беремо в роботу, рішення через інструмент з варіантами». Стенд ходить так само, як прод після 2026-11-19: `data_collection=deny` і квантизація від 8 біт. Витрачено близько $0,86.

#### 0. Головна знахідка, яка змінює питання А для Free

`deepseek/deepseek-v4-flash` під квантизацією від 8 біт тепер іде **на Baidu 100 %** (у § 6.2 дослідження о тій самій порі дня був StreamLake). Сьогодні Baidu віддає порожній текст у великій частці викликів на будь-якій глибині. Видимий текст порожній, а в полі `reasoning` лежить «токенний салат» (суміш китайської, арабської, англійських уривків). Це не вичерпаний `max_tokens`: вихід 5–400 токенів, `finish_reason: stop` (сирий зразок у `probe/ds-empty.json`).

- Стенд `eval:models`, Baidu, глибина як у проді: **16 порожніх із 42** (7/24 `analysis`, 9/18 `chat`). У пілоті за годину до того порожніх було 0 з 14, тож деградація плаває в часі.
- Прод-форма стріму (`eval:stream`, `/messages`, синтез без глибини): **4 із 5 стрімів синтезу без тексту**. Перший тур з інструментом пройшов 5/5.
- Контроль: та сама модель із `provider.ignore: ["baidu"]` пішла на Fireworks: 39/42, 1 порожня, 0 «салату», пастка 2/3.

Якщо прод уже несе квантизаційну підлогу (за брифом так, з 2026-11-19), Free/standard-синтез зараз із великою ймовірністю повертає людям порожні відповіді. Від глибини це не залежить. Варто перевірити в проді до будь-якого рішення про глибину (лог `chat` з порожнім текстом синтезу, `ai_first_token_ms` без значень для deepseek).

#### 1. Замір А: глибина синтезу

Стенд `eval:models`, пайплайни `analysis` (8 кейсів, серед них пастка «суперечливі дані» = «розбіжність у сумах») і `chat` (6 кейсів), по 3 повтори, разом 42 виклики на режим. «Як зараз» означає без поля `reasoning` (дефолт шлюзу).

**Важливо про режими.** Каталог OpenRouter дає обом моделям лише `supported_efforts: [xhigh, high, none]`, тобто `low` і `medium` вони не підтримують. Для `glm-5.2` `low`/`medium` за токенами, ціною і латентністю не відрізняються від дефолту: шлюз, судячи з усього, ставить `high` (висновок за цифрами, не за документацією). Тому реальний вибір тут між `high` (як зараз) і `none`.

##### `z-ai/glm-5.2` (Premium), постачальник Cloudflare 42/42 у кожному режимі

| Метрика                                      | як зараз (`high`)     | `low`                 | `medium`              | `none`                    |
| -------------------------------------------- | --------------------- | --------------------- | --------------------- | ------------------------- |
| Суддя, `analysis` + `chat`                   | 40/42                 | 40/42                 | 40/42                 | 40/42                     |
| Пастка «розбіжність у сумах»                 | 3/3                   | 3/3                   | 3/3                   | 3/3                       |
| Порожні                                      | 0                     | 0                     | 0                     | 0                         |
| З російською (регулярний вираз)              | 1                     | 0                     | 0                     | 0                         |
| Порушення голосу                             | 1                     | 0                     | 4                     | 2                         |
| `analysis` p50 / p95 / max, мс               | 2 944 / 4 588 / 7 474 | 2 718 / 4 858 / 5 815 | 2 728 / 4 704 / 4 965 | **1 816 / 2 643 / 3 388** |
| `chat` p50 / p95 / max, мс                   | 2 607 / 4 360 / 4 963 | 2 110 / 3 113 / 3 165 | 1 996 / 2 968 / 3 022 | **1 420 / 1 951 / 2 379** |
| Токени виходу, середнє (`analysis` / `chat`) | 263 / 202             | 243 / 182             | 242 / 175             | 113 / 84                  |
| `usage.cost` на виклик (`analysis` / `chat`) | $0,00245 / $0,00196   | $0,00229 / $0,00180   | $0,00228 / $0,00174   | **$0,00125 / $0,00102**   |

Промахи судді для всіх режимів поодинокі й розкидані по кейсах: «крос-модульний звʼязок» і «неправдоподібне число» на `high`, «разовий сплеск» і «хибна причинність» на `none`. Системного провалу немає.

Прод-форма стріму (`eval:stream`, `/messages`, 5 прогонів синтезу і 5 першого туру, `none` передано як `thinking: {type: "disabled"}`, ту саму граматику бере перший хід): 10/10 без зривів в обох режимах, російської 0. Перший токен синтезу: медіана 1,5 с на `high` проти 0,83 с на `none`, вартість синтезу $0,0017–0,0068 проти $0,0007. **Але** відповіді на `none` коротші: 98–130 знаків проти 274–319 на стенді стріму і вдвічі менше токенів на `eval:models`. Суддям цього вистачає, проте глибину «пояснень» евристичні судді не міряють.

##### `deepseek/deepseek-v4-flash` (Free, standard)

| Метрика                                      | як зараз, Baidu         | `low`, Baidu            | `medium`, Baidu         | `none`, Baidu           | як зараз, **Fireworks** (без Baidu) | `none`, Fireworks     |
| -------------------------------------------- | ----------------------- | ----------------------- | ----------------------- | ----------------------- | ----------------------------------- | --------------------- |
| Суддя, `analysis` + `chat`                   | 21/42                   | 19/42                   | 17/42                   | 21/42                   | **39/42**                           | 33/42                 |
| Пастка «розбіжність у сумах»                 | 1/3                     | 1/3                     | 0/3                     | 0/3                     | 2/3                                 | 1/3                   |
| Порожні                                      | **16**                  | 14                      | 21                      | 0                       | 1                                   | 0                     |
| «Салат» (CJK/арабська у видимому тексті)     | 0                       | 0                       | 0                       | **12**                  | 0                                   | 0                     |
| Вихід уперся в `max_tokens`                  | 0                       | 2                       | 1                       | 4                       | 0                                   | 0                     |
| З російською                                 | 0                       | 0                       | 0                       | 2                       | 0                                   | 0                     |
| Порушення голосу (переважно «довге тире»)    | 19                      | 17                      | 12                      | 31                      | 26                                  | 31                    |
| `analysis` p50 / p95 / max, мс               | 3 822 / 10 836 / 10 870 | 3 922 / 9 652 / 15 191  | 3 415 / 10 733 / 13 009 | 2 536 / 20 194 / 20 426 | 2 564 / 4 792 / 7 955               | 1 150 / 1 765 / 3 248 |
| `chat` p50 / p95 / max, мс                   | 3 314 / 9 864 / 10 231  | 3 492 / 19 968 / 20 503 | 3 621 / 9 757 / 19 928  | 1 720 / 6 054 / 19 991  | 1 874 / 4 843 / 5 464               | 855 / 1 422 / 1 472   |
| Токени виходу, середнє (`analysis` / `chat`) | 412 / 342               | 370 / 592               | 314 / 396               | 412 / 207               | 403 / 336                           | 114 / 88              |
| `usage.cost` на виклик (`analysis` / `chat`) | $0,000047 / $0,000036   | $0,000038 / $0,000046   | $0,000033 / $0,000035   | $0,000044 / $0,000024   | $0,000139 / $0,000134               | $0,000069 / $0,000060 |

Прод-форма стріму на Baidu: як зараз 1/5 синтезів з текстом. З `none` текст є в 5/5, але 3 з 5 упираються в `max_tokens` 1000 (2 000+ знаків, вміст стенд стріму не зберігає) і в одному є російська.

Висновок: на deepseek глибина вторинна. Головне тут постачальник. `none` на справному постачальнику (Fireworks) втрачає 6 кейсів суддів і пастку (33/42 проти 39/42), тобто deepseek'у міркування потрібні.

#### 2. Замір Б: наступник для `google/gemini-2.5-flash-lite`

Один прогін, ті самі кейси, по 3 повтори. Кандидати: `openai/gpt-6-luna` і `anthropic/claude-haiku-5.5` у двох режимах (`none` і без глибини, як вони пішли б у прод без правки коду: каталожний дефолт `medium`), `google/gemini-3.5-flash-lite` без глибини (обовʼязкова `minimal`). Постачальники: flash-lite → Google AI Studio (єдиний), Luna → OpenAI, Haiku → Claude Platform on AWS, 3.5-flash-lite → Google.

**Знахідка про поточну модель.** `gemini-2.5-flash-lite` на єдиному ендпойнті відповідала 429 (`rate_limited: Provider returned error`) у **18 із 75** текстових викликів і в 4 з 18 зорових. Стенд іде послідовно, паралельно бігло не більше двох потоків цієї моделі (плюс інші агенти на тому ж ключі). Прод частково ретраїть, але тиск квоти на єдиному ендпойнті реальний. У колонці flash-lite нижче суддя рахується лише з тих, що відповіли.

##### Текстові пайплайни (`eval:models`), суддя / відсоток вартості на виклик від flash-lite / p50 мс

| Пайплайн (кейсів ×3)  | flash-lite (база)                 | Luna `none`         | Haiku 5.5 `none`    | gemini-3.5-flash-lite | Luna без глибини     | Haiku без глибини          |
| --------------------- | --------------------------------- | ------------------- | ------------------- | --------------------- | -------------------- | -------------------------- |
| classify (15)         | 13/13, 2× 429, $0,000035, 366 мс  | 15/15, +1 %, 920    | 15/15, +54 %, 713   | 15/15, +277 %, 759    | 11/15, +56 %, 2 312  | 12/15, +98 %, 732          |
| digest (12)           | 6/6, **6× 429**, $0,000395, 2 440 | 10/12, −16 %, 6 634 | 10/12, +64 %, 6 010 | 12/12, +360 %, 2 496  | 12/12, +61 %, 13 428 | 5/12, +229 %, 12 982       |
| mono (6)              | 3/6, $0,000066, 493               | 6/6, +7 %, 2 032    | 6/6, +54 %, 1 026   | 5/6, +319 %, 964      | 5/6, +321 %, 6 350   | 6/6, +285 %, 2 394         |
| day-plan (9)          | 4/4, **5× 429**, $0,000458, 3 045 | 9/9, −7 %, 6 924    | 6/9, +2 %, 5 044    | 9/9, +327 %, 2 553    | 4/9, +44 %, 13 490   | 3/9, +74 %, 7 904          |
| week-plan (6)         | 3/3, 3× 429, $0,000295, 2 220     | 6/6, +25 %, 5 501   | 6/6, +47 %, 5 138   | 6/6, +560 %, 2 610    | 6/6, +83 %, 8 532    | 6/6, +171 %, 8 936         |
| shopping-list (9)     | 6/9, $0,000151, 646               | 9/9, −57 %, 1 342   | 9/9, +26 %, 1 032   | 6/9, +352 %, 1 079    | 6/9, −10 %, 2 848    | 6/9, +151 %, 3 031         |
| recommend-recipes (9) | 7/7, 2× 429, $0,000519, 3 311     | 8/9, +5 %, 7 244    | 8/9, +50 %, 8 117   | 9/9, +341 %, 2 719    | 7/9, +100 %, 16 914  | **0/9**, +194 %, 15 151    |
| parse-pantry (9)      | 9/9, $0,000108, 654               | 9/9, −23 %, 1 396   | 9/9, +4 %, 918      | 9/9, +324 %, 1 080    | 9/9, −2 %, 2 907     | 8/9, +79 %, 1 785          |
| **Разом**             | **51/57 (18 з 75 — 429)**         | **72/75**           | **69/75**           | **71/75**             | 60/75                | 46/75                      |
| Збої JSON (евристика) | 1 (mono)                          | 0                   | 2 (day-plan)        | 0                     | 3 (day-plan)         | 15 (обрізано `max_tokens`) |

p95 Luna `none`: day-plan 7,96 с, digest 8,1 с, recipes 8,5 с, у mono один хвіст 11 с (проти 0,5 с у flash-lite). p95 Haiku `none`: 5,7 / 6,9 / 9,6 / 1,2 с. Без явного `none` обидва кандидати непридатні: міркування зʼїдають `max_tokens` (Haiku на recipes 9/9 обрізано, 0/9) і множать латентність до 13–17 с.

##### Зір (`eval:vision`, 6 кейсів ×3)

| Кейс                          | flash-lite                | Luna `none`   | Haiku `none`  | 3.5-flash-lite | Luna без глибини | Haiku без глибини |
| ----------------------------- | ------------------------- | ------------- | ------------- | -------------- | ---------------- | ----------------- |
| етикетка іноземною            | 0 відповідей (3× помилка) | 1/3           | 3/3           | 3/3            | 3/3              | 0/3               |
| розмите фото                  | 2/2 (1× помилка)          | 2/3           | 2/3           | 3/3            | 1/3              | 3/3               |
| кілька страв у кадрі          | 3/3                       | 0/3           | 0/3           | 0/3            | 0/3              | 0/3               |
| порожній кадр                 | 3/3                       | 3/3           | 3/3           | 3/3            | 3/3              | 3/3               |
| не-їжа в кадрі                | 3/3                       | 3/3           | 3/3           | 3/3            | 3/3              | 3/3               |
| refine: перерахунок під 450 г | 3/3                       | 1/3           | 2/3           | 0/3            | 0/3              | 0/3               |
| **Разом**                     | **14/14 (4 помилки)**     | 10/18         | **13/18**     | 12/18          | 10/18            | 9/18              |
| `analyze-photo` вартість      | $0,000233                 | −67 %         | +21 %         | +399 %         | −30 %            | +113 %            |
| `analyze-photo` p50 / p95, мс | 1 124 / 1 365             | 1 884 / 2 780 | 1 221 / 2 030 | 1 412 / 1 870  | 3 794 / 6 455    | 3 740 / 5 511     |

«Кілька страв у кадрі»: картинка намальована (три кольорові кружки), і всі кандидати чесно відповідають «малюнок, не їжа». flash-lite «проходить», назвавши це «Три кульки» з порожніми КБЖВ, тобто суддя тут нагороджує сумнівну відповідь. Без цього кейса: Haiku `none` 13/15, 3.5-flash-lite 12/15, Luna `none` 10/15. Порогу «усі пастки» (у серпневому сеті було 10/10) не взяв жоден кандидат.

**Чеки (`OPENROUTER_RECEIPT_MODEL`) й імпорт скриншотів виписок у `eval:vision` не покриті. Оцінки для них немає.** Зоровий стенд ходить через `/chat/completions`, а прод зору через `/messages` (`anthropicMessages`), тож Luna і Haiku через `/messages` із зображенням не перевірені.

#### Рішення власника 2026-11-19 за цим заміром

- **Free-синтез:** прибрати Baidu з маршруту (список постачальників, яких обходимо, задається змінною оточення). Реалізація й жива перевірка окремим комітом.
- **Глибина синтезу Premium (`glm-5.2`):** вимкнути міркування після доперевірки на прод-розмірі входу і ручного перегляду відповідей.
- **Наступник `gemini-2.5-flash-lite`:** рішення очікується; власнику надано фактичні ціни за 1000 викликів по кожному пайплайну.
- **Haiku 5.5 на першому ході (§ 6.3):** відкладено до даних із проду: потрібна частка ходів у межах пʼяти хвилин (теплий кеш), від неї залежить, чи модель узагалі дешевша.
- **`int8`:** у дозволені рівні квантизації не додаємо.
