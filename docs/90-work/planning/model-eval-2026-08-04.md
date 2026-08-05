<!-- AUTO-GENERATED FILE. Do not edit by hand. Generator: `pnpm --filter @sergeant/server eval:models` / `eval:vision` (apps/server/scripts/eval/report.ts). -->

# Звіт стенду моделей

Згенеровано: 2026-08-04T00:48:32.491Z

Кожен пайплайн подає моделі ТОЙ САМИЙ системний промпт, що й прод —
імпортом з продового білдера, не копією (таблиця «Промпти» нижче).
Судді бувають структурні (проганяють відповідь через прод-парсер —
їм можна вірити) і евристичні (лише звужують, що читати очима).
Рішення ухвалюється читанням секції «Повний текст», не колонкою «Суддя».

## Підсумок по кандидатах

| Кандидат                             | Модель                         | Пройшло | Голос | Медіанна затримка (мс) | Сер. вартість |
| ------------------------------------ | ------------------------------ | ------- | ----- | ---------------------- | ------------- |
| current default (Anthropic)          | `claude-haiku-4-5-20251001`    | 2/7     | —     | 0                      | $0.0000/1k    |
| OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | 3/28    | —     | 0                      | ?             |
| current default (Anthropic)          | `claude-sonnet-4-6`            | 1/21    | —     | 0                      | $0.0000/1k    |
| current default (OpenRouter premium) | `openai/gpt-5.1`               | 0/4     | 4/4   | 0                      | ?             |
| current standard tier                | `google/gemini-2.5-flash-lite` | 0/4     | 4/4   | 0                      | ?             |
| current default (premium tier)       | `claude-sonnet-4-6`            | 0/6     | 6/6   | 0                      | $0.0000/1k    |
| current standard tier                | `claude-haiku-4-5-20251001`    | 0/6     | 6/6   | 0                      | $0.0000/1k    |
| current floor tier                   | `claude-haiku-4-5-20251001`    | 0/6     | 6/6   | 0                      | $0.0000/1k    |
| baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | 0/8     | 8/8   | 0                      | ?             |

## Вартість: без кешу і з кешем

Формула кешу — `2 + 0.1·(N−1)` на стабільний префікс при TTL=1h;
обґрунтування живе у `src/modules/chat/promptCache.ts` (§ TTL).
Колонка «з кешем» — ПРОЄКЦІЯ: сам стенд шле `system` без `cache_control`,
тож `Cache read` у таблиці вище буде 0. Порожньо там, де прод кешу не
ставить взагалі.

| Пайплайн          | Кандидат                       | Модель                      | N=1                 | N=3                 | N=5                 | N=10                | N=20                |
| ----------------- | ------------------------------ | --------------------------- | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| classify          | current default (Anthropic)    | `claude-haiku-4-5-20251001` | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| digest            | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| mono              | current default (Anthropic)    | `claude-haiku-4-5-20251001` | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| chat              | current default (premium tier) | `claude-sonnet-4-6`         | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| chat              | current standard tier          | `claude-haiku-4-5-20251001` | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| chat              | current floor tier             | `claude-haiku-4-5-20251001` | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| day-hint          | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| day-plan          | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| week-plan         | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| shopping-list     | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| recommend-recipes | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| parse-pantry      | current default (Anthropic)    | `claude-sonnet-4-6`         | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |

## По кейсах

