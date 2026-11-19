# Нові моделі OpenRouter проти наших LLM-пайплайнів

> **Last touched:** 2026-11-19 by @claude (створено за запитом власника; § 6 із заміром першого зрізу і тим, що зроблено за результатами). **Next review:** 2026-11-26 (перегляд маршрутизації моделей, ADR-0087).
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