| Пайплайн          | Кейс                             | Кандидат                             | Модель                         | OK  | Суддя | Голос | Затримка (мс) | In  | Out | Cache read | Вартість   |
| ----------------- | -------------------------------- | ------------------------------------ | ------------------------------ | --- | ----- | ----- | ------------- | --- | --- | ---------- | ---------- |
| classify          | MCC суперечить торговцю          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌    | —     | 5             | 0   | 0   | —          | $0.0000/1k |
| classify          | MCC суперечить торговцю          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 2             | 0   | 0   | —          | ?          |
| classify          | торговець поза списком категорій | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| classify          | торговець поза списком категорій | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅    | —     | 0             | 0   | 0   | —          | ?          |
| classify          | надходження, не переказ          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| classify          | надходження, не переказ          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| classify          | замаскований P2P                 | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| classify          | замаскований P2P                 | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| classify          | нерозбірливий дескриптор         | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| classify          | нерозбірливий дескриптор         | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅    | —     | 0             | 0   | 0   | —          | ?          |
| digest            | повний тиждень                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 1             | 0   | 0   | —          | $0.0000/1k |
| digest            | повний тиждень                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| digest            | дірка в даних                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| digest            | дірка в даних                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| digest            | один модуль із чотирьох          | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| digest            | один модуль із чотирьох          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| digest            | перевитрата з боргом             | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| digest            | перевитрата з боргом             | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| mono              | чиста партія                     | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| mono              | чиста партія                     | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| mono              | партія зі сміттям                | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| mono              | партія зі сміттям                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| coach-insight     | звичайний тиждень                | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | звичайний тиждень                | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | дати немає                       | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | дати немає                       | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | порожній перший сеанс            | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | порожній перший сеанс            | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | регрес проти пам'яті             | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| coach-insight     | регрес проти пам'яті             | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| chat              | проста порада                    | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | проста порада                    | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | проста порада                    | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | багато категорій                 | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 1             | 0   | 0   | —          | $0.0000/1k |
| chat              | багато категорій                 | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | багато категорій                 | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порожні дані                     | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порожні дані                     | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порожні дані                     | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | перевитрата                      | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | перевитрата                      | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | перевитрата                      | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порівняння періодів              | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порівняння періодів              | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | порівняння періодів              | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | крос-модульний                   | current default (premium tier)       | `claude-sonnet-4-6`            | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | крос-модульний                   | current standard tier                | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | $0.0000/1k |
| chat              | крос-модульний                   | current floor tier                   | `claude-haiku-4-5-20251001`    | ✅  | ❌    | ✅    | 1             | 0   | 0   | —          | $0.0000/1k |
| analysis          | суперечливі дані                 | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | разовий сплеск                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | пріоритезація                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | крос-модульний звʼязок           | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | хибна причинність                | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | дірка в даних                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | неправдоподібне число            | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| analysis          | недосяжна ціль                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | ✅    | 0             | 0   | 0   | —          | ?          |
| day-hint          | недобір білка                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-hint          | недобір білка                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 1             | 0   | 0   | —          | ?          |
| day-hint          | прийоми є, макросів немає        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-hint          | прийоми є, макросів немає        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| day-hint          | цілі не задані                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-hint          | цілі не задані                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| day-plan          | план під цілі                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-plan          | план під цілі                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| day-plan          | перегенерувати один прийом       | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-plan          | перегенерувати один прийом       | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| day-plan          | порожня комора                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| day-plan          | порожня комора                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| week-plan         | тиждень із комори                | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| week-plan         | тиждень із комори                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| week-plan         | комора порожня                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| week-plan         | комора порожня                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| shopping-list     | виключити наявне в коморі        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| shopping-list     | виключити наявне в коморі        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| shopping-list     | дублікат між рецептами           | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| shopping-list     | дублікат між рецептами           | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| shopping-list     | усе вже є вдома                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| shopping-list     | усе вже є вдома                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| recommend-recipes | pantryMode=only                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| recommend-recipes | pantryMode=only                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| recommend-recipes | алерген у виключеннях            | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| recommend-recipes | алерген у виключеннях            | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| recommend-recipes | обрізана відповідь               | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| recommend-recipes | обрізана відповідь               | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| parse-pantry      | дублікати й одиниці              | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| parse-pantry      | дублікати й одиниці              | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| parse-pantry      | надиктований текст з помилками   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| parse-pantry      | надиктований текст з помилками   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌    | —     | 0             | 0   | 0   | —          | ?          |
| parse-pantry      | порожній сенс                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ✅    | —     | 0             | 0   | 0   | —          | $0.0000/1k |
| parse-pantry      | порожній сенс                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅    | —     | 0             | 0   | 0   | —          | ?          |

## Повний текст (розбіжності з базовою моделлю та провали судді)

Евристичний суддя не ухвалює рішення — він звужує, що читати очима.
Нижче сирі відповіді ЦІЛКОМ, без обрізання.

### classify / MCC суперечить торговцю — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ❌ провалив

```text
stub
```

### classify / MCC суперечить торговцю — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### classify / надходження, не переказ — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ❌ провалив

```text
stub
```

### classify / надходження, не переказ — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### classify / замаскований P2P — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ❌ провалив

```text
stub
```

### classify / замаскований P2P — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### digest / повний тиждень — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ❌ провалив

```text
stub
```

### digest / повний тиждень — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### digest / дірка в даних — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ❌ провалив

```text
stub
```

### digest / дірка в даних — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### digest / один модуль із чотирьох — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ❌ провалив

```text
stub
```

### digest / один модуль із чотирьох — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### digest / перевитрата з боргом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ❌ провалив

```text
stub
```

### digest / перевитрата з боргом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### mono / чиста партія — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ❌ провалив

```text
stub
```

### mono / чиста партія — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### mono / партія зі сміттям — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
stub
```

### mono / партія зі сміттям — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### coach-insight / звичайний тиждень — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: загальна мотивація без жодного числа з даних («ти молодець, продовжуй»). Промпт вимагає конкретний патерн І конкретну дію на сьогодні.

**Суддя:** ❌ провалив

```text
stub
```

### coach-insight / звичайний тиждень — current standard tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: загальна мотивація без жодного числа з даних («ти молодець, продовжуй»). Промпт вимагає конкретний патерн І конкретну дію на сьогодні.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
stub
```

</details>

### coach-insight / дати немає — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: вжити темпоральний маркер («сьогодні середина тижня», «тиждень майже закінчився»). Промпт прямо забороняє це, коли дата не передана — саме на цьому модель дала пораду «середина тижня» у неділю.

**Суддя:** ❌ провалив

```text
stub
```

### coach-insight / дати немає — current standard tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вжити темпоральний маркер («сьогодні середина тижня», «тиждень майже закінчився»). Промпт прямо забороняє це, коли дата не передана — саме на цьому модель дала пораду «середина тижня» у неділю.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
stub
```

</details>

### coach-insight / порожній перший сеанс — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Пам'яті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.

**Суддя:** ❌ провалив

```text
stub
```

### coach-insight / порожній перший сеанс — current standard tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Пам'яті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
stub
```

</details>

### coach-insight / регрес проти пам'яті — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: похвалити прогрес. Пам'ять каже 4 тренування й 86% звичок минулого тижня, зараз 1 і 29% — це падіння, і коуч має його назвати, а не привітати.

**Суддя:** ❌ провалив

```text
stub
```

### coach-insight / регрес проти пам'яті — current standard tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: похвалити прогрес. Пам'ять каже 4 тренування й 86% звичок минулого тижня, зараз 1 і 29% — це падіння, і коуч має його назвати, а не привітати.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
stub
```

</details>

### chat / проста порада — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив

```text
stub
```

### chat / проста порада — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / проста порада — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив

```text
stub
```

### chat / багато категорій — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив

```text
stub
```

### chat / багато категорій — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / багато категорій — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив

```text
stub
```

### chat / порожні дані — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив

```text
stub
```

### chat / порожні дані — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / порожні дані — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив

```text
stub
```

### chat / перевитрата — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив

```text
stub
```

### chat / перевитрата — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / перевитрата — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив

```text
stub
```

### chat / порівняння періодів — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив

```text
stub
```

### chat / порівняння періодів — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / порівняння періодів — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив

```text
stub
```

### chat / крос-модульний — current default (premium tier) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив

```text
stub
```

### chat / крос-модульний — current standard tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / крос-модульний — current floor tier (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / суперечливі дані — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати обидва числа й не помітити, що сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / разовий сплеск — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порадити «скоротити витрати». Сплеск разовий (річний платіж), тож наступного місяця він не повториться — це не тренд.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / пріоритезація — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: перелічити три проблеми як рівноцінні. Борг 42 000 під 32% річних коштує ~1100 грн/міс — на порядок більше за підписки 340 грн/міс. Порада «почни з підписок» тут шкідлива, і саме її попередній суддя зарахував як правильну.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / крос-модульний звʼязок — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати три ряди чисел окремо. Тренування падають у ті самі дні, коли витрати на доставку зростають — це один патерн.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / хибна причинність — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порадити «менше таксі, щоб краще спати». Збіг у часі ≠ причина; у ці ж дні робочі зустрічі тривали до 21:00.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / дірка в даних — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати середнє як факт. Воно пораховане на 20 днях із 31, тож занижене.

**Суддя:** ❌ провалив

```text
stub
```

### analysis / неправдоподібне число — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати 34 000 грн/міс на підписки в суму й порадити «скоротити». Серед звичайних чисел це майже напевно помилка даних (копійки замість гривень).

**Суддя:** ❌ провалив

```text
stub
```

### analysis / недосяжна ціль — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: схвалити план. Вільний залишок 2000 грн/міс, ціль 5000 — розрив треба назвати, а не підбадьорити.

**Суддя:** ❌ провалив

```text
stub
```

### day-hint / недобір білка — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив

```text
stub
```

### day-hint / недобір білка — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-hint / прийоми є, макросів немає — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ❌ провалив

```text
stub
```

### day-hint / прийоми є, макросів немає — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-hint / цілі не задані — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ❌ провалив

```text
stub
```

### day-hint / цілі не задані — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-plan / план під цілі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ❌ провалив

```text
stub
```

### day-plan / план під цілі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-plan / перегенерувати один прийом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ❌ провалив

```text
stub
```

### day-plan / перегенерувати один прийом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-plan / порожня комора — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ❌ провалив

```text
stub
```

### day-plan / порожня комора — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### week-plan / тиждень із комори — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ❌ провалив

```text
stub
```

### week-plan / тиждень із комори — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### week-plan / комора порожня — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ❌ провалив

```text
stub
```

### week-plan / комора порожня — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### shopping-list / виключити наявне в коморі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив

```text
stub
```

### shopping-list / виключити наявне в коморі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### shopping-list / дублікат між рецептами — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив

```text
stub
```

### shopping-list / дублікат між рецептами — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### shopping-list / усе вже є вдома — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив

```text
stub
```

### shopping-list / усе вже є вдома — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### recommend-recipes / pantryMode=only — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ❌ провалив

```text
stub
```

### recommend-recipes / pantryMode=only — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### recommend-recipes / алерген у виключеннях — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ❌ провалив

```text
stub
```

### recommend-recipes / алерген у виключеннях — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### recommend-recipes / обрізана відповідь — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ❌ провалив

```text
stub
```

### recommend-recipes / обрізана відповідь — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### parse-pantry / дублікати й одиниці — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ❌ провалив

```text
stub
```

### parse-pantry / дублікати й одиниці — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### parse-pantry / надиктований текст з помилками — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ❌ провалив

```text
stub
```

### parse-pantry / надиктований текст з помилками — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ❌ провалив

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

## Промпти (джерело)

| Пайплайн          | Продовий білдер                                                       | system                         | Кейсів |
| ----------------- | --------------------------------------------------------------------- | ------------------------------ | ------ |
| classify          | `routes/internal/categorize.ts::buildCategorizePrompt`                | 315 симв.                      | 5      |
| digest            | `modules/digest/weekly-digest.ts::buildWeeklyDigestPrompt`            | 1446 симв.                     | 4      |
| mono              | `lib/mcc/batchPrompt.ts::buildBatchPrompt`                            | 439 симв.                      | 2      |
| coach-insight     | `modules/chat/coach.ts::buildCoachInsightPrompt`                      | — (прод шле все user-реплікою) | 4      |
| chat              | `modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX`                | 3894 симв.                     | 6      |
| analysis          | `modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX`                | 3894 симв.                     | 8      |
| day-hint          | `modules/nutrition/day-hint.ts::buildDayHintPrompt`                   | — (прод шле все user-реплікою) | 3      |
| day-plan          | `modules/nutrition/day-plan.ts::buildDayPlanPrompt`                   | 1572 симв.                     | 3      |
| week-plan         | `modules/nutrition/week-plan.ts::buildWeekPlanPrompt`                 | 925 симв.                      | 2      |
| shopping-list     | `modules/nutrition/shopping-list.ts::buildShoppingListPrompt`         | 1161 симв.                     | 3      |
| recommend-recipes | `modules/nutrition/recommend-recipes.ts::buildRecommendRecipesPrompt` | 1440 симв.                     | 3      |
| parse-pantry      | `modules/nutrition/parse-pantry.ts::buildParsePantryPrompt`           | 834 симв.                      | 3      |
