<!-- AUTO-GENERATED FILE. Do not edit by hand. Generator: `pnpm --filter @sergeant/server eval:models` / `eval:vision` (apps/server/scripts/eval/report.ts). -->

# Звіт стенду моделей

> **Last touched:** 2026-08-25 by @claude (перший живий прогін стенду ключем OpenRouter). **Next review:** 2026-11-23.
> **Status:** Reference

> **ЯК ЧИТАТИ ЦЕЙ ЗВІТ.** Прогін зроблено БЕЗ `ANTHROPIC_API_KEY`. Кандидати,
> оголошені в `apps/server/scripts/eval/pipelines.*.ts` як `provider: "anthropic"`,
> у такому середовищі не викликали нічого: `getLLMProvider()` мовчки підмінив їх
> `StubProvider` (`apps/server/src/lib/llm/provider.ts:678`). Їх видно за
> латентністю `0` і вартістю `$0.0000/1k` — це НЕ результат моделі, це
> відсутність виклику. Рядки з суфіксом `-real` (`haiku45-real`,
> `sonnet46-real`, `premium-real`, `standard-real`, `floor-real`) додані через
> `--extra=` і пущені через OpenRouter — справжні лише вони плюс ті, що від
> початку оголошені `provider: "openrouter"`.
>
> Найнаочніше: `z-ai/glm-5.2` стоїть у таблиці двічі — `0/18` як
> anthropic-кандидат (заглушка) і `18/18` як `premium-real` (справжній виклик).
> Та сама модель, ті самі кейси. Це знахідка **B44** в
> [`ai-testing-2026-08-25.md`](../audits/ai-testing-2026-08-25.md); доки її не
> виправлено, стенд не можна читати без цього застереження.

Згенеровано: 2026-08-25T23:14:23.212Z

Кожен пайплайн подає моделі ТОЙ САМИЙ системний промпт, що й прод —
імпортом з продового білдера, не копією (таблиця «Промпти» нижче).
Судді бувають структурні (проганяють відповідь через прод-парсер —
їм можна вірити) і евристичні (лише звужують, що читати очима).
Рішення ухвалюється читанням секції «Повний текст», не колонкою «Суддя».

## Підсумок по кандидатах

| Кандидат                             | Модель                         | Пройшло | Голос | Медіанна затримка (мс) | Сер. вартість |
| ------------------------------------ | ------------------------------ | ------- | ----- | ---------------------- | ------------- |
| current default (Anthropic)          | `claude-haiku-4-5-20251001`    | 6/21    | —     | 0                      | $0.0000/1k    |
| OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | 78/84   | —     | 996                    | $0.2236/1k    |
| haiku45-real                         | `anthropic/claude-haiku-4.5`   | 18/21   | —     | 1638                   | $0.8026/1k    |
| current default (Anthropic)          | `claude-sonnet-4-6`            | 3/63    | —     | 0                      | $0.0000/1k    |
| sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | 59/63   | —     | 11254                  | $13.6300/1k   |
| current default (OpenRouter premium) | `openai/gpt-5.1`               | 11/12   | 1/12  | 2837                   | $2.8195/1k    |
| current standard tier                | `google/gemini-2.5-flash-lite` | 12/12   | 2/12  | 1031                   | $0.1740/1k    |
| current default (premium tier)       | `z-ai/glm-5.2`                 | 0/18    | 18/18 | 0                      | $0.0000/1k    |
| current standard tier                | `deepseek/deepseek-v4-flash`   | 0/18    | 18/18 | 0                      | $0.0000/1k    |
| current floor tier                   | `google/gemini-2.5-flash-lite` | 0/18    | 18/18 | 0                      | $0.0000/1k    |
| premium-real                         | `z-ai/glm-5.2`                 | 18/18   | 0/18  | 2023                   | $2.4970/1k    |
| standard-real                        | `deepseek/deepseek-v4-flash`   | 18/18   | 5/18  | 24248                  | $0.1520/1k    |
| floor-real                           | `google/gemini-2.5-flash-lite` | 18/18   | 9/18  | 790                    | $0.1745/1k    |
| baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | 16/24   | 17/24 | 861                    | $0.1871/1k    |

## Вартість: без кешу і з кешем

Формула кешу — `2 + 0.1·(N−1)` на стабільний префікс при TTL=1h;
обґрунтування живе у `src/modules/chat/promptCache.ts` (§ TTL).
Колонка «з кешем» — ПРОЄКЦІЯ: сам стенд шле `system` без `cache_control`,
тож `Cache read` у таблиці вище буде 0. Порожньо там, де прод кешу не
ставить взагалі.

| Пайплайн          | Кандидат                             | Модель                         | N=1                 | N=3                 | N=5                 | N=10                | N=20                |
| ----------------- | ------------------------------------ | ------------------------------ | ------------------- | ------------------- | ------------------- | ------------------- | ------------------- |
| classify          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| classify          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00003 / —        | $0.00010 / —        | $0.00017 / —        | $0.00035 / —        | $0.00070 / —        |
| classify          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | $0.00075 / —        | $0.00226 / —        | $0.00376 / —        | $0.00753 / —        | $0.01506 / —        |
| digest            | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| digest            | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00036 / —        | $0.00109 / —        | $0.00182 / —        | $0.00365 / —        | $0.00729 / —        |
| digest            | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.02331 / —        | $0.06992 / —        | $0.11654 / —        | $0.23307 / —        | $0.46615 / —        |
| mono              | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| mono              | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00007 / —        | $0.00020 / —        | $0.00033 / —        | $0.00066 / —        | $0.00132 / —        |
| mono              | haiku45-real                         | `anthropic/claude-haiku-4.5`   | $0.00093 / —        | $0.00278 / —        | $0.00464 / —        | $0.00927 / —        | $0.01854 / —        |
| coach-insight     | current default (OpenRouter premium) | `openai/gpt-5.1`               | $0.00282 / —        | $0.00846 / —        | $0.01410 / —        | $0.02819 / —        | $0.05639 / —        |
| coach-insight     | current standard tier                | `google/gemini-2.5-flash-lite` | $0.00017 / —        | $0.00052 / —        | $0.00087 / —        | $0.00174 / —        | $0.00348 / —        |
| chat              | current default (premium tier)       | `z-ai/glm-5.2`                 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| chat              | current standard tier                | `deepseek/deepseek-v4-flash`   | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| chat              | current floor tier                   | `google/gemini-2.5-flash-lite` | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 | $0.00000 / $0.00000 |
| chat              | premium-real                         | `z-ai/glm-5.2`                 | $0.00250 / $0.00428 | $0.00749 / $0.00606 | $0.01249 / $0.00784 | $0.02497 / $0.01228 | $0.04994 / $0.02116 |
| chat              | standard-real                        | `deepseek/deepseek-v4-flash`   | $0.00015 / $0.00028 | $0.00046 / $0.00035 | $0.00076 / $0.00042 | $0.00152 / $0.00059 | $0.00304 / $0.00093 |
| chat              | floor-real                           | `google/gemini-2.5-flash-lite` | $0.00017 / $0.00032 | $0.00052 / $0.00041 | $0.00087 / $0.00049 | $0.00174 / $0.00070 | $0.00349 / $0.00112 |
| analysis          | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | $0.00019 / $0.00034 | $0.00056 / $0.00044 | $0.00094 / $0.00055 | $0.00187 / $0.00081 | $0.00374 / $0.00134 |
| day-hint          | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| day-hint          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00007 / —        | $0.00022 / —        | $0.00037 / —        | $0.00074 / —        | $0.00148 / —        |
| day-hint          | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.00380 / —        | $0.01139 / —        | $0.01898 / —        | $0.03797 / —        | $0.07594 / —        |
| day-plan          | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| day-plan          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00039 / —        | $0.00116 / —        | $0.00193 / —        | $0.00387 / —        | $0.00774 / —        |
| day-plan          | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.01824 / —        | $0.05473 / —        | $0.09121 / —        | $0.18243 / —        | $0.36485 / —        |
| week-plan         | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| week-plan         | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00034 / —        | $0.00101 / —        | $0.00168 / —        | $0.00337 / —        | $0.00673 / —        |
| week-plan         | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.01532 / —        | $0.04595 / —        | $0.07659 / —        | $0.15317 / —        | $0.30634 / —        |
| shopping-list     | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| shopping-list     | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00015 / —        | $0.00045 / —        | $0.00075 / —        | $0.00150 / —        | $0.00299 / —        |
| shopping-list     | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.00413 / —        | $0.01239 / —        | $0.02066 / —        | $0.04132 / —        | $0.08263 / —        |
| recommend-recipes | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| recommend-recipes | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00055 / —        | $0.00166 / —        | $0.00277 / —        | $0.00555 / —        | $0.01110 / —        |
| recommend-recipes | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.02459 / —        | $0.07378 / —        | $0.12297 / —        | $0.24594 / —        | $0.49187 / —        |
| parse-pantry      | current default (Anthropic)          | `claude-sonnet-4-6`            | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        | $0.00000 / —        |
| parse-pantry      | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | $0.00011 / —        | $0.00033 / —        | $0.00055 / —        | $0.00109 / —        | $0.00218 / —        |
| parse-pantry      | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | $0.00336 / —        | $0.01007 / —        | $0.01679 / —        | $0.03357 / —        | $0.06714 / —        |

## По кейсах

| Пайплайн          | Кейс                             | Кандидат                             | Модель                         | OK  | Суддя                                                       | Голос         | Затримка (мс) | In   | Out  | Cache read | Вартість    |
| ----------------- | -------------------------------- | ------------------------------------ | ------------------------------ | --- | ----------------------------------------------------------- | ------------- | ------------- | ---- | ---- | ---------- | ----------- |
| classify          | MCC суперечить торговцю          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 1             | 0    | 0    | —          | $0.0000/1k  |
| classify          | MCC суперечить торговцю          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | MCC суперечить торговцю          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | MCC суперечить торговцю          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1020          | 294  | 14   | —          | $0.0350/1k  |
| classify          | MCC суперечить торговцю          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 966           | 294  | 14   | —          | $0.0350/1k  |
| classify          | MCC суперечить торговцю          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 456           | 294  | 14   | —          | $0.0350/1k  |
| classify          | MCC суперечить торговцю          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1635          | 309  | 85   | —          | $0.7340/1k  |
| classify          | MCC суперечить торговцю          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1638          | 309  | 96   | —          | $0.7890/1k  |
| classify          | MCC суперечить торговцю          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1886          | 309  | 117  | —          | $0.8940/1k  |
| classify          | торговець поза списком категорій | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | торговець поза списком категорій | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | торговець поза списком категорій | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | торговець поза списком категорій | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 444           | 291  | 14   | —          | $0.0347/1k  |
| classify          | торговець поза списком категорій | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 444           | 291  | 14   | —          | $0.0347/1k  |
| classify          | торговець поза списком категорій | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 988           | 291  | 14   | —          | $0.0347/1k  |
| classify          | торговець поза списком категорій | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1643          | 308  | 92   | —          | $0.7680/1k  |
| classify          | торговець поза списком категорій | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1629          | 308  | 98   | —          | $0.7980/1k  |
| classify          | торговець поза списком категорій | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1592          | 308  | 95   | —          | $0.7830/1k  |
| classify          | надходження, не переказ          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | надходження, не переказ          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | надходження, не переказ          | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | надходження, не переказ          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1168          | 302  | 14   | —          | $0.0358/1k  |
| classify          | надходження, не переказ          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 438           | 302  | 19   | —          | $0.0378/1k  |
| classify          | надходження, не переказ          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 459           | 302  | 14   | —          | $0.0358/1k  |
| classify          | надходження, не переказ          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1737          | 318  | 82   | —          | $0.7280/1k  |
| classify          | надходження, не переказ          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1643          | 318  | 91   | —          | $0.7730/1k  |
| classify          | надходження, не переказ          | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1706          | 318  | 90   | —          | $0.7680/1k  |
| classify          | замаскований P2P                 | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | замаскований P2P                 | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | замаскований P2P                 | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | замаскований P2P                 | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 653           | 295  | 14   | —          | $0.0351/1k  |
| classify          | замаскований P2P                 | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 424           | 295  | 14   | —          | $0.0351/1k  |
| classify          | замаскований P2P                 | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 390           | 295  | 14   | —          | $0.0351/1k  |
| classify          | замаскований P2P                 | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1753          | 311  | 83   | —          | $0.7260/1k  |
| classify          | замаскований P2P                 | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1448          | 311  | 82   | —          | $0.7210/1k  |
| classify          | замаскований P2P                 | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1573          | 311  | 81   | —          | $0.7160/1k  |
| classify          | нерозбірливий дескриптор         | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | нерозбірливий дескриптор         | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | нерозбірливий дескриптор         | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| classify          | нерозбірливий дескриптор         | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 437           | 281  | 14   | —          | $0.0337/1k  |
| classify          | нерозбірливий дескриптор         | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 468           | 281  | 14   | —          | $0.0337/1k  |
| classify          | нерозбірливий дескриптор         | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 519           | 281  | 14   | —          | $0.0337/1k  |
| classify          | нерозбірливий дескриптор         | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1682          | 298  | 87   | —          | $0.7330/1k  |
| classify          | нерозбірливий дескриптор         | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 2029          | 298  | 78   | —          | $0.6880/1k  |
| classify          | нерозбірливий дескриптор         | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1946          | 298  | 75   | —          | $0.6730/1k  |
| digest            | повний тиждень                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | повний тиждень                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | повний тиждень                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | повний тиждень                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3526          | 1171 | 784  | —          | $0.4307/1k  |
| digest            | повний тиждень                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2966          | 1171 | 784  | —          | $0.4307/1k  |
| digest            | повний тиждень                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2700          | 1171 | 697  | —          | $0.3959/1k  |
| digest            | повний тиждень                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 35322         | 1341 | 1663 | —          | $28.9680/1k |
| digest            | повний тиждень                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 34025         | 1341 | 1589 | —          | $27.8580/1k |
| digest            | повний тиждень                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 34986         | 1341 | 1628 | —          | $28.4430/1k |
| digest            | дірка в даних                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | дірка в даних                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | дірка в даних                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | дірка в даних                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3016          | 1133 | 727  | —          | $0.4041/1k  |
| digest            | дірка в даних                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3322          | 1133 | 810  | —          | $0.4373/1k  |
| digest            | дірка в даних                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2843          | 1133 | 689  | —          | $0.3889/1k  |
| digest            | дірка в даних                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 31102         | 1303 | 1425 | —          | $25.2840/1k |
| digest            | дірка в даних                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 30073         | 1303 | 1387 | —          | $24.7140/1k |
| digest            | дірка в даних                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 29693         | 1303 | 1397 | —          | $24.8640/1k |
| digest            | один модуль із чотирьох          | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | один модуль із чотирьох          | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | один модуль із чотирьох          | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | один модуль із чотирьох          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1423          | 908  | 257  | —          | $0.1936/1k  |
| digest            | один модуль із чотирьох          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1410          | 908  | 212  | —          | $0.1756/1k  |
| digest            | один модуль із чотирьох          | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1244          | 908  | 221  | —          | $0.1792/1k  |
| digest            | один модуль із чотирьох          | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 11846         | 1087 | 537  | —          | $11.3160/1k |
| digest            | один модуль із чотирьох          | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 10828         | 1087 | 498  | —          | $10.7310/1k |
| digest            | один модуль із чотирьох          | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 11254         | 1087 | 536  | —          | $11.3010/1k |
| digest            | перевитрата з боргом             | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | перевитрата з боргом             | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | перевитрата з боргом             | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ не пройшов WeeklyDigestReportSchema — прод віддав би 502 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| digest            | перевитрата з боргом             | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2764          | 1175 | 749  | —          | $0.4171/1k  |
| digest            | перевитрата з боргом             | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3048          | 1175 | 903  | —          | $0.4787/1k  |
| digest            | перевитрата з боргом             | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3600          | 1175 | 813  | —          | $0.4427/1k  |
| digest            | перевитрата з боргом             | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 37340         | 1339 | 1705 | —          | $29.5920/1k |
| digest            | перевитрата з боргом             | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 31767         | 1339 | 1487 | —          | $26.3220/1k |
| digest            | перевитрата з боргом             | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 38079         | 1339 | 1752 | —          | $30.2970/1k |
| mono              | чиста партія                     | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | чиста партія                     | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | чиста партія                     | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | чиста партія                     | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 587           | 394  | 44   | —          | $0.0570/1k  |
| mono              | чиста партія                     | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 996           | 394  | 44   | —          | $0.0570/1k  |
| mono              | чиста партія                     | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 666           | 394  | 44   | —          | $0.0570/1k  |
| mono              | чиста партія                     | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1153          | 403  | 77   | —          | $0.7880/1k  |
| mono              | чиста партія                     | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1421          | 403  | 77   | —          | $0.7880/1k  |
| mono              | чиста партія                     | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ✅                                                          | —             | 1196          | 403  | 77   | —          | $0.7880/1k  |
| mono              | партія зі сміттям                | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | партія зі сміттям                | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | партія зі сміттям                | current default (Anthropic)          | `claude-haiku-4-5-20251001`    | ✅  | ❌                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| mono              | партія зі сміттям                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 615           | 455  | 74   | —          | $0.0751/1k  |
| mono              | партія зі сміттям                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 668           | 455  | 73   | —          | $0.0747/1k  |
| mono              | партія зі сміттям                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 640           | 455  | 73   | —          | $0.0747/1k  |
| mono              | партія зі сміттям                | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ❌                                                          | —             | 1710          | 456  | 122  | —          | $1.0660/1k  |
| mono              | партія зі сміттям                | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ❌                                                          | —             | 1266          | 456  | 122  | —          | $1.0660/1k  |
| mono              | партія зі сміттям                | haiku45-real                         | `anthropic/claude-haiku-4.5`   | ✅  | ❌                                                          | —             | 1406          | 456  | 122  | —          | $1.0660/1k  |
| coach-insight     | звичайний тиждень                | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2638          | 1369 | 124  | —          | $2.9512/1k  |
| coach-insight     | звичайний тиждень                | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2837          | 1369 | 130  | —          | $3.0112/1k  |
| coach-insight     | звичайний тиждень                | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ❌ не знайдено жодного числа з даних                        | ❌ markdown   | 3092          | 1369 | 122  | —          | $2.9312/1k  |
| coach-insight     | звичайний тиждень                | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1668          | 1379 | 203  | —          | $0.2191/1k  |
| coach-insight     | звичайний тиждень                | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1031          | 1379 | 148  | —          | $0.1971/1k  |
| coach-insight     | звичайний тиждень                | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1128          | 1379 | 154  | —          | $0.1995/1k  |
| coach-insight     | дати немає                       | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 3261          | 1247 | 126  | —          | $2.8188/1k  |
| coach-insight     | дати немає                       | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2399          | 1247 | 91   | —          | $2.4688/1k  |
| coach-insight     | дати немає                       | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2203          | 1247 | 90   | —          | $2.4588/1k  |
| coach-insight     | дати немає                       | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1075          | 1249 | 143  | —          | $0.1821/1k  |
| coach-insight     | дати немає                       | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 968           | 1249 | 136  | —          | $0.1793/1k  |
| coach-insight     | дати немає                       | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1158          | 1249 | 179  | —          | $0.1965/1k  |
| coach-insight     | порожній перший сеанс            | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ✅            | 2767          | 970  | 126  | —          | $2.4725/1k  |
| coach-insight     | порожній перший сеанс            | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2674          | 970  | 175  | —          | $2.9625/1k  |
| coach-insight     | порожній перший сеанс            | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 2708          | 970  | 181  | —          | $3.0225/1k  |
| coach-insight     | порожній перший сеанс            | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 859           | 921  | 85   | —          | $0.1261/1k  |
| coach-insight     | порожній перший сеанс            | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ чужа особа | 718           | 921  | 67   | —          | $0.1189/1k  |
| coach-insight     | порожній перший сеанс            | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 671           | 921  | 55   | —          | $0.1141/1k  |
| coach-insight     | регрес проти пам'яті             | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 3161          | 1271 | 140  | —          | $2.9888/1k  |
| coach-insight     | регрес проти пам'яті             | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 3126          | 1271 | 108  | —          | $2.6688/1k  |
| coach-insight     | регрес проти пам'яті             | current default (OpenRouter premium) | `openai/gpt-5.1`               | ✅  | ✅                                                          | ❌ markdown   | 4112          | 1271 | 149  | —          | $3.0787/1k  |
| coach-insight     | регрес проти пам'яті             | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1202          | 1279 | 176  | —          | $0.1983/1k  |
| coach-insight     | регрес проти пам'яті             | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 837           | 1279 | 106  | —          | $0.1703/1k  |
| coach-insight     | регрес проти пам'яті             | current standard tier                | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 994           | 1279 | 146  | —          | $0.1863/1k  |
| chat              | проста порада                    | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 1             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 1             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | проста порада                    | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 2898          | 1567 | 342  | —          | $3.1438/1k  |
| chat              | проста порада                    | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1128          | 1567 | 102  | —          | $2.2462/1k  |
| chat              | проста порада                    | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1265          | 1567 | 125  | —          | $2.3322/1k  |
| chat              | проста порада                    | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ✅            | 12991         | 1773 | 53   | —          | $0.1447/1k  |
| chat              | проста порада                    | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ✅            | 19295         | 1773 | 60   | —          | $0.1458/1k  |
| chat              | проста порада                    | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 16817         | 1773 | 63   | —          | $0.1462/1k  |
| chat              | проста порада                    | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 1368          | 1542 | 41   | —          | $0.1706/1k  |
| chat              | проста порада                    | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 731           | 1542 | 48   | —          | $0.1734/1k  |
| chat              | проста порада                    | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 730           | 1542 | 39   | —          | $0.1698/1k  |
| chat              | багато категорій                 | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | багато категорій                 | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1707          | 1580 | 207  | —          | $2.6544/1k  |
| chat              | багато категорій                 | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1801          | 1580 | 214  | —          | $2.6806/1k  |
| chat              | багато категорій                 | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1625          | 1580 | 208  | —          | $2.6581/1k  |
| chat              | багато категорій                 | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 39279         | 1784 | 149  | —          | $0.1603/1k  |
| chat              | багато категорій                 | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 30728         | 1784 | 114  | —          | $0.1549/1k  |
| chat              | багато категорій                 | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 37805         | 1784 | 128  | —          | $0.1571/1k  |
| chat              | багато категорій                 | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 864           | 1556 | 87   | —          | $0.1904/1k  |
| chat              | багато категорій                 | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 836           | 1556 | 87   | —          | $0.1904/1k  |
| chat              | багато категорій                 | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 790           | 1556 | 82   | —          | $0.1884/1k  |
| chat              | порожні дані                     | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порожні дані                     | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1315          | 1545 | 121  | —          | $2.2911/1k  |
| chat              | порожні дані                     | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 947           | 1545 | 101  | —          | $2.2163/1k  |
| chat              | порожні дані                     | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1190          | 1545 | 122  | —          | $2.2948/1k  |
| chat              | порожні дані                     | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 18902         | 1747 | 97   | —          | $0.1495/1k  |
| chat              | порожні дані                     | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ✅            | 18990         | 1747 | 81   | —          | $0.1470/1k  |
| chat              | порожні дані                     | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ✅            | 18878         | 1747 | 58   | —          | $0.1435/1k  |
| chat              | порожні дані                     | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 776           | 1513 | 45   | —          | $0.1693/1k  |
| chat              | порожні дані                     | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 748           | 1513 | 34   | —          | $0.1649/1k  |
| chat              | порожні дані                     | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 626           | 1513 | 20   | —          | $0.1593/1k  |
| chat              | перевитрата                      | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | перевитрата                      | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 1685          | 1561 | 187  | —          | $2.5570/1k  |
| chat              | перевитрата                      | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 9407          | 1561 | 178  | —          | $2.5233/1k  |
| chat              | перевитрата                      | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 2023          | 1561 | 198  | —          | $2.5981/1k  |
| chat              | перевитрата                      | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 25396         | 1769 | 114  | —          | $0.1538/1k  |
| chat              | перевитрата                      | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 14453         | 1769 | 126  | —          | $0.1556/1k  |
| chat              | перевитрата                      | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ✅            | 30047         | 1769 | 119  | —          | $0.1545/1k  |
| chat              | перевитрата                      | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 832           | 1535 | 50   | —          | $0.1735/1k  |
| chat              | перевитрата                      | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 827           | 1535 | 47   | —          | $0.1723/1k  |
| chat              | перевитрата                      | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 1157          | 1535 | 53   | —          | $0.1747/1k  |
| chat              | порівняння періодів              | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | порівняння періодів              | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 3271          | 1566 | 112  | —          | $2.2824/1k  |
| chat              | порівняння періодів              | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 3613          | 1566 | 110  | —          | $2.2749/1k  |
| chat              | порівняння періодів              | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 4988          | 1566 | 113  | —          | $2.2862/1k  |
| chat              | порівняння періодів              | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 40070         | 1770 | 128  | —          | $0.1560/1k  |
| chat              | порівняння періодів              | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 30795         | 1770 | 105  | —          | $0.1525/1k  |
| chat              | порівняння періодів              | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 24248         | 1770 | 101  | —          | $0.1518/1k  |
| chat              | порівняння періодів              | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 872           | 1534 | 56   | —          | $0.1758/1k  |
| chat              | порівняння періодів              | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 765           | 1534 | 48   | —          | $0.1726/1k  |
| chat              | порівняння періодів              | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 852           | 1534 | 55   | —          | $0.1754/1k  |
| chat              | крос-модульний                   | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current default (premium tier)       | `z-ai/glm-5.2`                 | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current standard tier                | `deepseek/deepseek-v4-flash`   | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | current floor tier                   | `google/gemini-2.5-flash-lite` | ✅  | ❌ порожня або не українська відповідь                      | ✅            | 0             | 0    | 0    | —          | $0.0000/1k  |
| chat              | крос-модульний                   | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 3433          | 1560 | 197  | —          | $2.5932/1k  |
| chat              | крос-модульний                   | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 3787          | 1560 | 198  | —          | $2.5969/1k  |
| chat              | крос-модульний                   | premium-real                         | `z-ai/glm-5.2`                 | ✅  | ✅                                                          | ❌ markdown   | 3927          | 1560 | 230  | —          | $2.7166/1k  |
| chat              | крос-модульний                   | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 22673         | 1767 | 115  | —          | $0.1538/1k  |
| chat              | крос-модульний                   | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 36040         | 1767 | 131  | —          | $0.1562/1k  |
| chat              | крос-модульний                   | standard-real                        | `deepseek/deepseek-v4-flash`   | ✅  | ✅                                                          | ❌ markdown   | 23565         | 1767 | 114  | —          | $0.1536/1k  |
| chat              | крос-модульний                   | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 773           | 1532 | 51   | —          | $0.1736/1k  |
| chat              | крос-модульний                   | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 749           | 1532 | 52   | —          | $0.1740/1k  |
| chat              | крос-модульний                   | floor-real                           | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 733           | 1532 | 48   | —          | $0.1724/1k  |
| analysis          | суперечливі дані                 | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено визнання розбіжності в сумах                 | ✅            | 697           | 1544 | 54   | —          | $0.1760/1k  |
| analysis          | суперечливі дані                 | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено визнання розбіжності в сумах                 | ✅            | 873           | 1544 | 60   | —          | $0.1784/1k  |
| analysis          | суперечливі дані                 | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено визнання розбіжності в сумах                 | ✅            | 745           | 1544 | 53   | —          | $0.1756/1k  |
| analysis          | разовий сплеск                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 764           | 1544 | 50   | —          | $0.1744/1k  |
| analysis          | разовий сплеск                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 718           | 1544 | 50   | —          | $0.1744/1k  |
| analysis          | разовий сплеск                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 748           | 1544 | 46   | —          | $0.1728/1k  |
| analysis          | пріоритезація                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 1139          | 1559 | 145  | —          | $0.2139/1k  |
| analysis          | пріоритезація                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1277          | 1559 | 183  | —          | $0.2291/1k  |
| analysis          | пріоритезація                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1011          | 1559 | 95   | —          | $0.1939/1k  |
| analysis          | крос-модульний звʼязок           | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено названий звʼязок між подіями                 | ❌ markdown   | 1026          | 1569 | 115  | —          | $0.2029/1k  |
| analysis          | крос-модульний звʼязок           | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено названий звʼязок між подіями                 | ❌ markdown   | 891           | 1569 | 92   | —          | $0.1937/1k  |
| analysis          | крос-модульний звʼязок           | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено названий звʼязок між подіями                 | ❌ markdown   | 1003          | 1569 | 112  | —          | $0.2017/1k  |
| analysis          | хибна причинність                | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено розрізнення кореляції та причини             | ❌ Ви         | 778           | 1560 | 47   | —          | $0.1748/1k  |
| analysis          | хибна причинність                | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 856           | 1560 | 64   | —          | $0.1816/1k  |
| analysis          | хибна причинність                | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 883           | 1560 | 72   | —          | $0.1848/1k  |
| analysis          | дірка в даних                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 779           | 1570 | 61   | —          | $0.1814/1k  |
| analysis          | дірка в даних                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 859           | 1570 | 54   | —          | $0.1786/1k  |
| analysis          | дірка в даних                    | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 818           | 1570 | 63   | —          | $0.1822/1k  |
| analysis          | неправдоподібне число            | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ❌ markdown   | 1068          | 1545 | 67   | —          | $0.1813/1k  |
| analysis          | неправдоподібне число            | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 763           | 1545 | 61   | —          | $0.1789/1k  |
| analysis          | неправдоподібне число            | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не знайдено сумнів у некоректному записі                 | ✅            | 811           | 1545 | 74   | —          | $0.1841/1k  |
| analysis          | недосяжна ціль                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 1170          | 1564 | 82   | —          | $0.1892/1k  |
| analysis          | недосяжна ціль                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 861           | 1564 | 83   | —          | $0.1896/1k  |
| analysis          | недосяжна ціль                   | baseline (standard-кандидат)         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | ✅            | 901           | 1564 | 104  | —          | $0.1980/1k  |
| day-hint          | недобір білка                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | недобір білка                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | недобір білка                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | недобір білка                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ не помітив недобір білка (60 г при цілі 120 г)           | —             | 791           | 337  | 100  | —          | $0.0737/1k  |
| day-hint          | недобір білка                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 884           | 337  | 131  | —          | $0.0861/1k  |
| day-hint          | недобір білка                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 847           | 337  | 122  | —          | $0.0825/1k  |
| day-hint          | недобір білка                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5033          | 415  | 171  | —          | $3.8100/1k  |
| day-hint          | недобір білка                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5504          | 415  | 210  | —          | $4.3950/1k  |
| day-hint          | недобір білка                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5532          | 415  | 197  | —          | $4.2000/1k  |
| day-hint          | прийоми є, макросів немає        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | прийоми є, макросів немає        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | прийоми є, макросів немає        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | прийоми є, макросів немає        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 713           | 339  | 89   | —          | $0.0695/1k  |
| day-hint          | прийоми є, макросів немає        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 915           | 339  | 111  | —          | $0.0783/1k  |
| day-hint          | прийоми є, макросів немає        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 683           | 339  | 93   | —          | $0.0711/1k  |
| day-hint          | прийоми є, макросів немає        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5856          | 430  | 180  | —          | $3.9900/1k  |
| day-hint          | прийоми є, макросів немає        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 4930          | 430  | 161  | —          | $3.7050/1k  |
| day-hint          | прийоми є, макросів немає        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5112          | 430  | 165  | —          | $3.7650/1k  |
| day-hint          | цілі не задані                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | цілі не задані                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | цілі не задані                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля hint (прод покаже сирий текст)                 | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-hint          | цілі не задані                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 687           | 328  | 91   | —          | $0.0692/1k  |
| day-hint          | цілі не задані                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 721           | 328  | 101  | —          | $0.0732/1k  |
| day-hint          | цілі не задані                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 732           | 328  | 76   | —          | $0.0632/1k  |
| day-hint          | цілі не задані                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 5519          | 412  | 192  | —          | $4.1160/1k  |
| day-hint          | цілі не задані                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 3629          | 412  | 130  | —          | $3.1860/1k  |
| day-hint          | цілі не задані                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 3685          | 412  | 118  | —          | $3.0060/1k  |
| day-plan          | план під цілі                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0, треба ≥3                                        | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | план під цілі                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0, треба ≥3                                        | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | план під цілі                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0, треба ≥3                                        | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | план під цілі                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2802          | 690  | 827  | —          | $0.3998/1k  |
| day-plan          | план під цілі                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3199          | 690  | 1039 | —          | $0.4846/1k  |
| day-plan          | план під цілі                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3027          | 690  | 953  | —          | $0.4502/1k  |
| day-plan          | план під цілі                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 19209         | 842  | 991  | —          | $17.3910/1k |
| day-plan          | план під цілі                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 23733         | 842  | 1374 | —          | $23.1360/1k |
| day-plan          | план під цілі                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 23776         | 842  | 1308 | —          | $22.1460/1k |
| day-plan          | перегенерувати один прийом       | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній meals                                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | перегенерувати один прийом       | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній meals                                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | перегенерувати один прийом       | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній meals                                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | перегенерувати один прийом       | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1287          | 689  | 327  | —          | $0.1997/1k  |
| day-plan          | перегенерувати один прийом       | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1246          | 689  | 335  | —          | $0.2029/1k  |
| day-plan          | перегенерувати один прийом       | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1339          | 689  | 351  | —          | $0.2093/1k  |
| day-plan          | перегенерувати один прийом       | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 8095          | 841  | 418  | —          | $8.7930/1k  |
| day-plan          | перегенерувати один прийом       | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 10199         | 841  | 476  | —          | $9.6630/1k  |
| day-plan          | перегенерувати один прийом       | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 8839          | 841  | 413  | —          | $8.7180/1k  |
| day-plan          | порожня комора                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0 — відмовився планувати                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | порожня комора                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0 — відмовився планувати                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | порожня комора                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ страв 0 — відмовився планувати                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| day-plan          | порожня комора                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3787          | 628  | 1140 | —          | $0.5188/1k  |
| day-plan          | порожня комора                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3135          | 628  | 1085 | —          | $0.4968/1k  |
| day-plan          | порожня комора                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3455          | 628  | 1144 | —          | $0.5204/1k  |
| day-plan          | порожня комора                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 26725         | 773  | 1500 | —          | $24.8190/1k |
| day-plan          | порожня комора                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ❌ страв 0 — відмовився планувати                           | —             | 28424         | 773  | 1500 | —          | $24.8190/1k |
| day-plan          | порожня комора                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 27288         | 773  | 1492 | —          | $24.6990/1k |
| week-plan         | тиждень із комори                | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній days                                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | тиждень із комори                | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній days                                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | тиждень із комори                | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній days                                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | тиждень із комори                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2794          | 428  | 739  | —          | $0.3384/1k  |
| week-plan         | тиждень із комори                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2233          | 428  | 632  | —          | $0.2956/1k  |
| week-plan         | тиждень із комори                | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3102          | 428  | 791  | —          | $0.3592/1k  |
| week-plan         | тиждень із комори                | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 16884         | 545  | 1049 | —          | $17.3700/1k |
| week-plan         | тиждень із комори                | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 18403         | 545  | 1079 | —          | $17.8200/1k |
| week-plan         | тиждень із комори                | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 18159         | 545  | 1040 | —          | $17.2350/1k |
| week-plan         | комора порожня                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ днів 0 — відмовився планувати                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | комора порожня                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ днів 0 — відмовився планувати                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | комора порожня                   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ днів 0 — відмовився планувати                            | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| week-plan         | комора порожня                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3122          | 401  | 791  | —          | $0.3565/1k  |
| week-plan         | комора порожня                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3099          | 401  | 705  | —          | $0.3221/1k  |
| week-plan         | комора порожня                   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 2963          | 401  | 769  | —          | $0.3477/1k  |
| week-plan         | комора порожня                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 19471         | 518  | 789  | —          | $13.3890/1k |
| week-plan         | комора порожня                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 17263         | 518  | 710  | —          | $12.2040/1k |
| week-plan         | комора порожня                   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 19879         | 518  | 822  | —          | $13.8840/1k |
| shopping-list     | виключити наявне в коморі        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній список                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | виключити наявне в коморі        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній список                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | виключити наявне в коморі        | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній список                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | виключити наявне в коморі        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ вже в коморі: олія                                       | —             | 899           | 775  | 224  | —          | $0.1671/1k  |
| shopping-list     | виключити наявне в коморі        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 769           | 775  | 143  | —          | $0.1347/1k  |
| shopping-list     | виключити наявне в коморі        | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ вже в коморі: куряче філе, морква, рис                   | —             | 1130          | 775  | 375  | —          | $0.2275/1k  |
| shopping-list     | виключити наявне в коморі        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1947          | 948  | 58   | —          | $3.7140/1k  |
| shopping-list     | виключити наявне в коморі        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ❌ порожній список                                          | —             | 3822          | 948  | 191  | —          | $5.7090/1k  |
| shopping-list     | виключити наявне в коморі        | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2293          | 948  | 97   | —          | $4.2990/1k  |
| shopping-list     | дублікат між рецептами           | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ молоко 0 раз(и):                                         | —             | 1             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | дублікат між рецептами           | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ молоко 0 раз(и):                                         | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | дублікат між рецептами           | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ молоко 0 раз(и):                                         | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | дублікат між рецептами           | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 881           | 775  | 227  | —          | $0.1683/1k  |
| shopping-list     | дублікат між рецептами           | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 888           | 775  | 228  | —          | $0.1687/1k  |
| shopping-list     | дублікат між рецептами           | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 702           | 775  | 148  | —          | $0.1367/1k  |
| shopping-list     | дублікат між рецептами           | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ❌ молоко 0 раз(и):                                         | —             | 3779          | 948  | 195  | —          | $5.7690/1k  |
| shopping-list     | дублікат між рецептами           | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ❌ молоко 0 раз(и):                                         | —             | 3658          | 948  | 200  | —          | $5.8440/1k  |
| shopping-list     | дублікат між рецептами           | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1869          | 948  | 58   | —          | $3.7140/1k  |
| shopping-list     | усе вже є вдома                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля categories                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | усе вже є вдома                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля categories                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | усе вже є вдома                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ нема поля categories                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| shopping-list     | усе вже є вдома                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ вигадано: яйця, сіль                                     | —             | 683           | 704  | 133  | —          | $0.1236/1k  |
| shopping-list     | усе вже є вдома                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ вигадано: сіль                                           | —             | 566           | 704  | 98   | —          | $0.1096/1k  |
| shopping-list     | усе вже є вдома                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ❌ вигадано: сіль                                           | —             | 1068          | 704  | 98   | —          | $0.1096/1k  |
| shopping-list     | усе вже є вдома                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1534          | 864  | 8    | —          | $2.7120/1k  |
| shopping-list     | усе вже є вдома                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1172          | 864  | 8    | —          | $2.7120/1k  |
| shopping-list     | усе вже є вдома                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1193          | 864  | 8    | —          | $2.7120/1k  |
| recommend-recipes | pantryMode=only                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | pantryMode=only                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | pantryMode=only                  | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | pantryMode=only                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3527          | 880  | 1040 | —          | $0.5040/1k  |
| recommend-recipes | pantryMode=only                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3557          | 880  | 1147 | —          | $0.5468/1k  |
| recommend-recipes | pantryMode=only                  | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3847          | 880  | 1172 | —          | $0.5568/1k  |
| recommend-recipes | pantryMode=only                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 25205         | 1105 | 1351 | —          | $23.5800/1k |
| recommend-recipes | pantryMode=only                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 30918         | 1105 | 1559 | —          | $26.7000/1k |
| recommend-recipes | pantryMode=only                  | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 22971         | 1105 | 1312 | —          | $22.9950/1k |
| recommend-recipes | алерген у виключеннях            | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | алерген у виключеннях            | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | алерген у виключеннях            | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0, треба ≥2                                     | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | алерген у виключеннях            | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 4013          | 855  | 1218 | —          | $0.5727/1k  |
| recommend-recipes | алерген у виключеннях            | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3915          | 855  | 1193 | —          | $0.5627/1k  |
| recommend-recipes | алерген у виключеннях            | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 4109          | 855  | 1240 | —          | $0.5815/1k  |
| recommend-recipes | алерген у виключеннях            | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 22893         | 1072 | 1268 | —          | $22.2360/1k |
| recommend-recipes | алерген у виключеннях            | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 27677         | 1072 | 1466 | —          | $25.2060/1k |
| recommend-recipes | алерген у виключеннях            | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 27386         | 1072 | 1482 | —          | $25.4460/1k |
| recommend-recipes | обрізана відповідь               | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0 — відповідь обірвалась на ліміті токенів      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | обрізана відповідь               | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0 — відповідь обірвалась на ліміті токенів      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | обрізана відповідь               | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ рецептів 0 — відповідь обірвалась на ліміті токенів      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| recommend-recipes | обрізана відповідь               | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3993          | 880  | 1195 | —          | $0.5660/1k  |
| recommend-recipes | обрізана відповідь               | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 3591          | 880  | 1063 | —          | $0.5132/1k  |
| recommend-recipes | обрізана відповідь               | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 4249          | 880  | 1253 | —          | $0.5892/1k  |
| recommend-recipes | обрізана відповідь               | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 26677         | 1105 | 1445 | —          | $24.9900/1k |
| recommend-recipes | обрізана відповідь               | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 28553         | 1105 | 1432 | —          | $24.7950/1k |
| recommend-recipes | обрізана відповідь               | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 29126         | 1105 | 1472 | —          | $25.3950/1k |
| parse-pantry      | дублікати й одиниці              | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній items                                           | —             | 1             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | дублікати й одиниці              | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній items                                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | дублікати й одиниці              | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ порожній items                                           | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | дублікати й одиниці              | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 1409          | 495  | 282  | —          | $0.1623/1k  |
| parse-pantry      | дублікати й одиниці              | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 961           | 495  | 280  | —          | $0.1615/1k  |
| parse-pantry      | дублікати й одиниці              | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 987           | 495  | 280  | —          | $0.1615/1k  |
| parse-pantry      | дублікати й одиниці              | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2525          | 634  | 164  | —          | $4.3620/1k  |
| parse-pantry      | дублікати й одиниці              | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2720          | 634  | 164  | —          | $4.3620/1k  |
| parse-pantry      | дублікати й одиниці              | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2555          | 634  | 164  | —          | $4.3620/1k  |
| parse-pantry      | надиктований текст з помилками   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ позицій 0, треба ≥3                                      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | надиктований текст з помилками   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ позицій 0, треба ≥3                                      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | надиктований текст з помилками   | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ❌ позицій 0, треба ≥3                                      | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | надиктований текст з помилками   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 699           | 475  | 165  | —          | $0.1135/1k  |
| parse-pantry      | надиктований текст з помилками   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 790           | 475  | 165  | —          | $0.1135/1k  |
| parse-pantry      | надиктований текст з помилками   | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 743           | 475  | 165  | —          | $0.1135/1k  |
| parse-pantry      | надиктований текст з помилками   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2579          | 613  | 130  | —          | $3.7890/1k  |
| parse-pantry      | надиктований текст з помилками   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2306          | 613  | 130  | —          | $3.7890/1k  |
| parse-pantry      | надиктований текст з помилками   | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 2456          | 613  | 130  | —          | $3.7890/1k  |
| parse-pantry      | порожній сенс                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | порожній сенс                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | порожній сенс                    | current default (Anthropic)          | `claude-sonnet-4-6`            | ✅  | ✅                                                          | —             | 0             | 0    | 0    | —          | $0.0000/1k  |
| parse-pantry      | порожній сенс                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 478           | 462  | 14   | —          | $0.0518/1k  |
| parse-pantry      | порожній сенс                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 507           | 462  | 14   | —          | $0.0518/1k  |
| parse-pantry      | порожній сенс                    | OpenRouter Gemini Flash Lite         | `google/gemini-2.5-flash-lite` | ✅  | ✅                                                          | —             | 444           | 462  | 14   | —          | $0.0518/1k  |
| parse-pantry      | порожній сенс                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1223          | 600  | 8    | —          | $1.9200/1k  |
| parse-pantry      | порожній сенс                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1122          | 600  | 8    | —          | $1.9200/1k  |
| parse-pantry      | порожній сенс                    | sonnet46-real                        | `anthropic/claude-sonnet-4.6`  | ✅  | ✅                                                          | —             | 1177          | 600  | 8    | —          | $1.9200/1k  |

## Повний текст (розбіжності з базовою моделлю та провали судді)

Евристичний суддя не ухвалює рішення — він звужує, що читати очима.
Нижче сирі відповіді ЦІЛКОМ, без обрізання.

### classify / MCC суперечить торговцю — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ❌ провалив

```text
stub
```

### classify / MCC суперечить торговцю — current default (Anthropic) (`claude-haiku-4-5-20251001`)

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

### classify / MCC суперечить торговцю — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ❌ провалив

```text
stub
```

### classify / MCC суперечить торговцю — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

```text
{"category": "health", "confidence": 0.9}
```

### classify / MCC суперечить торговцю — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

```text
{"category": "health", "confidence": 1.0}
```

### classify / MCC суперечить торговцю — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

```text
{"category": "health", "confidence": 0.9}
```

### classify / MCC суперечить торговцю — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

````text
```json
{"category": "health", "confidence": 0.95}
````

The merchant description "АПТЕКА ПОДОРОЖНИК №12" (Pharmacy Podorozhnik #12) clearly identifies this as a pharmacy transaction. This overrides the MCC code (5169, which is typically wholesale chemicals). Pharmacies are definitively health category.

````

### classify / MCC суперечить торговцю — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

```text
```json
{"category": "health", "confidence": 0.95}
````

The merchant description "АПТЕКА ПОДОРОЖНИК №12" (Pharmacy Podorozhnik #12) clearly identifies this as a pharmacy, which falls under the health category. The MCC code 5169 (miscellaneous drug stores and pharmacies) aligns with this. This is a straightforward health transaction.

````

### classify / MCC суперечить торговцю — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: піти за числом MCC (5169 — оптова хімія → shopping) замість опису. Аптека — це health, і опис тут авторитетніший за код терміналу.

**Суддя:** ✅ пройшов

```text
```json
{"category": "health", "confidence": 0.95}
````

**Reasoning:**

- Merchant description "АПТЕКА ПОДОРОЖНИК №12" explicitly identifies this as a pharmacy (аптека)
- The name "Подорожник" is a well-known Ukrainian pharmacy chain
- MCC 5169 (drug stores and pharmacies) aligns with the merchant description
- This is clearly a human health transaction
- High confidence due to explicit pharmacy identifier in the description

````

### classify / надходження, не переказ — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ❌ провалив

```text
stub
````

### classify / надходження, не переказ — current default (Anthropic) (`claude-haiku-4-5-20251001`)

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

### classify / надходження, не переказ — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ❌ провалив

```text
stub
```

### classify / надходження, не переказ — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

```text
{"category": "income", "confidence": 0.9}
```

### classify / надходження, не переказ — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

````text
```json
{"category": "income", "confidence": 1.0}
````

````

### classify / надходження, не переказ — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

```text
{"category": "income", "confidence": 1.0}
````

### classify / надходження, не переказ — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

````text
```json
{"category": "income", "confidence": 0.95}
````

The description "ЗАРАХУВАННЯ ЗАРПЛАТИ ТОВ АЛЬФА" (Salary accrual from TOV ALPHA) clearly indicates income. The positive amount and salary-specific wording make this certain, regardless of the MCC code.

````

### classify / надходження, не переказ — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

```text
```json
{"category": "income", "confidence": 0.99}
````

The merchant description "ЗАРАХУВАННЯ ЗАРПЛАТИ ТОВ АЛЬФА" (Salary accrual from TOV ALFA) combined with a positive amount clearly indicates income. The MCC (6532) is irrelevant here as the description explicitly states this is a salary deposit.

````

### classify / надходження, не переказ — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: transfer. Зарплата з додатним знаком — income; плутанина income/transfer ламає всю фінансову картину, бо дохід зникає зі звіту.

**Суддя:** ✅ пройшов

```text
```json
{"category": "income", "confidence": 0.95}
````

The merchant description "ЗАРАХУВАННЯ ЗАРПЛАТИ ТОВ АЛЬФА" (Salary accrual from TOV ALFA) combined with a positive amount clearly indicates income. The MCC 6532 (financial institutions) is secondary to the explicit salary language in the description.

````

### classify / замаскований P2P — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ❌ провалив

```text
stub
````

### classify / замаскований P2P — current default (Anthropic) (`claude-haiku-4-5-20251001`)

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

### classify / замаскований P2P — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ❌ провалив

```text
stub
```

### classify / замаскований P2P — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

```text
{"category": "transfer", "confidence": 1.0}
```

### classify / замаскований P2P — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

```text
{"category": "transfer", "confidence": 1.0}
```

### classify / замаскований P2P — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

```text
{"category": "transfer", "confidence": 1.0}
```

### classify / замаскований P2P — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

````text
```json
{"category": "transfer", "confidence": 0.95}
````

The description "Переказ на картку 44**7788" (Transfer to card 44**7788) explicitly indicates a P2P card payment to another account, with the masked card number as evidence. This is a transfer between accounts, regardless of the MCC code.

````

### classify / замаскований P2P — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

```text
```json
{"category": "transfer", "confidence": 0.95}
````

The merchant description "Переказ на картку 44**7788" (Transfer to card 44**7788) explicitly indicates a card-to-card transfer with a masked card number. This is a P2P transfer between accounts, regardless of the MCC code.

````

### classify / замаскований P2P — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: shopping/other. Опис уже пройшов `maskPii`, номер картки перетворився на маску — модель має впізнати переказ, а не вирішити, що маска є назвою торговця.

**Суддя:** ✅ пройшов

```text
```json
{"category": "transfer", "confidence": 0.95}
````

The merchant description "Переказ на картку 44**7788" (Transfer to card 44**7788) clearly indicates a P2P card payment to another account. The masked card number confirms this is a transfer between accounts, regardless of the MCC code.

````

### digest / повний тиждень — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
````

### digest / повний тиждень — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

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

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / повний тиждень — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

````text
```json
{
  "finyk": {
    "summary": "Минулий тиждень виявився успішним, доходи значно перевищили витрати.",
    "comment": "Витрати склали 8420 грн при доходах 32000 грн, що нижче за місячний бюджет. Найбільші витрати зафіксовано на продукти (3100 грн) та їжу поза домом (2400 грн), загалом 41 транзакція.",
    "recommendations": [
      "Розгляньте можливість часткового відкладання надлишкових коштів для досягнення довгострокових фінансових цілей.",
      "Проаналізуйте структуру витрат на харчування, особливо харчування поза домом, для можливої оптимізації."
    ]
  },
  "fizruk": {
    "summary": "Тиждень пройшов активно, ви завершили 3 тренування із загальним об'ємом 12400 кг.",
    "comment": "Виконали три тренування, з найбільшим об'ємом у присіданнях (4200 кг). Стан відновлення оцінюється як нормальний, що свідчить про збалансоване навантаження.",
    "recommendations": [
      "Продовжуйте дотримуватися поточного режиму тренувань, приділяючи увагу присіданням.",
      "Забезпечте належний відпочинок та відновлення між тренуваннями для запобігання перевтоми."
    ]
  },
  "nutrition": {
    "summary": "Ви не досягли цільового показника калорійності, споживаючи менше, ніж планували.",
    "comment": "Середньодобова калорійність склала 1980 ккал при цілі 2200 ккал, що свідчить про дефіцит у 220 ккал. Співвідношення БЖВ: Б 96г / Ж 72г / В 210г.",
    "recommendations": [
      "Збільште споживання калорій, додавши здорові продукти до свого раціону, щоб досягти цільового показника.",
      "Перегляньте прийом їжі, щоб переконатися, що ви отримуєте достатньо білків, жирів та вуглеводів відповідно до ваших потреб."
    ]
  },
  "routine": {
    "summary": "Ваш загальний відсоток виконання звичок склав 71% за тиждень.",
    "comment": "Ви успішно виконували 3 активні звички. Читання було виконано у 4 з 7 днів (57%).",
    "recommendations": [
      "Зосередьтеся на збільшенні відсотка виконання тих звичок, які зараз відстають, зокрема читання.",
      "Прагніть послідовно виконувати всі заплановані звички щодня для досягнення кращих результатів."
    ]
  },
  "overallRecommendations": [
    "Слідкуйте за балансом між витратами та доходами, плануйте заощадження.",
    "Дотримуйтесь збалансованого харчування та регулярних тренувань для підтримки загального здоров'я."
  ]
}
````

````

### digest / повний тиждень — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Витрати значно нижчі за доходи, але перевищують місячний бюджет.",
    "comment": "За тиждень було витрачено 8420 грн при доходах 32000 грн. Проте, загальні витрати перевищили встановлений місячний бюджет у 30000 грн. Найбільші витрати зафіксовані на продукти (3100 грн) та їжу поза домом (2400 грн).",
    "recommendations": [
      "Перегляньте витрати на харчування поза домом, щоб утриматися в рамках бюджету.",
      "Складіть детальний план витрат на наступний місяць, враховуючи перевищення поточного бюджету."
    ]
  },
  "fizruk": {
    "summary": "За тиждень проведено 3 тренування із загальним об'ємом 12400 кг.",
    "comment": "Виконано 3 тренування, основний акцент зроблено на присідання. Стан відновлення оцінюється як нормальний, що свідчить про адекватне навантаження.",
    "recommendations": [
      "Продовжуйте дотримуватися запланованого тренувального графіку.",
      "Слідкуйте за прогресом у присіданнях та додавайте різноманіття до інших вправ."
    ]
  },
  "nutrition": {
    "summary": "Середньодобовий калораж нижчий за цільовий, з дефіцитом 220 ккал.",
    "comment": "Зафіксовано 6 днів із 7, що є добрим показником. Однак, середньодобове споживання калорій становить 1980 ккал при цілі 2200 ккал. Споживання білків (96г) та жирів (72г) виглядає адекватним, тоді як вуглеводів (210г) може бути недостатньо для досягнення цілі.",
    "recommendations": [
      "Збільште споживання калорій шляхом додавання складних вуглеводів до раціону.",
      "Переконайтеся, що ви їсте достатньо різноманітних продуктів для забезпечення всіх потреб організму."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок становить 71%, з акцентом на читання.",
    "comment": "Виконано 3 активні звички з 3. Звичка до читання виконана на 57% (4 з 7 днів).",
    "recommendations": [
      "Прагніть збільшити відсоток виконання всіх активних звичок до 100%.",
      "Створіть чіткий план для досягнення цільового показника звички читання."
    ]
  },
  "overallRecommendations": [
    "Зверніть увагу на перевищення бюджету за витратами, особливо на харчування поза домом, та скоригуйте свої витрати.",
    "Прагніть досягти цільового показника калоражу, додавши в раціон більше складних вуглеводів."
  ]
}
````

````

### digest / повний тиждень — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Минулого тижня доходи значно перевищили витрати, що дозволило досягти бюджету.",
    "comment": "Витрати склали 8420 грн при доходах 32000 грн. Найбільше коштів було витрачено на продукти (3100 грн) та їжу поза домом (2400 грн). Загальна кількість транзакцій – 41.",
    "recommendations": [
      "Проаналізуйте структуру витрат на харчування, щоб оптимізувати бюджет.",
      "Розгляньте можливість заощадження частини надлишкових доходів."
    ]
  },
  "fizruk": {
    "summary": "За тиждень було проведено 3 тренування із загальним об'ємом 12400 кг.",
    "comment": "Найбільший об'єм припав на присідання (4200 кг). Стан відновлення оцінюється як нормальний.",
    "recommendations": [
      "Продовжуйте дотримуватися запланованої програми тренувань.",
      "Стежте за самопочуттям і не забувайте про адекватне відновлення."
    ]
  },
  "nutrition": {
    "summary": "Середньодобове споживання калорій було меншим за цільове значення.",
    "comment": "Ви споживали в середньому 1980 ккал при цілі 2200 ккал, що свідчить про невеликий дефіцит. Середній розподіл БЖВ: білки 96г, жири 72г, вуглеводи 210г. Харчування зафіксовано 6 з 7 днів.",
    "recommendations": [
      "Намагайтеся дотримуватися цільової калорійності, можливо, збільшивши порції або додавши здорові перекуси.",
      "Перевірте, чи достатньо білків для ваших тренувальних цілей."
    ]
  },
  "routine": {
    "summary": "Загальне виконання звичок склало 71% від запланованого.",
    "comment": "Ви активно займалися 3 звичками. Звичка 'читання' була виконана в 4 з 7 днів (57%).",
    "recommendations": [
      "Прагніть збільшити відсоток виконання звичок до більш стабільних показників.",
      "Знайдіть способи інтегрувати читання у свій щоденний розклад частіше."
    ]
  },
  "overallRecommendations": [
    "Зверніть увагу на стабільність у виконанні харчових звичок, щоб досягти кращого балансу калорій.",
    "Поєднуйте регулярні тренування з відповідним харчуванням та режимом для максимального ефекту."
  ]
}
````

````

### digest / повний тиждень — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн із місячного бюджету 30000 грн, надходження склали 32000 грн.",
    "comment": "Тижневі витрати становлять близько 28% місячного бюджету — темп помірний, якщо решта місяця буде схожою. Найбільша стаття — продукти (3100 грн) та їжа поза домом (2400 грн): разом це 65% усіх витрат тижня. 41 транзакція за 7 днів — у середньому майже 6 платежів на день, що свідчить про активне дрібне споживання.",
    "recommendations": [
      "Їжа поза домом (2400 грн) наближається до вартості домашніх продуктів (3100 грн) — варто перевірити, чи це заплановані обіди або спонтанні витрати, і при потребі встановити тижневий ліміт на цю категорію.",
      "Велика кількість транзакцій (41) ускладнює контроль: спробуй консолідувати дрібні покупки або переглянути, які з них регулярні й чи всі вони потрібні."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12400 кг, стан відновлення — норма.",
    "comment": "Три тренування за тиждень — стандартна частота для силового циклу. Загальний об'єм 12400 кг виглядає солідно, причому лише на присідання припадає 4200 кг — третина всього тижневого об'єму, що вказує на акцент на нижню частину тіла. Стан відновлення в нормі, тож поточне навантаження організм переносить адекватно.",
    "recommendations": [
      "Присідання домінують в об'ємі — переконайся, що верхня частина тіла отримує пропорційне навантаження, щоб уникнути дисбалансу.",
      "При збереженні нормального відновлення можна поступово додавати об'єм або частоту — наприклад, перейти до 4 тренувань на тиждень, якщо це відповідає твоїм цілям."
    ]
  },
  "nutrition": {
    "summary": "Харчування зафіксовано в 6 із 7 днів: середньодобово 1980 ккал при цілі 2200 ккал, дефіцит 220 ккал.",
    "comment": "Покриття 6 із 7 днів достатнє для надійних середніх — пропущений день є, але не критично спотворює картину. Калорійний дефіцит 220 ккал на добу — систематичний недобір відносно цілі: за тиждень це орієнтовно 1320 ккал недоотриманого енергетичного ресурсу, що може уповільнювати відновлення після силових тренувань. Білок 96 г на добу — залежно від ваги тіла це може бути недостатньо для силового тренінгу: загальна рекомендація для силових спортсменів — 1,6–2,2 г на кг маси тіла.",
    "recommendations": [
      "Скорочуй дефіцит калорій: додай 1–2 прийоми їжі або збільш порції в поточних, щоб наблизитись до 2200 ккал — особливо важливо в дні тренувань.",
      "Перевір рівень білка відносно своєї ваги: якщо 96 г не покривають норму 1,6+ г/кг, додай білкові джерела — яйця, сир, бобові, м'ясо або рибу."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок — 71% із трьох активних звичок.",
    "comment": "71% по трьох звичках — непоганий результат, але є простір для росту. Читання виконувалось лише 4 із 7 днів (57%) — це найслабша з відстежуваних звичок і тягне загальний показник вниз. Дані по двох інших звичках відсутні в деталях, але середнє 71% при 57% читання означає, що решта виконується краще.",
    "recommendations": [
      "Для читання спробуй прив'язати звичку до вже усталеного ритуалу — наприклад, перед сном або під час ранкової кави, щоб зменшити кількість пропущених днів.",
      "Якщо хочеш підняти загальний відсоток вище 80%, визнач, яка з трьох звичок найлегше масштабується, і сфокусуйся на ній наступного тижня."
    ]
  },
  "overallRecommendations": [
    "Основний пріоритет тижня — закрити калорійний дефіцит: систематичне недоїдання при трьох силових тренуваннях гальмує прогрес і відновлення, тож збільшення калоражу до цілі 2200 ккал матиме прямий вплив на результат у залі.",
    "Фінанси й звички стабільні — щоб закріпити динаміку, веди записи харчування всі 7 днів наступного тижня і встанови конкретний тижневий ліміт на їжу поза домом, щоб ця категорія залишалась під контролем."
  ]
}
````

### digest / повний тиждень — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн із надходжень 32000 грн — бюджет поки що в нормі.",
    "comment": "Витрати становлять 28% від місячного бюджету 30000 грн, що виглядає помірно для першого тижня. Разом продукти та їжа поза домом забрали 5500 грн — це 65% усіх витрат тижня. Сума на їжу поза домом (2400 грн) майже дорівнює сумі на продукти (3100 грн), що може свідчити про часті кафе або замовлення доставки.",
    "recommendations": [
      "Відстежуй баланс між продуктами та їжею поза домом: якщо така пропорція збережеться 4 тижні, тільки ця категорія забере ~21600 грн із 30000 грн бюджету.",
      "41 транзакція за тиждень — це в середньому близько 6 на день; переглянь дрібні витрати, щоб виявити неочевидні 'витоки' бюджету."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12400 кг при нормальному стані відновлення.",
    "comment": "Три тренування на тиждень — стандартна частота для силового циклу, а стан відновлення 'норма' підтверджує, що навантаження не надмірне. Присідання склали 4200 кг — приблизно 34% від усього тижневого об'єму, що говорить про акцент на нижній частині тіла або базових рухах. Без даних про попередні тижні складно оцінити динаміку об'єму, але поточний показник виглядає збалансовано.",
    "recommendations": [
      "Якщо ціль — прогресія, фіксуй об'єм щотижня: навіть плато протягом 2–3 тижнів — сигнал переглянути інтенсивність або частоту.",
      "Перевір розподіл об'єму між групами м'язів: 34% на присідання — добре, але переконайся, що верхня частина тіла отримує порівнянне навантаження."
    ]
  },
  "nutrition": {
    "summary": "Харчування зафіксовано 6 із 7 днів — дані достатньо повні, середній добовий дефіцит становить 220 ккал відносно цілі 2200 ккал.",
    "comment": "Середньодобовий калораж 1980 ккал при цілі 2200 ккал означає систематичне недоїдання приблизно на 10%; за тиждень це накопичений дефіцит близько 1320 ккал. Білок 96 г на добу — нижче від рекомендованих ~1,6–2,2 г на кг маси тіла для людини з силовими тренуваннями (без даних про вагу точніше не рахується, але цифра виглядає скромно). Жири та вуглеводи в межах помірних норм, однак через дефіцит калорій загальна картина — недобір нутрієнтів."
    ,
    "recommendations": [
      "Спробуй додати 1–2 білкові прийоми їжі або перекуси (яйця, сир, бобові), щоб підтягнути і білок, і загальний калораж ближче до цілі 2200 ккал.",
      "Переконайся, що пропущений 7-й день не припав на тренувальний — саме в тренувальні дні ризик недоїдання найвищий."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок за тиждень — 71% по трьох активних звичках.",
    "comment": "71% — непоганий результат, але залишається простір для зростання. Читання виконувалось лише 4 із 7 днів (57%) — це найслабша з відстежуваних звичок і єдина, по якій є деталізація. Без розбивки по двох інших звичках незрозуміло, чи вони тягнуть середнє вгору, або теж мають пропуски.",
    "recommendations": [
      "Для читання спробуй прив'язати його до вже наявного ритуалу (наприклад, перед сном або після тренування) — це підвищує стабільність виконання.",
      "Додай деталізацію до всіх трьох звичок, щоб бачити, яка саме просідає, а не лише загальний відсоток."
    ]
  },
  "overallRecommendations": [
    "Головне завдання тижня — закрити розрив між калорійністю (1980 ккал) і ціллю (2200 ккал): при трьох силових тренуваннях систематичний дефіцит гальмує відновлення та прогрес.",
    "Фінанси, тренування та харчування зараз у зеленій зоні — зосередься на стабільності: підтягни читання до 6–7 днів на тиждень і збережи поточну тренувальну частоту на наступний тиждень."
  ]
}
```

### digest / повний тиждень — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: невалідний JSON, markdown-обгортка або відсутні ключі — прод на це віддає 502 ANTHROPIC_SHAPE_MISMATCH.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн із надходжень 32000 грн — бюджет під контролем.",
    "comment": "Витрати становлять 28% від тижневого надходження, що вкладається в місячний бюджет 30000 грн. Продукти (3100 грн) і їжа поза домом (2400 грн) разом забирають 65% усіх витрат — майже дві третини йде на харчування. 41 транзакція за тиждень — це близько 6 платежів на день, що свідчить про активне дрібне споживання.",
    "recommendations": [
      "Їжа поза домом (2400 грн) майже зрівнялася з витратами на продукти (3100 грн) — варто відстежити, чи це разові події або стала тенденція, і за потреби перенести частину цих витрат на домашнє приготування.",
      "При збереженні поточного темпу витрат (~8400 грн/тиждень) місячна сума може перевищити бюджет 30000 грн — слід тримати це на увазі у другій половині місяця."
    ]
  },
  "fizruk": {
    "summary": "Завершено 3 тренування за тиждень із загальним об'ємом 12400 кг і нормальним станом відновлення.",
    "comment": "3 тренування — це базова тижнева частота, яка забезпечує достатній стимул для прогресу при нормальному відновленні. Присідання склали 4200 кг із 12400 кг загального об'єму — це 34% усього навантаження, що вказує на акцент на нижній частині тіла. Стан відновлення в нормі, тому поточне навантаження організм переносить добре.",
    "recommendations": [
      "Якщо ціль — силовий прогрес, можна поступово додати четверте тренування або збільшити об'єм у межах поточних трьох сесій.",
      "Відстежуй розподіл об'єму між групами м'язів: домінування присідань (34%) може означати, що верх тіла або інші м'язові групи отримують менше навантаження."
    ]
  },
  "nutrition": {
    "summary": "Харчування зафіксовано в 6 із 7 днів — дані достатньо репрезентативні, середній дефіцит калорій становить 220 ккал на день.",
    "comment": "6 залогованих днів із 7 — хороше покриття, висновки по тижню можна вважати надійними. Щоденний дефіцит 220 ккал (1980 проти цілі 2200 ккал) є систематичним: за тиждень це ~1540 ккал недобору. Білок 96 г на добу — нижче від загальноприйнятої рекомендації ~1,6–2,2 г на кг маси тіла для людей із силовими тренуваннями; без знання твоєї ваги точну норму не порахувати, але цифра виглядає скромно для трьох силових сесій на тиждень.",
    "recommendations": [
      "Додай 200–300 ккал на день за рахунок продуктів із високим вмістом білка (яйця, сир, бобові, м'ясо), щоб закрити і калорійний дефіцит, і відставання по білку одночасно.",
      "Продовжуй щоденно логувати харчування — 6/7 це вже добра дисципліна, і повне покриття дасть точнішу картину для коригування раціону."
    ]
  },
  "routine": {
    "summary": "Звички виконуються на 71% із трьох активних, але читання стабільно пропускається — лише 4 дні з 7.",
    "comment": "Загальний відсоток 71% означає, що в середньому дві з трьох звичок виконуються щодня — прийнятний результат, але є резерв. Читання (57%, 4/7 днів) — єдина звичка з відомою статистикою, і вона не дотягує навіть до 4 днів із 7, що є найслабшою ланкою тижня. Дані по інших двох звичках не деталізовані, тому оцінити їх окремо неможливо.",
    "recommendations": [
      "Для читання спробуй прив'язати його до вже існуючої щоденної дії (наприклад, перед сном або вранці з кавою) — це підвищить стабільність виконання.",
      "Попроси додаток показати статистику по всіх трьох звичках окремо, щоб зрозуміти, яка саме тягне загальний відсоток вниз."
    ]
  },
  "overallRecommendations": [
    "Головний пріоритет тижня — збільшити калорійність і білок у раціоні: дефіцит 220 ккал і скромні 96 г білка на фоні трьох силових тренувань можуть гальмувати відновлення та прогрес.",
    "Фінанси і тренування стабільні — тепер варто посилити дисципліну звичок (особливо читання) і закрити білково-калорійний дефіцит, щоб тиждень був збалансованим у всіх чотирьох напрямках."
  ]
}
```

### digest / дірка в даних — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / дірка в даних — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

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

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / дірка в даних — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

````text
```json
{
  "finyk": {
    "summary": "Минулого тижня фінансової активності не було.",
    "comment": "Відсутні дані про витрати та надходження, а також про транзакції. Бюджет на місяць встановлено на рівні 30000 грн, але фактичні витрати та доходи не зафіксовані.",
    "recommendations": [
      "Плануйте та фіксуйте всі свої витрати та доходи для кращого контролю бюджету.",
      "Встановіть конкретні фінансові цілі на найближчий час."
    ]
  },
  "fizruk": {
    "summary": "Минулого тижня проведено 3 тренування із загальним об'ємом 12400 кг.",
    "comment": "Загальний об'єм тренувань є достатнім, а стан відновлення — в нормі. Найбільш інтенсивною вправою були присідання з об'ємом 4200 кг.",
    "recommendations": [
      "Продовжуйте дотримуватися плану тренувань та стежити за станом відновлення.",
      "Розгляньте можливість додавання нових вправ або збільшення навантаження на інші групи м'язів."
    ]
  },
  "nutrition": {
    "summary": "Середньодобове споживання калорій було нижчим за цільове.",
    "comment": "Зафіксовано лише 2 дні харчування із 7. Середньодобова калорійність склала 1980 ккал при цілі 2200 ккал, що означає дефіцит у 220 ккал. Макронутрієнтний баланс: Б 96г, Ж 72г, В 210г.",
    "recommendations": [
      "Збільште споживання калорій для досягнення цільового показника.",
      "Намагайтеся фіксувати харчування щодня для більш точного аналізу та корекції раціону."
    ]
  },
  "routine": {
    "summary": "Виконання звичок минулого тижня склало 71%.",
    "comment": "Активно відстежувалося 3 звички. Найкращий результат показала звичка читання, яка виконувалася 4 з 7 днів.",
    "recommendations": [
      "Продовжуйте роботу над виконанням звичок, прагнучи до 100% показника.",
      "Визначте причини невиконання звичок в інші дні та шукайте шляхи їх подолання."
    ]
  },
  "overallRecommendations": [
    "Зверніть увагу на важливість фіксації всіх даних, особливо фінансових та харчових, для повноцінного аналізу та досягнення цілей.",
    "Підтримуйте баланс між тренуваннями, харчуванням та відпочинком для загального покращення самопочуття."
  ]
}
````

````

### digest / дірка в даних — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня фінансова активність відсутня, як у витратах, так і в надходженнях.",
    "comment": "Жодних транзакцій не зафіксовано, що унеможливлює аналіз витрат та тенденцій. Бюджет на місяць становить 30000 грн, але протягом тижня не було жодного руху коштів.",
    "recommendations": [
      "Розгляньте можливість планування та фіксації ваших витрат, навіть якщо вони незначні.",
      "Заплануйте надходження або визначте джерела фінансування для досягнення місячного бюджету."
    ]
  },
  "fizruk": {
    "summary": "Виконано 3 тренування із загальним об'ємом 12400 кг, стан відновлення в нормі.",
    "comment": "Обсяг тренувань є досить значним, особливо зважаючи на 4200 кг у присіданнях. Стан відновлення в нормі свідчить про адекватне навантаження.",
    "recommendations": [
      "Продовжуйте стежити за станом відновлення, щоб уникнути перетренованості.",
      "Різноманіть комплекс вправ, додавши інші види навантаження для збалансованого розвитку."
    ]
  },
  "nutrition": {
    "summary": "Середньодобовий калораж становить 1980 ккал, що на 220 ккал менше за цільовий показник.",
    "comment": "Зафіксовано дефіцит калорій, що може бути як цільовим, так і випадковим через недостатню кількість днів із записами (лише 2 з 7). Середній БЖВ: Білки 96г, Жири 72г, Вуглеводи 210г.",
    "recommendations": [
      "Зверніть увагу на недостатню кількість днів із записами харчування; намагайтеся документувати свій раціон щодня для точнішого аналізу.",
      "Якщо дефіцит калорій є навмисним, переконайтеся, що він не призводить до дефіциту поживних речовин."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок складає 71%, з 3 активних звичок.",
    "comment": "Найбільш послідовною є звичка читання, яка виконана в 4 з 7 днів (57%). Інші звички не мають деталей, але загальний показник демонструє певну стабільність.",
    "recommendations": [
      "Спробуйте збільшити частоту виконання звички читання, доводячи її до 7 днів на тиждень.",
      "Проаналізуйте причини невиконання інших звичок та спробуйте інтегрувати їх у ваш щоденний розклад."
    ]
  },
  "overallRecommendations": [
    "Систематично документуйте свої витрати та надходження для кращого контролю над фінансами.",
    "Зверніть увагу на повноту записів харчування, адже лише 2 дні з 7 містили дані, що ускладнює глибокий аналіз."
  ]
}
````

````

### digest / дірка в даних — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня фінансова активність відсутня.",
    "comment": "Витрати та надходження за тиждень не зафіксовані. Неможливо проаналізувати структуру витрат чи визначити тенденції, оскільки транзакцій не було.",
    "recommendations": [
      "Рекомендується фіксувати всі витрати та надходження для кращого контролю бюджету.",
      "Сплануйте витрати відповідно до вашого місячного бюджету в 30000 грн."
    ]
  },
  "fizruk": {
    "summary": "За тиждень було проведено 3 тренування із загальним об'ємом 12400 кг.",
    "comment": "Об'єм тренувань відповідає запланованому, а стан відновлення оцінюється як нормальний. Найбільшу частку в об'ємі займають присідання.",
    "recommendations": [
      "Продовжуйте дотримуватися поточного режиму тренувань.",
      "Розгляньте можливість поступового збільшення навантаження або додавання нових вправ для подальшого прогресу."
    ]
  },
  "nutrition": {
    "summary": "Середньодобовий калораж нижчий за цільовий, з дефіцитом 220 ккал.",
    "comment": "Зафіксовано лише 2 дні з 7, тому зробити висновки щодо харчування складно. Поточний середній калораж (1980 ккал) не досягає цільового показника (2200 ккал).",
    "recommendations": [
      "Систематично записуйте всі прийоми їжі, щоб мати повну картину харчування.",
      "Збільште калорійність раціону, додавши більше білків, жирів та вуглеводів для досягнення цільових показників."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок склав 71% за тиждень.",
    "comment": "З 3 активних звичок, читання було виконано в 4 з 7 днів (57%). Інші звички не були зафіксовані.",
    "recommendations": [
      "Намагайтеся приділяти увагу всім активним звичкам щодня.",
      "Проаналізуйте, що заважає виконанню звичок, і скоригуйте свій розклад."
    ]
  },
  "overallRecommendations": [
    "Для повного аналізу даних, будь ласка, реєструйте всі свої витрати, надходження та прийоми їжі щодня.",
    "Розгляньте можливість поступового збільшення загального калоражу харчування до цільового показника."
  ]
}
````

````

### digest / дірка в даних — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень не зафіксовано жодної транзакції — фінансових даних немає.",
    "comment": "У період з 20 по 26 липня 2026 року витрати та надходження становлять 0 грн, транзакцій не зареєстровано. Місячний бюджет встановлено на рівні 30 000 грн, але оцінити його виконання неможливо через відсутність записів. Це може означати як реальну відсутність витрат, так і непоповнення даних у додатку.",
    "recommendations": ["Почни фіксувати всі витрати та надходження в додатку, щоб отримати реальну картину бюджету.", "Перевір, чи підключено автоматичний імпорт транзакцій з банку — це зменшить кількість пропусків."]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12 400 кг, стан відновлення в нормі.",
    "comment": "Три тренування за тиждень — стабільна частота, яка дає достатній стимул для прогресу. Загальний об'єм 12 400 кг свідчить про помірно-інтенсивне навантаження; присідання як топ-вправа з об'ємом 4 200 кг займають третину всього тижневого об'єму. Стан відновлення «норма» підтверджує, що поточне навантаження тіло переносить добре.",
    "recommendations": ["Стеж за прогресивним перевантаженням у присіданнях — фіксуй робочі ваги, щоб планомірно збільшувати об'єм.", "Додай різноманітність: якщо більшість тренувань будуються навколо присідань, розглянь включення тяжіння або жимових рухів для балансу м'язових груп."]
  },
  "nutrition": {
    "summary": "Харчування залоговано лише 2 з 7 днів — реальна картина тижня невідома.",
    "comment": "Головний факт цього тижня — не дефіцит калорій, а критично мала кількість записів: лише 2 дні із 7. Середні показники (1 980 ккал, Б 96 г / Ж 72 г / В 210 г) розраховані виключно за цими двома днями і не відображають реального раціону тижня. За наявними даними помітний дефіцит калорій у 220 ккал відносно цілі 2 200 ккал та відносно невисокий рівень білка при активних тренуваннях.",
    "recommendations": ["Збільш охоплення записів до мінімум 5–7 днів на тиждень — без цього аналітика харчування не має сенсу.", "У дні, де записи все ж є, білок (96 г) залишається нижчим від рекомендованого рівня для силових тренувань — додай джерела білка до кожного основного прийому їжі."]
  },
  "routine": {
    "summary": "Звички виконано на 71% із трьох активних, читання залишається нестабільним — лише 4 з 7 днів.",
    "comment": "Загальний відсоток 71% — прийнятний результат, але є резерв для покращення. Читання як єдина деталізована звичка виконувалося через день: 4 із 7 днів, тобто пропущено три дні поспіль або через один. Показники інших двох звичок не розкриті, що не дозволяє визначити, де саме втрачається залишок відсотків.",
    "recommendations": ["Прив'яжи читання до вже наявного щоденного ритуалу (ранкова кава, час перед сном) — це підвищить стабільність виконання.", "Увімкни детальну статистику для всіх трьох звичок у додатку, щоб точніше визначити, яка з них найбільше 'просідає'."]
  },
  "overallRecommendations": [
    "Найслабше місце тижня — не тренування, а дані: фінанси не фіксуються зовсім, харчування покрито лише на 29%. Зроби заповнення додатку щоденною звичкою — без даних аналітика не може допомогти.",
    "Тренування йдуть добре, але при 3 силових сесіях на тиждень організм потребує достатньої кількості білка і калорій для відновлення — за наявними (хоч і неповними) даними обидва показники нижчі за ціль, тож акцентуй увагу на харчуванні в дні тренувань."
  ]
}
````

### digest / дірка в даних — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень не зафіксовано жодної транзакції — фінансових даних немає.",
    "comment": "У період з 20 по 26 липня 2026 року витрати та надходження складають 0 грн, транзакцій не зареєстровано. Місячний бюджет встановлено на рівні 30 000 грн, але оцінити його виконання неможливо через відсутність записів. Це або тиждень без витрат, або дані просто не вносилися до додатку.",
    "recommendations": ["Почни фіксувати всі транзакції в додатку — навіть дрібні покупки, щоб отримати реальну картину витрат відносно бюджету 30 000 грн.", "Перевір, чи підключено автоматичний імпорт з банківської картки, щоб не вносити дані вручну."]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12 400 кг — активний тиждень.",
    "comment": "Три тренування за тиждень із сумарним об'ємом 12 400 кг свідчать про стабільне навантаження. Присідання стали найоб'ємнішою вправою тижня — 4 200 кг, що становить майже третину загального об'єму. Стан відновлення оцінено як норма, тобто організм справляється з поточним навантаженням.",
    "recommendations": ["Підтримуй розподіл навантаження між групами м'язів — присідання займають 34% об'єму, варто переконатись, що верх тіла отримує достатній стимул.", "Оскільки відновлення в нормі, можна поступово збільшувати загальний тижневий об'єм на 5–10% для подальшого прогресу."]
  },
  "nutrition": {
    "summary": "Харчування залоговано лише за 2 з 7 днів — оцінити тиждень неможливо, це головний висновок.",
    "comment": "Лише 2 дні із 7 мають записи про харчування, тому будь-які середні показники — 1 980 ккал, 96г білка, 72г жиру, 210г вуглеводів — відображають щонайбільше два дні, а не тиждень. Робити висновок про дефіцит у 220 ккал або якість харчування на основі таких даних некоректно. Реальна картина харчування за тиждень невідома.",
    "recommendations": ["Починай фіксувати їжу щодня — навіть приблизні записи дадуть набагато точнішу картину, ніж 2 дні з 7.", "Якщо ведення щоденника харчування здається складним, спробуй фотофіксацію страв у додатку — це швидше, ніж ручне введення."]
  },
  "routine": {
    "summary": "Звички виконуються на 71% — результат є, але з резервом для покращення.",
    "comment": "Загальний відсоток виконання звичок склав 71% по 3 активних звичках. Читання виконувалося 4 з 7 днів (57%) — це найгірший показник серед звичок, що тягне загальний відсоток вниз. Три пропущені дні читання підряд або розкидані по тижню варто проаналізувати, щоб зрозуміти причину.",
    "recommendations": ["Прив'яжи читання до вже наявного ритуалу (наприклад, перед сном або після ранкової кави), щоб підвищити стабільність з 57% до 80%+.", "Перевір, чи не є завищеною ціль по читанню — іноді зменшення мінімальної норми (наприклад, до 10 хвилин замість 30) підвищує регулярність."]
  },
  "overallRecommendations": [
    "Найслабша ланка тижня — якість даних: фінанси не внесено зовсім, харчування залоговано лише на 29% днів. Без повних даних аналітика не може допомогти — зроби щоденне внесення даних пріоритетом на наступний тиждень.",
    "Тренувальний блок виглядає стабільно, але для повноцінного аналізу прогресу потрібно зіставляти його з харчуванням — при постійному дефіциті калорій відновлення та ріст сили можуть сповільнитись, тому заповни харчові записи."
  ]
}
```

### digest / дірка в даних — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: подати середньодобові 1980 ккал як факт тижня, коли записів лише 2 дні з 7, а транзакцій — жодної. Правильно: назвати дані неповними й не будувати на них тренд.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень не зафіксовано жодної транзакції — фінансові дані відсутні.",
    "comment": "У період з 20 по 26 липня витрати та надходження складають 0 грн, транзакцій немає. Це означає або що модуль не використовувався, або що дані не були внесені. Без записів неможливо оцінити відповідність місячному бюджету у 30000 грн.",
    "recommendations": [
      "Почни фіксувати витрати щодня — навіть базові покупки (продукти, транспорт), щоб наприкінці місяця мати реальну картину.",
      "Встанови нагадування у додатку для щоденного внесення транзакцій, аби не втрачати дані за тиждень."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12400 кг — результат стабільний.",
    "comment": "Три тренування на тиждень — достатня частота для прогресу при нормальному стані відновлення, який і зафіксовано. Присідання стали найоб'ємнішою вправою тижня з 4200 кг, що складає 34% від загального об'єму — акцент на нижню частину тіла очевидний. Стан відновлення у нормі підтверджує, що навантаження не перевищує адаптаційні можливості.",
    "recommendations": [
      "Стеж за балансом між м'язовими групами: якщо присідання домінують, переконайся, що верх тіла отримує порівнянний об'єм протягом тижня.",
      "Зафіксуй інтенсивність (ваги, кількість повторень) для кожної вправи, щоб відстежувати прогресію від тижня до тижня."
    ]
  },
  "nutrition": {
    "summary": "Харчування залоговано лише 2 з 7 днів — оцінити тиждень неможливо, є лише два дні даних.",
    "comment": "Два залогованих дні — це головний факт цього блоку: будь-яка середня (1980 ккал, Б 96г / Ж 72г / В 210г) відображає лише ці два дні, а не реальну картину тижня. Дефіцит 220 ккал відносно цілі 2200 ккал може бути як справжнім, так і артефактом неповних записів. Робити висновки про харчові тенденції на основі менш ніж 4 днів із 7 — ненадійно.",
    "recommendations": [
      "Логуй харчування щонайменше 5-6 днів на тиждень — лише тоді середні значення матимуть аналітичну цінність.",
      "Якщо два залогованих дні справді репрезентативні, білок у 96г може бути недостатнім при активних тренуваннях — орієнтуйся на рівень 1,6–2,0г на кг власної ваги."
    ]
  },
  "routine": {
    "summary": "Звички виконано на 71% — результат вище середнього, але є простір для покращення.",
    "comment": "Загальний показник 71% по трьох активних звичках свідчить про помірну стабільність. Читання виконано в 4 з 7 днів (57%) — це найнижчий показник серед звичок, і він тягне загальний відсоток вниз. Дві інші звички, очевидно, виконуються краще, оскільки загальна середня вища за 57%.",
    "recommendations": [
      "Читання пропускається через день — спробуй прив'язати його до фіксованого моменту дня (наприклад, перед сном), щоб зменшити залежність від настрою.",
      "Визнач, яка з трьох звичок дається найважче, і зменши її мінімальну планку на наступний тиждень, аби збудувати стабільний ланцюжок виконання."
    ]
  },
  "overallRecommendations": [
    "Тренування — найбільш задокументований і стабільний блок тижня: збережи цей ритм і перенеси таку саму дисципліну на щоденне логування харчування та фінансів.",
    "Два з чотирьох модулів (фінанси та харчування) не мають достатньо даних для повноцінного аналізу — пріоритет на наступний тиждень: заповнювати додаток щодня, а не ретроспективно."
  ]
}
```

### digest / один модуль із чотирьох — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / один модуль із чотирьох — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

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

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / один модуль із чотирьох — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

````text
```json
{
  "finyk": {
    "summary": "За звітний тиждень дохід значно перевищив витрати, залишивши позитивний залишок.",
    "comment": "Витрати склали 8420 грн при надходженнях 32000 грн, що є суттєвою різницею. Найбільші витрати припали на продукти (3100 грн) та їжу поза домом (2400 грн), що разом складає понад половину всіх витрат. Загальна кількість транзакцій – 41. Витрати значно нижчі за місячний бюджет у 30000 грн.",
    "recommendations": [
      "Розглянути можливість оптимізації витрат на харчування поза домом, якщо це не суперечить вашим цілям.",
      "Проаналізувати, чи відповідають витрати на продукти вашим потребам та бюджету."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": []
}
````

````

### digest / один модуль із чотирьох — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня витрати склали 8420 грн при доходах 32000 грн, що значно нижче місячного бюджету.",
    "comment": "Основні витрати пішли на продукти (3100 грн) та їжу поза домом (2400 грн), а також транспорт (900 грн). Загальна кількість транзакцій склала 41.",
    "recommendations": [
      "Продовжуйте контролювати витрати, оскільки поточні витрати не перевищують бюджет.",
      "Зверніть увагу на частку витрат на їжу поза домом, можливо, є можливість оптимізувати ці кошти."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": []
}
````

````

### digest / один модуль із чотирьох — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня доходи значно перевищили витрати, бюджет залишається в межах норми.",
    "comment": "Витрати склали 8420 грн при доходах 32000 грн. Основні статті витрат – продукти (3100 грн) та їжа поза домом (2400 грн). Кількість транзакцій (41) відповідає середньому рівню активності.",
    "recommendations": [
      "Продовжуйте контролювати витрати, особливо на продукти та харчування поза домом.",
      "Розгляньте можливість спрямування надлишкових коштів на заощадження або інвестиції, відповідно до вашого фінансового плану."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": []
}
````

````

### digest / один модуль із чотирьох — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн з надходженнями 32000 грн — баланс позитивний.",
    "comment": "Витрати склали 8420 грн, що при тижневій пропорції місячного бюджету (30000 / 4 ≈ 7500 грн) дає невеликий перевитрат на ~920 грн. Найбільші статті — продукти (3100 грн) та їжа поза домом (2400 грн) разом становлять 65% усіх витрат тижня. 41 транзакція за 7 днів — це близько 6 платежів на день, що свідчить про часті дрібні покупки.",
    "recommendations": [
      "Їжа поза домом (2400 грн) — майже 29% тижневих витрат: розглянь, чи можна частину замінити приготуванням вдома, щоб вкластися в бюджет до кінця місяця.",
      "При 41 транзакції за тиждень варто переглянути дрібні імпульсні покупки — зведення їх до більших, але рідших візитів допоможе контролювати бюджет."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": [
    "Фінансові дані за тиждень є, але дані про харчування, тренування та звички відсутні — підключи ці модулі для повноцінної картини.",
    "Тижневий темп витрат (8420 грн) трохи перевищує рівномірний розподіл місячного бюджету — стеж за динамікою наступних тижнів, щоб не вийти за 30000 грн."
  ]
}
````

### digest / один модуль із чотирьох — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн із надходженням 32000 грн — тиждень у плюсі.",
    "comment": "Витрати 8420 грн становлять близько 28% місячного бюджету 30000 грн, що вкладається в норму при рівномірному розподілі. Проте сума по їжі поза домом (2400 грн) майже зрівнялася з витратами на продукти (3100 грн) — разом це 65% усіх витрат тижня. Транспорт (900 грн) виглядає помірно.",
    "recommendations": [
      "Відстежте, скільки разів на тиждень ви їсте поза домом: якщо більше 4–5 разів, збільшення частки домашнього харчування може суттєво знизити витрати цієї категорії.",
      "При 41 транзакції за тиждень — це близько 6 покупок на день; варто переглянути дрібні щоденні витрати, щоб виявити неочевидні «витоки» бюджету."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": [
    "Дані надані лише по фінансовому модулю — підключіть трекінг харчування, тренувань і звичок, щоб отримати повноцінну картину тижня.",
    "Фінансово тиждень стабільний, але для точнішого аналізу варто фіксувати витрати щодня, а не покладатися лише на підсумкову суму."
  ]
}
```

### digest / один модуль із чотирьох — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати блоки fizruk/nutrition/routine замість `null`. Промпт прямо каже повертати null для модулів без даних; вигадані блоки доїжджають до UI як справжні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрачено 8420 грн із надходженнями 32000 грн — бюджет під контролем.",
    "comment": "Тижневі витрати становлять 28% місячного бюджету в 30000 грн, що виглядає помірно. Найбільша стаття — продукти (3100 грн) та їжа поза домом (2400 грн): разом це 65% усіх витрат тижня. 41 транзакція за 7 днів — це близько 6 платежів на день, що свідчить про активне дрібне споживання.",
    "recommendations": [
      "Їжа поза домом (2400 грн) майже дорівнює витратам на продукти (3100 грн) — якщо тенденція збережеться на місяць, сумарно це ~22000 грн лише на харчування. Варто переглянути баланс між готуванням вдома та кафе.",
      "При 41 транзакції на тиждень легко втрачати контроль над дрібними витратами — спробуй групувати або обмежити кількість імпульсивних покупок на день."
    ]
  },
  "fizruk": null,
  "nutrition": null,
  "routine": null,
  "overallRecommendations": [
    "Фінансові дані виглядають стабільно, але для повноцінного аналізу тижня бракує даних про тренування, харчування та звички — підключи ці модулі, щоб отримати цілісну картину.",
    "Спробуй протягом наступного тижня залогувати хоча б 4 дні харчування та відмітити тренування — це дасть достатньо даних для реальних висновків про твій режим."
  ]
}
```

### digest / перевитрата з боргом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / перевитрата з боргом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

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

**Суддя:** ❌ провалив — не пройшов WeeklyDigestReportSchema — прод віддав би 502

```text
stub
```

### digest / перевитрата з боргом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

````text
```json
{
  "finyk": {
    "summary": "Витрати перевищили надходження на 9000 грн, що на 30% більше за місячний бюджет.",
    "comment": "Основні статті витрат – оренда (12000 грн) та їжа поза домом (6800 грн). Загальні витрати сягнули 41000 грн при надходженнях 32000 грн. Кількість транзакцій – 63.",
    "recommendations": [
      "Проаналізуйте можливість оптимізації витрат на їжу поза домом.",
      "Спробуйте зменшити витрати на каву, щоб зекономити 900 грн."
    ]
  },
  "fizruk": {
    "summary": "Виконано 3 тренування із загальним об'ємом 12400 кг, стан відновлення – норма.",
    "comment": "Основне навантаження припало на присідання (4200 кг). Враховуючи нормальний стан відновлення, є потенціал для збільшення кількості тренувань.",
    "recommendations": [
      "Розгляньте можливість додавання ще одного тренування на тиждень.",
      "Зверніть увагу на баланс вправ, щоб уникнути перевантаження окремих груп м'язів."
    ]
  },
  "nutrition": {
    "summary": "Середньодобовий калораж складає 1980 ккал, що на 220 ккал менше за цільовий показник.",
    "comment": "Днів із записами – 6 з 7. Середній БЖВ: Б 96г / Ж 72г / В 210г. Спостерігається дефіцит калорій, що може бути пов'язано з недоїданням.",
    "recommendations": [
      "Додайте до свого раціону приблизно 220 ккал, щоб досягти цільового показника.",
      "Перегляньте розподіл білків, жирів та вуглеводів, щоб забезпечити збалансоване харчування."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок – 71% при 3 активних звичках.",
    "comment": "Звичка читання виконана на 57% (4/7 днів). Загалом, показник виконання звичок є середнім, але є простір для покращення.",
    "recommendations": [
      "Спробуйте збільшити частоту виконання звички читання до 7 днів на тиждень.",
      "Розгляньте можливість додавання ще однієї активної звички для покращення загального показника."
    ]
  },
  "overallRecommendations": [
    "Зверніть увагу на від'ємний фінансовий баланс та спробуйте оптимізувати витрати.",
    "Підтримуйте стабільний режим тренувань та харчування, збалансовуючи калораж відповідно до цілей."
  ]
}
````

````

### digest / перевитрата з боргом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня витрати перевищили доходи на 9000 грн, що перевищує місячний бюджет.",
    "comment": "Витрати склали 41000 грн при доходах 32000 грн. Основні статті витрат: оренда (12000 грн), їжа поза домом (6800 грн) та кава (900 грн). Кількість транзакцій – 63. Загальні витрати перевищили місячний бюджет у 30000 грн.",
    "recommendations": [
      "Розгляньте можливість скорочення витрат на їжу поза домом та каву, щоб наблизитись до місячного бюджету.",
      "Проаналізуйте, чи є можливість збільшити доходи для покриття поточних витрат."
    ]
  },
  "fizruk": {
    "summary": "Цього тижня було проведено 3 тренування із загальним об'ємом 12400 кг, стан відновлення – норма.",
    "comment": "Виконано 3 тренування, з яких одне було присіданням з вагою 4200 кг. Загальний об'єм навантаження становить 12400 кг. Стан відновлення оцінюється як нормальний, що свідчить про адекватне співвідношення навантаження та відпочинку.",
    "recommendations": [
      "Продовжуйте дотримуватися поточного режиму тренувань, враховуючи нормальний стан відновлення.",
      "Для подальшого прогресу розгляньте можливість поступового збільшення об'єму або інтенсивності тренувань, якщо стан відновлення дозволятиме."
    ]
  },
  "nutrition": {
    "summary": "Цього тижня середньодобоковий калораж був на 220 ккал нижчим за цільовий, з достатнім споживанням білка.",
    "comment": "Середньодобово споживалось 1980 ккал при цілі 2200 ккал, що свідчить про дефіцит. Середній розподіл БЖВ: Б 96г, Ж 72г, В 210г. Записано дані за 6 з 7 днів, що є хорошим показником покриття даних.",
    "recommendations": [
      "Збільште середньодобоковий калораж на 220 ккал, щоб досягти цільового показника.",
      "Продовжуйте стежити за споживанням білка, оскільки він відповідає нормам."
    ]
  },
  "routine": {
    "summary": "Цього тижня було досягнуто 71% виконання активних звичок, з них читання – 4 рази.",
    "comment": "Загальний відсоток виконання звичок склав 71%. Активними були 3 звички. Звичка 'читання' виконана у 4 з 7 днів (57%).",
    "recommendations": [
      "Прагніть до вищого відсотка виконання звичок, намагаючись досягти 100% або наблизитись до нього.",
      "Зверніть увагу на звичку 'читання' та спробуйте збільшити її виконання до більшої кількості днів на тиждень."
    ]
  },
  "overallRecommendations": [
    "Зверніть увагу на перевищення витрат над доходами та перевищення місячного бюджету. Планування фінансів допоможе уникнути дефіциту.",
    "Продовжуйте тримати збалансоване харчування та регулярні тренування, враховуючи рекомендації по кожному модулю."
  ]
}
````

````

### digest / перевитрата з боргом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

```text
```json
{
  "finyk": {
    "summary": "Цього тижня витрати перевищили доходи на 9000 грн, що вище за встановлений місячний бюджет.",
    "comment": "Основні витрати пішли на оренду (12000 грн) та їжу поза домом (6800 грн), що в сумі складає значну частину загальних витрат. Також спостерігаються витрати на каву (900 грн). Загальна кількість транзакцій становить 63.",
    "recommendations": [
      "Спробуйте скоротити витрати на їжу поза домом та каву, щоб привести їх у відповідність до бюджету.",
      "Розгляньте можливість збільшення доходів або пошук шляхів оптимізації витрат на основні категорії."
    ]
  },
  "fizruk": {
    "summary": "За тиждень було проведено 3 тренування із загальним об'ємом 12400 кг, при цьому стан відновлення оцінюється як нормальний.",
    "comment": "Найбільший об'єм припадає на присідання (4200 кг). Загальний об'єм є вагомим, а стан відновлення в нормі свідчить про адекватне навантаження.",
    "recommendations": [
      "Продовжуйте дотримуватися збалансованого тренувального плану, слідкуючи за відновленням.",
      "Розгляньте можливість включення нових видів вправ для комплексного розвитку."
    ]
  },
  "nutrition": {
    "summary": "Цього тижня спостерігався дефіцит калорій, оскільки середньодобове споживання (1980 ккал) було нижчим за цільове (2200 ккал).",
    "comment": "Середній добовий калораж нижчий за ціль на 220 ккал. Співвідношення білків, жирів та вуглеводів складає Б 96г / Ж 72г / В 210г. Записами були покриті 6 з 7 днів тижня.",
    "recommendations": [
      "Поступово збільшуйте калорійність раціону, щоб досягти цільового показника.",
      "Перегляньте склад раціону для забезпечення оптимального співвідношення макронутрієнтів."
    ]
  },
  "routine": {
    "summary": "За тиждень було виконано 71% запланованих звичок.",
    "comment": "Зафіксовано 3 активні звички. Звичка читання була виконана в 57% випадків (4 з 7 днів).",
    "recommendations": [
      "Намагайтеся послідовно дотримуватися всіх запланованих звичок для досягнення кращих результатів.",
      "Зверніть увагу на звичку читання, щоб збільшити відсоток виконання."
    ]
  },
  "overallRecommendations": [
    "Важливо збалансувати витрати з доходами, оптимізувавши категорії, які споживають найбільше коштів.",
    "Прагніть до досягнення цільового калоражу та збалансованого споживання макронутрієнтів, а також підвищення відсотку виконання запланованих звичок."
  ]
}
````

````

### digest / перевитрата з боргом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрати (41 000 грн) перевищили надходження (32 000 грн) на 9 000 грн, а місячний бюджет у 30 000 грн уже перевищено в межах одного тижня.",
    "comment": "Оренда забирає 12 000 грн — це найбільша стаття витрат і фіксований платіж. Їжа поза домом (6 800 грн) та кава (900 грн) разом складають 7 700 грн, що є суттєвою змінною частиною витрат і явним кандидатом для оптимізації. При 63 транзакціях за тиждень середній чек невеликий, але висока частота покупок формує значний підсумок.",
    "recommendations": [
      "Встанови тижневий ліміт на їжу поза домом — наприклад, 3 500 грн, — і відстежуй його окремо, щоб не виходити за межі бюджету наступного тижня.",
      "Переглянь частоту кавових витрат: 900 грн на тижень — це близько 130 грн на день; приготування кави вдома хоча б частину днів може суттєво знизити цю статтю."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12 400 кг, стан відновлення — норма.",
    "comment": "Три тренування на тиждень — це прийнятна частота для силового блоку, особливо з урахуванням нормального стану відновлення. Присідання дали 4 200 кг із 12 400 кг загального об'єму — це 34% навантаження, що свідчить про акцент на нижню частину тіла. Даних про розподіл решти вправ немає, тому оцінити баланс між м'язовими групами не можна.",
    "recommendations": [
      "Додай до щоденника тренувань деталізацію по всіх вправах, а не лише топ-1: це дозволить перевірити, чи рівномірно навантажені різні м'язові групи.",
      "Якщо ціль — набір маси або сила, розглянь 4-е тренування на тиждень, оскільки відновлення наразі в нормі та дозволяє збільшити частоту."
    ]
  },
  "nutrition": {
    "summary": "Харчування залоговано 6 із 7 днів — дані достатньо повні; середньодобовий калораж (1 980 ккал) не досягає цілі на 220 ккал, білок (96 г) також нижчий за типову норму для силових тренувань.",
    "comment": "Покриття 6 із 7 днів дає надійну картину тижня. Систематичний дефіцит 220 ккал на тлі силових тренувань може уповільнювати відновлення та прогрес у наборі об'єму — якщо набір маси є ціллю. Білок 96 г на добу є недостатнім для підтримки м'язового синтезу при регулярних силових навантаженнях: загальна рекомендація — не менше 1,6 г на кг маси тіла.",
    "recommendations": [
      "Додай до раціону додаткові джерела білка в межах звичних прийомів їжі: яйця, сир, бобові, м'ясо або риба — щоб підтягнути показник ближче до цілі.",
      "Збільш загальний калораж на 200–250 ккал переважно за рахунок білково-вуглеводних продуктів, а не жирів, щоб закрити дефіцит і краще живити тренування."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок — 71% при 3 активних звичках, читання виконано лише 4 із 7 днів (57%).",
    "comment": "71% — помірний результат: більше половини звичок виконуються, але є очевидний резерв. Читання з показником 57% є найслабшою ланкою та тягне загальний відсоток вниз. Дані по двох інших звичках не деталізовані, тому неможливо визначити, яка саме з них дає вищий результат.",
    "recommendations": [
      "Прив'яжи читання до вже наявного щоденного ритуалу (наприклад, перед сном або після ранкової кави), щоб підвищити стабільність виконання.",
      "Додай деталізацію по всіх трьох звичках у звіт: без цього незрозуміло, що саме формує 71% і де найбільший потенціал для зростання."
    ]
  },
  "overallRecommendations": [
    "Фінансовий дефіцит тижня (−9 000 грн) і недобір калорій (−220 ккал/день) — два паралельних дефіцити, які варто вирішувати одночасно: частина переїдання поза домом може бути замінена дешевшим і більш контрольованим харчуванням вдома, що одразу покращить і бюджет, і білковий показник.",
    "Стабільність — головна точка росту цього тижня: звички виконуються на 71%, харчування не залоговано 1 день, тренувань 3 із можливих 4–5; невеликі кроки до більшої послідовності в кожному блоці дадуть кращий сумарний результат, ніж різкі зміни в одному напрямку."
  ]
}
````

### digest / перевитрата з боргом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрати склали 41 000 грн при надходженнях 32 000 грн — перевитрата 9 000 грн, і це вже за межами місячного бюджету в 30 000 грн.",
    "comment": "Найбільша стаття — оренда 12 000 грн, що є фіксованим платежем. Проте їжа поза домом (6 800 грн) і кава (900 грн) разом складають 7 700 грн лише за один тиждень — це суттєва змінна частина витрат. 63 транзакції за 7 днів свідчать про часті дрібні покупки, які швидко накопичуються.",
    "recommendations": [
      "Переглянь витрати на їжу поза домом: 6 800 грн за тиждень — це понад 970 грн на день, спробуй готувати хоча б 2–3 прийоми їжі вдома замість кафе.",
      "Зафіксуй ліміт на каву та їжу поза домом на наступний тиждень, щоб загальні витрати вписалися в місячний бюджет 30 000 грн."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12 400 кг, стан відновлення — норма.",
    "comment": "3 тренування на тиждень — це стабільна база для прогресу при нормальному відновленні. Присідання домінують в об'ємі (4 200 кг із 12 400 кг загальних), що говорить про акцент на ногах або базових рухах. Стан відновлення в нормі підтверджує, що навантаження наразі збалансоване.",
    "recommendations": [
      "Якщо ціль — рівномірний розвиток, перевір, чи достатньо уваги приділяється верхній частині тіла — присідання займають третину всього тижневого об'єму.",
      "Підтримуй 3 тренування на тиждень як мінімум і стеж за відновленням: поки воно в нормі, можна поступово нарощувати загальний об'єм."
    ]
  },
  "nutrition": {
    "summary": "Харчування залоговано 6 із 7 днів — дані достатньо повні, але калораж стабільно нижчий за ціль: середній дефіцит 220 ккал на день.",
    "comment": "При цілі 2 200 ккал фактично виходить 1 980 ккал — дефіцит невеликий, але систематичний. Білок 96 г на добу — залежно від ваги це може бути недостатньо для підтримки м'язів при активних тренуваннях; загальний орієнтир — близько 1,6–2 г на кг маси тіла. Жири та вуглеводи виглядають збалансовано в межах наявних даних.",
    "recommendations": [
      "Додай 200–250 ккал переважно за рахунок білкових джерел (яйця, сир, бобові, м'ясо), щоб закрити дефіцит і підтримати відновлення після тренувань.",
      "Продовжуй логувати щодня — 6 із 7 це добре, але один пропущений день може приховувати значне відхилення від цілей."
    ]
  },
  "routine": {
    "summary": "Загальне виконання звичок за тиждень — 71% по 3 активних звичках.",
    "comment": "71% — це вище середнього, але є простір для покращення. Читання виконувалося лише 4 із 7 днів (57%), що є найслабшою ланкою серед звичок. Три пропущені дні поспіль або хаотично — різні проблеми, тому варто відстежити патерн пропусків.",
    "recommendations": [
      "Для читання спробуй прив'язати його до вже існуючого ритуалу (наприклад, перед сном або вранці з кавою) — це підвищує стабільність виконання.",
      "Визнач, які дні тижня найчастіше є «провальними» для звичок, і заздалегідь плануй мінімальну версію кожної звички на ці дні."
    ]
  },
  "overallRecommendations": [
    "Головний пріоритет тижня — фінанси: витрати перевищили і надходження, і місячний бюджет, тому скорочення змінних витрат (їжа поза домом, кава) дасть найшвидший результат.",
    "Тренування та харчування рухаються в правильному напрямку — закрий калорійний дефіцит білковими продуктами, щоб підтримати м'язовий об'єм при поточному тренувальному навантаженні."
  ]
}
```

### digest / перевитрата з боргом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: рівно перелічити всі проблеми. Витрати 41 000 при доході 32 000 — головне; поради «менше кави» тут другорядні.

**Суддя:** ✅ пройшов

```text
{
  "finyk": {
    "summary": "За тиждень витрати (41 000 грн) перевищили надходження (32 000 грн) на 9 000 грн, а місячний бюджет 30 000 грн уже вичерпано на 137%.",
    "comment": "Найбільша стаття — оренда 12 000 грн, що становить 29% витрат і є фіксованою. Їжа поза домом (6 800 грн) та кава (900 грн) разом дають 7 700 грн — це 19% тижневих витрат і найбільш керована частина бюджету. При 63 транзакціях за тиждень середня транзакція складає близько 651 грн, що свідчить про часті дрібні витрати.",
    "recommendations": [
      "Їжа поза домом та кава разом — 7 700 грн на тиждень: навіть скорочення цієї статті на 30% дасть економію ~2 300 грн на тиждень і допоможе повернутися в межі бюджету.",
      "Тижневі витрати (41 000 грн) перевищують тижневі надходження (32 000 грн) — варто переглянути місячний бюджет або знайти джерела додаткового доходу, щоб не допускати накопичення дефіциту."
    ]
  },
  "fizruk": {
    "summary": "За тиждень завершено 3 тренування із загальним об'ємом 12 400 кг при нормальному стані відновлення.",
    "comment": "Три тренування на тиждень — стабільна базова частота для силового розвитку. Присідання склали 4 200 кг з 12 400 кг загального об'єму — це 34% усього тижневого навантаження, що вказує на акцент на нижню частину тіла. Стан відновлення в нормі, тобто поточне навантаження організм переносить без надмірного стресу.",
    "recommendations": [
      "Якщо ціль — прогрес у силі або гіпертрофії, можна поступово збільшувати загальний тижневий об'єм або додати четверте тренування, поки відновлення залишається в нормі.",
      "Присідання домінують в об'ємі — перевір баланс із верхньою частиною тіла та тягнучими рухами, щоб уникнути дисбалансу навантаження."
    ]
  },
  "nutrition": {
    "summary": "Харчування зафіксовано за 6 із 7 днів — дані достатньо репрезентативні, середній калораж 1 980 ккал на 220 ккал нижче цілі 2 200 ккал.",
    "comment": "Систематичний дефіцит 220 ккал на день може гальмувати відновлення та прогрес у тренуваннях, особливо при силовому навантаженні. Білок — 96 г на добу — при типовій рекомендації 1,6–2,2 г на кг для людей із силовими тренуваннями, ймовірно, недостатньо: щоб оцінити точніше, потрібна вага тіла. Вуглеводи (210 г) та жири (72 г) виглядають збалансовано, але загальний калораж треба підтягнути до цілі.",
    "recommendations": [
      "Додай 200–250 ккал переважно за рахунок білкових продуктів (яйця, сир, бобові, м'ясо), щоб закрити і калорійний дефіцит, і потенційний брак білка одночасно.",
      "Сьомий день без запису — збережи звичку логувати щодня: навіть один пропущений день приховує реальну картину тижневого балансу."
    ]
  },
  "routine": {
    "summary": "Загальний відсоток виконання звичок — 71% по 3 активних звичках, при цьому читання виконано лише в 4 із 7 днів (57%).",
    "comment": "71% загалом — непоганий результат, але читання як найбільш проблемна звичка тягне середнє вниз. Якщо дві інші звички виконуються стабільніше (і середня тримається на 71%), то читання з результатом 57% пропускається частіше ніж кожен третій день. Три пропуски за тиждень у одній звичці — це сигнал, що час або формат не підходять.",
    "recommendations": [
      "Прив'яжи читання до вже усталеної щоденної дії (наприклад, перед сном або під час ранкової кави) — це підвищить шанс не пропустити його в завантажені дні.",
      "Якщо 71% тримається за рахунок двох звичок із трьох — розглянь, чи реалістично встановлено ціль по читанню (обсяг, час), і скоригуй її під поточний ритм життя."
    ]
  },
  "overallRecommendations": [
    "Фінансовий дефіцит (−9 000 грн за тиждень) і калорійний дефіцит (−220 ккал на день) існують одночасно — пріоритизуй закриття обох: їжа поза домом коштує 6 800 грн на тиждень, частину цих прийомів можна замінити домашньою їжею, що одночасно зекономить гроші і дозволить краще контролювати калораж та білок.",
    "Тренування та відновлення в нормі — щоб закріпити прогрес, підтягни харчування до цільових 2 200 ккал і стабілізуй звички: стабільний сон, їжа і режим є фундаментом для результату в залі."
  ]
}
```

### mono / чиста партія — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ❌ провалив

```text
stub
```

### mono / чиста партія — current default (Anthropic) (`claude-haiku-4-5-20251001`)

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

### mono / чиста партія — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ❌ провалив

```text
stub
```

### mono / чиста партія — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"health","conf":0.9},{"i":1,"c":"other","conf":0.9},{"i":2,"c":"transfer","conf":0.9}]
```

### mono / чиста партія — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"health","conf":0.8},{"i":1,"c":"other","conf":0.7},{"i":2,"c":"transfer","conf":1.0}]
```

### mono / чиста партія — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"health","conf":0.9},{"i":1,"c":"other","conf":0.9},{"i":2,"c":"transfer","conf":0.9}]
```

### mono / чиста партія — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

````text
```json
[
  {"i": 0, "c": "health", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.9},
  {"i": 2, "c": "transfer", "conf": 0.99}
]
````

````

### mono / чиста партія — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

```text
```json
[
  {"i": 0, "c": "health", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.9},
  {"i": 2, "c": "transfer", "conf": 0.99}
]
````

````

### mono / чиста партія — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: пропустити індекс або віддати markdown-fence. `parseBatchResponse` кладе такий item у `missing`, і він іде на повторний прогін — заплачено двічі.

**Суддя:** ✅ пройшов

```text
```json
[
  {"i": 0, "c": "health", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.9},
  {"i": 2, "c": "transfer", "conf": 0.99}
]
````

````

### mono / партія зі сміттям — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
stub
````

### mono / партія зі сміттям — current default (Anthropic) (`claude-haiku-4-5-20251001`)

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

### mono / партія зі сміттям — current default (Anthropic) (`claude-haiku-4-5-20251001`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
stub
```

### mono / партія зі сміттям — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"groceries","conf":0.95},{"i":1,"c":"other","conf":0.3},{"i":2,"c":"income","conf":1.0},{"i":3,"c":"other","conf":0.3},{"i":4,"c":"transport","conf":1.0}]
```

### mono / партія зі сміттям — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"groceries","conf":0.9},{"i":1,"c":"other","conf":0.3},{"i":2,"c":"income","conf":0.9},{"i":3,"c":"other","conf":0.4},{"i":4,"c":"transport","conf":0.9}]
```

### mono / партія зі сміттям — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ✅ пройшов

```text
[{"i":0,"c":"groceries","conf":0.9},{"i":1,"c":"other","conf":0.3},{"i":2,"c":"income","conf":1.0},{"i":3,"c":"other","conf":0.3},{"i":4,"c":"transport","conf":0.9}]
```

### mono / партія зі сміттям — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

````text
```json
[
  {"i": 0, "c": "groceries", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.2},
  {"i": 2, "c": "income", "conf": 0.95},
  {"i": 3, "c": "transfer", "conf": 0.85},
  {"i": 4, "c": "transport", "conf": 0.95}
]
````

````

### mono / партія зі сміттям — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
```json
[
  {"i": 0, "c": "groceries", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.2},
  {"i": 2, "c": "income", "conf": 0.98},
  {"i": 3, "c": "transfer", "conf": 0.85},
  {"i": 4, "c": "transport", "conf": 0.98}
]
````

````

### mono / партія зі сміттям — haiku45-real (`anthropic/claude-haiku-4.5`)

**Пастка:** НЕПРАВИЛЬНО: (а) пропустити сміттєві рядки d2/d4 — прод відправить їх на повторний тік; (б) впевнено приписати `***` реальну категорію. Правильно: КОЖЕН індекс присутній, сміттєві — `other` з низькою confidence.

**Суддя:** ❌ провалив

```text
```json
[
  {"i": 0, "c": "groceries", "conf": 0.95},
  {"i": 1, "c": "other", "conf": 0.2},
  {"i": 2, "c": "income", "conf": 0.99},
  {"i": 3, "c": "transfer", "conf": 0.85},
  {"i": 4, "c": "transport", "conf": 0.98}
]
````

````

### coach-insight / звичайний тиждень — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: загальна мотивація без жодного числа з даних («ти молодець, продовжуй»). Промпт вимагає конкретний патерн І конкретну дію на сьогодні.

**Суддя:** ❌ провалив — не знайдено жодного числа з даних · голос: ❌ markdown

```text
**Харчування і тренування**

Бачу, що цього тижня ти недобираєш і калорій, і білка, хоча тренування йдуть у нормальному темпі – це може трохи гальмувати результат від залу. Сьогодні зроби одну просту штуку: додай до будь-якого прийому їжі порцію білка (наприклад, шматок м’яса, риби або бобові) і зафіксуй це в трекері.
````

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
**Харчування**

Цього тижня ти стабільно недобираєш і калорії, і білок, ще й записів лише 4 з 7 днів, тому реальна картина може бути навіть гіршою. Сьогодні зроби одну просту дію: додай до кожного основного прийому їжі щось білкове (яйця, м’ясо, риба, сир або бобові) і обов’язково запиши все в трекер.
```

</details>

### coach-insight / порожній перший сеанс — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Пам'яті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Дані**

За цей тиждень у мене ще немає жодних твоїх записів, тому я не бачу ні прогресу, ні патернів у сні, харчуванні, активності чи фінансах.

**Дія на сьогодні**

Оберись одну сферу, з якої тобі зараз найбільш важливо почати (сон, харчування, рух або гроші), і сьогодні просто зафіксуй один конкретний факт: наприклад, час відбою, кількість кроків, суму витрат або орієнтовну кількість прийомів їжі. Це буде твоя перша цеглинка в особисту картину, з якою вже можна буде працювати.
```

<details><summary>Базова модель для порівняння — current default (OpenRouter premium)</summary>

```text
Даних за цей тиждень у мене ще немає, тому я не бачу жодного твого реального патерну та не можу чесно сказати, що зараз працює, а що ні.

Сьогодні зроби одну просту дію: зафіксуй хоча б три речі – сон, рух (кроки чи тренування) і витрати за день. Це дасть нам опору, щоб уже з завтра говорити про конкретний твій прогрес, а не вгадувати.
```

</details>

### coach-insight / порожній перший сеанс — current default (OpenRouter premium) (`openai/gpt-5.1`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Пам'яті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Дані і патерни**
Зараз у мене немає ще жодних твоїх даних за попередні тижні і цей тиждень, тому я не бачу ні стабільних звичок, ні прогресу, ні спадів.

**Дія на сьогодні**
Обери одну сферу, яку хочеш «знімати з мене» в першу чергу: сон, харчування, рух чи гроші, і сьогодні просто зафіксуй будь-які 3 факти по ній (наприклад, час засинання, кроки, витрати). Це дасть нам перший реальний орієнтир, щоб далі говорити вже про твій конкретний ритм, а не теорію.
```

### coach-insight / порожній перший сеанс — current standard tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа, яких немає («ти витратив 4200 грн»). Пам'яті немає, знімка немає — єдина чесна відповідь не містить конкретних сум.

**Суддя:** ✅ пройшов · голос: ❌ чужа особа

```text
Привіт! Це мій перший тиждень роботи з тобою, тому поки що даних для глибоких висновків немає. Давай сьогодні спробуємо заповнити наш простір — можливо, ти захочеш записати щось про своє самопочуття або перші враження від процесу?
```

### chat / проста порада — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / проста порада — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / проста порада — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
За цей тиждень у категорії **«їжа поза домом»** у тебе 8 транзакцій на загальну суму 960 грн. Остання покупка датована 29 липня на 120 грн.

Проте ця категорія охоплює не лише каву, а й усяку їжу поза домом. Якщо хочеш бачити лише витрати саме на каву, можеш допомогти уточнити: які з цих транзакцій стосуються кави, або вказати окрему категорію для неї.
```

### chat / проста порада — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**

Цього тижня ти витратив 960 грн на їжу поза домом (8 транзакцій). Остання покупка – 120 грн 29 липня.
```

### chat / проста порада — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
Цього тижня ти витратив на каву 8 разів, загалом на **960 грн**. Остання покупка – 29 липня, 120 грн. Середня витрата за чашку – 120 грн.
```

### chat / проста порада — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов

```text
Цього тижня на каву пішло 960 грн, усього 8 покупок. Якщо хочеш, можу показати, скільки це в середньому на день.
```

### chat / проста порада — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов

```text
Цього тижня на каву ти витратив 960 грн — це 8 транзакцій у категорії «їжа поза домом». Остання покупка була сьогодні на 120 грн.
```

### chat / проста порада — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Кава цього тижня** – за 8 покупок витрачено 960 грн. Це все в категорії «їжа поза домом». Останній раз брав каву 29 липня за 120 грн.
```

### chat / проста порада — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов

```text
Цього тижня ти витратив на каву 960 грн. Останній запис про каву було зроблено 29 липня на суму 120 грн.
```

### chat / проста порада — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов

```text
Цього тижня ти витратив на каву 960 грн. Це включає 8 транзакцій, остання з яких була 2026-07-29 на 120 грн.
```

### chat / проста порада — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: написати «Записую транзакцію…» чи вивести сирий <tool_call>. Інструменти вже відпрацювали — це крок СИНТЕЗУ, не виклику.

**Суддя:** ✅ пройшов

```text
Цього тижня ти витратив на каву 960 грн. Це 8 транзакцій, остання з яких була 29 липня на 120 грн.
```

### chat / багато категорій — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / багато категорій — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / багато категорій — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Твої витрати за липень**

- Продукти: 8420 грн
- Їжа поза домом: 4870 грн
- Комуналка: 2600 грн
- Транспорт: 1310 грн
- Підписки: 890 грн

Усього витрачено 18 090 грн при доході 32 000 грн, залишається 13 910 грн. Майже третину витрат становить їжа (продукти + поза домом = 13 290 грн), це варто тримати на оці, якщо хочеш більше відкладати.
```

### chat / багато категорій — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Твої витрати за липень**

- Продукти: 8420 грн
- Їжа поза домом: 4870 грн
- Комуналка: 2600 грн
- Транспорт: 1310 грн
- Підписки: 890 грн

Разом витрачено 18090 грн при доході 32000 грн, залишається 13910 грн. Майже половина витрат припадає на харчування (13290 грн на продукти й їжу поза домом). Якщо хочеш, можемо встановити бюджет на харчування або порівняти з минулим місяцем.
```

### chat / багато категорій — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**

Твої витрати за липень:

- Продукти: 8420 грн
- Їжа поза домом: 4870 грн
- Комуналка: 2600 грн
- Транспорт: 1310 грн
- Підписки: 890 грн

Загалом витрачено **18 090 грн** із доходу 32 000 грн, тобто близько 56%. На харчування (продукти + їжа поза домом) припадає 13 290 грн, що становить майже 73% усіх витрат. Можливо, варто подумати, чи не забагато виходить на кафе та ресторани порівняно з продуктами.
```

### chat / багато категорій — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Витрати за липень**
Продукти: 8420 грн, транспорт: 1310 грн, їжа поза домом: 4870 грн, комуналка: 2600 грн, підписки: 890 грн. Загалом витрачено 18 090 грн при доході 32 000 грн, тож вдалося зекономити 13 910 грн. Найбільше пішло на продукти та харчування поза домом — разом це 13 290 грн, майже 73% усіх витрат.
```

### chat / багато категорій — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Липень: витрати**

Дохід за липень – 32 000 грн.
Найбільше пішло на продукти – 8420 грн, їжа поза домом – 4870 грн, комуналка – 2600 грн, транспорт – 1310 грн, підписки – 890 грн.
Загалом витратив 18 090 грн, що становить близько 57% від доходу.
```

### chat / багато категорій — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
У липні ти витратив **8420 грн на продукти**, **1310 грн на транспорт**, **4870 грн на їжу поза домом**, **2600 грн на комуналку** та **890 грн на підписки**. Загалом витрати становлять **18 090 грн**, що значно менше за твій дохід у 32 000 грн. Дохід перевищує витрати майже вдвічі — це хороший запас для заощаджень.
```

### chat / багато категорій — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Витрати за липень**

За липень твої витрати склали: продукти — 8420 грн, транспорт — 1310 грн, їжа поза домом — 4870 грн, комуналка — 2600 грн, підписки — 890 грн. Загальний дохід за цей період – 32000 грн.
```

### chat / багато категорій — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Витрати за липень**
За липень твої витрати склали: продукти — 8420 грн, транспорт — 1310 грн, їжа поза домом — 4870 грн, комуналка — 2600 грн, підписки — 890 грн. Твій дохід за цей період становив 32000 грн.
```

### chat / багато категорій — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати всі п'ять чисел підряд. Відповідь має назвати, куди пішла основна частина.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Витрати за липень**
За липень твої витрати становлять: продукти 8420 грн, транспорт 1310 грн, їжа поза домом 4870 грн, комуналка 2600 грн, підписки 890 грн. Твій дохід за цей місяць був 32000 грн.
```

### chat / порожні дані — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / порожні дані — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порожні дані — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**
Цього тижня транзакцій поки що немає, а бюджет не налаштований. Як тільки з'являться витрати чи доходи, я зможу показати детальний звіт, а зараз можеш задати ліміт або ціль на місяць, щоб відслідковувати бюджет.
```

### chat / порожні дані — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**

Цього тижня транзакцій поки що немає, а бюджет ще не налаштований. Якщо хочеш, можу допомогти задати ліміт витрат на місяць або імпортувати транзакції з Monobank за потрібний період.
```

### chat / порожні дані — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**

Цього тижня транзакцій поки що немає, а бюджет ще не налаштований. Щоб почати відстежувати витрати, можеш додати транзакцію вручну або імпортувати виписку з Монобанку. Також раджу встановити ліміт бюджету, щоб я міг підказувати, скільки ще можна витратити.
```

### chat / порожні дані — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси за цей тиждень** – поки що немає жодної записаної транзакції й не встановлений бюджет. Якщо хочеш, можу відстежувати витрати за категоріями: просто почни додавати операції або налаштуй місячний ліміт, і я показуватиму динаміку.
```

### chat / порожні дані — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов

```text
За цей тиждень у модулі «Фінік» немає жодної транзакції, і бюджет не налаштований. Якщо хочеш, я можу допомогти встановити місячний ліміт на витрати або зафіксувати першу покупку.
```

### chat / порожні дані — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов

```text
У тебе немає жодної транзакції за цей тиждень і бюджет ще не налаштований. Почни з додавання витрат і доходів, а потім я зможу показати повну картину.
```

### chat / порожні дані — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов

```text
Тиждень ще не розпочався, тому даних для аналізу фінансів ще немає. Також бюджет не налаштований, тому я не можу порівняти витрати з лімітом.
```

### chat / порожні дані — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов

```text
Транзакцій за поточний тиждень не знайдено. Бюджет також не налаштовано, тому складно оцінити фінансовий стан.
```

### chat / порожні дані — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: назвати будь-яку суму. Інструмент повернув порожньо — будь-яке трицифрове число у відповіді вигадане.

**Суддя:** ✅ пройшов

```text
Цього тижня транзакцій не знайдено, тому бюджет не налаштований.
```

### chat / перевитрата — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / перевитрата — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / перевитрата — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**

Цього місяця витрати склали 34200 грн, а дохід 28000 грн, тобто перевищення на 6200 грн. Це вже третій місяць поспіль, коли витрати перевищують дохід, тож варто переглянути категорії, де можна скоротити, або встановити жорсткіший ліміт. Хочеш, щоби я розбив витрати за категоріями чи порівняв із минулим місяцем?
```

### chat / перевитрата — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**

Цього місяця твої витрати склали 34200 грн за дохід 28000 грн, тобто перевищення на 6200 грн. Це вже третій місяць поспіль, коли ти витрачаєш більше, ніж заробляєш. Варто переглянути категорії з найбільшими витратами і встановити ліміт, щоб зупинити цю тенденцію.
```

### chat / перевитрата — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
З бюджетом цього місяця не дуже добре: витрати склали **34200 грн**, а дохід лише **28000 грн**, тобто перевитрата на 6200 грн. Це вже третій місяць поспіль, коли ти витрачаєш більше, ніж заробляєш.

Рекомендую переглянути категорії найбільших витрат і встановити ліміт бюджету, щоб зупинити цю тенденцію. Хочеш, допоможу розбити витрати по категоріях або задати бюджетний ліміт?
```

### chat / перевитрата — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Бюджет за місяць:** дохід — 28 000 грн, витрати — 34 200 грн. Це на 6 200 грн більше, ніж ти заробив.

Третій місяць поспіль витрати перевищують дохід — варто переглянути, на що йдуть гроші, і спробувати скоротити непотрібні категорії.
```

### chat / перевитрата — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Бюджет цього місяця** — витрати 34 200 грн, дохід 28 000 грн. Це третій місяць поспіль, коли витрати перевищують дохід, тобто ти витрачаєш більше, ніж заробляєш. Різниця в 6 200 грн поступово вичерпує заощадження або збільшує боргове навантаження.
```

### chat / перевитрата — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов

```text
Цього місяця витрати — 34 200 грн, а дохід — 28 000 грн. Тобі не вистачає 6 200 грн, і це третій місяць поспіль, коли витрати перевищують дохід. Раджу переглянути найбільші категорії витрат і подумати, де можна скоротити витрати, щоб вийти хоча б у нуль.
```

### chat / перевитрата — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов

```text
Цього місяця твої витрати склали 34 200 грн, а дохід – 28 000 грн. Це третій місяць поспіль, коли витрати перевищують дохід.
```

### chat / перевитрата — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов

```text
Цього місяця твої витрати становлять 34 200 грн, а дохід – 28 000 грн. Третій місяць поспіль витрати перевищують дохід.
```

### chat / перевитрата — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: нейтральний переказ цифр. Третій місяць витрати > доходу — це має бути назване прямо.

**Суддя:** ✅ пройшов

```text
Твій бюджет цього місяця перевищений, оскільки витрати (34200 грн) більші за доходи (28000 грн). Це вже третій місяць поспіль, коли така ситуація спостерігається.
```

### chat / порівняння періодів — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / порівняння періодів — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / порівняння періодів — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**

Витрати на їжу поза домом у липні складають 4870 грн, а в червні було 2100 грн. Це зростання більш як удвічі, тобто +2770 грн. Якщо хочеш, можу розбити ці витрати детальніше або допомогти встановити ліміт на цю категорію.
```

### chat / порівняння періодів — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Харчування поза домом**

У липні ти витратив 4870 грн на їжу поза домом, а в червні – 2100 грн. Це зростання більш ніж удвічі, +2770 грн. Якщо хочеш тримати бюджет під контролем, варто звернути увагу на частоту або вартість таких виходів.
```

### chat / порівняння періодів — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Харчування поза домом**

У липні витратив на їжу поза домом 4870 грн, а в червні – 2100 грн. Витрати зросли більш ніж удвічі, на 2770 грн (+132%). Інші категорії залишились без змін.
```

### chat / порівняння періодів — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Їжа поза домом** – липень: 4870 грн, червень: 2100 грн. Витрати зросли на 2770 грн, тобто більш ніж удвічі.

Якщо це сплановане збільшення (відпустка, зустрічі), то все гаразд. Якщо ні – можна поглянути, чи не забагато виходиш їсти й чи не простіше готувати вдома.
```

### chat / порівняння періодів — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Їжа поза домом** — суттєве зростання: в липні 4870 грн проти 2100 грн у червні. Це на 2770 грн більше, або приблизно в 2,3 раза. Якщо хочеш, можемо подивитися деталізацію витрат, щоб зрозуміти причину такого стрибка.
```

### chat / порівняння періодів — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Їжа поза домом** — у липні витрачено 4870 грн, у червні 2100 грн. Це на 2770 грн більше, тобто зростання приблизно вдвічі (+132%). Якщо така динаміка не була запланована, варто звернути увагу на частоту походів у заклади.
```

### chat / порівняння періодів — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Їжа поза домом**
Твої витрати на їжу поза домом у липні склали 4870 грн, що значно більше, ніж у червні (2100 грн). Решта витрат залишилися без змін.
```

### chat / порівняння періодів — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Харчування поза домом**
Твої витрати на їжу поза домом у липні склали 4870 грн, що значно більше, ніж у червні (2100 грн).
```

### chat / порівняння періодів — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати два числа без висновку. Ріст удвічі — це і є відповідь на питання.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Їжа поза домом**

Цього місяця витрати на їжу поза домом склали 4870 грн, що значно більше, ніж у червні (2100 грн). Інші категорії витрат залишилися без змін.
```

### chat / крос-модульний — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

<details><summary>Базова модель для порівняння — current default (premium tier)</summary>

```text
stub
```

</details>

### chat / крос-модульний — current default (premium tier) (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current standard tier (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — current floor tier (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ❌ провалив — порожня або не українська відповідь

```text
stub
```

### chat / крос-модульний — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**
На доставку їжі за місяць витрачено 3200 грн. Це суттєва стаття витрат, варто перевірити, чи не перекриває вона плановий ліміт на харчування.

**Тренування**
Виконано лише 2 з 12 запланованих тренувань, це менше 17% від плану. Якщо хочеш довести план до кінця місяця, доведеться тренуватись практично щодня, що нереалістично. Краще переглянемо план на меншу кількість, щоб він був досяжним?
```

### chat / крос-модульний — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінік**
Доставка їжі обійшлася тобі в 3200 грн за місяць. Це чимала стаття витрат, варто перевірити, чи не можна її скоротити.

**Фізрук**
Виконано лише 2 з 12 запланованих тренувань, це близько 17%. Такий розрив між планом і реальністю зазвичай означає, що план надто амбітний. Можеш зменшити кількість тренувань до реалістичних 3–4 на тиждень і поступово нарощувати.
```

### chat / крос-модульний — premium-real (`z-ai/glm-5.2`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси.** За місяць на доставку їжі витрачено 3200 грн. Це конкретна категорія, але без загального бюджету чи ліміту важко сказати, чи це багато для тебе. Можеш запитати детальніше, і я розберу витрати по категоріях або порівняю з минулим місяцем.

**Тренування.** Виконано лише 2 з 12 запланованих, тобто близько 17% плану. Це суттєве відставання, і якщо мова про один місяць, то темп треба терміново підтягувати. Можу запропонувати коротке тренування на сьогодні, щоб почати скорочувати розрив.
```

### chat / крос-модульний — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси:** За місяць на доставку їжі витрачено 3200 грн. Це значна сума, може варто глянути, чи вкладаєшся в бюджет на харчування.

**Тренування:** Виконано лише 2 тренування з 12 запланованих. Виконання плану — 17%, варто подумати, що заважає тренуватися частіше.
```

### chat / крос-модульний — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси** — за останній місяць на доставку їжі витрачено 3200 грн. Якщо це значна частина бюджету, можна поглянути, чи вкладаєшся в загальні ліміти.

**Тренування** — виконано лише 2 з 12 запланованих. Це лише 17% плану, тож варто переглянути навантаження або частоту, щоб не втрачати регулярність.
```

### chat / крос-модульний — standard-real (`deepseek/deepseek-v4-flash`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси:** За місяць на доставку їжі витрачено 3200 грн — зверни увагу, чи це вкладається в твій бюджет на харчування.

**Тренування:** Виконано лише 2 тренування з 12 запланованих. Можливо, варто переглянути план або обрати легші навантаження, щоб не втрачати мотивацію.
```

### chat / крос-модульний — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**
Твої витрати на доставку їжі становлять 3200 грн за місяць.

**Фізрук**
Ти запланував 12 тренувань, але виконав лише 2.
```

### chat / крос-модульний — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**
Твої витрати на доставку їжі становлять 3200 грн за місяць.

**Фізрук**
Ти виконав 2 з 12 запланованих тренувань за місяць.
```

### chat / крос-модульний — floor-real (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відповісти лише про гроші, проігнорувавши тренування, хоча питали про обидва.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**
За місяць ти витратив 3200 грн на доставку їжі.

**Фізрук**
Ти запланував 12 тренувань, але виконав лише 2.
```

### analysis / суперечливі дані — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати обидва числа й не помітити, що сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.

**Суддя:** ❌ провалив — не знайдено визнання розбіжності в сумах

```text
Цього місяця ти витратив 12800 грн. Найбільше коштів пішло на продукти – 5200 грн, далі йде комуналка (2600 грн) та транспорт (1310 грн).
```

### analysis / суперечливі дані — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати обидва числа й не помітити, що сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.

**Суддя:** ❌ провалив — не знайдено визнання розбіжності в сумах

```text
Цього місяця ти витратив 12800 грн. Найбільше коштів пішло на продукти – 5200 грн. Також значні суми витрачені на комуналку (2600 грн) та транспорт (1310 грн).
```

<details><summary>Базова модель для порівняння — baseline (standard-кандидат)</summary>

```text
Цього місяця ти витратив 12800 грн. Найбільше коштів пішло на продукти – 5200 грн, далі йде комуналка (2600 грн) та транспорт (1310 грн).
```

</details>

### analysis / суперечливі дані — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: переказати обидва числа й не помітити, що сума категорій 9310, а «разом» 12800 — 3490 грн невраховані.

**Суддя:** ❌ провалив — не знайдено визнання розбіжності в сумах

```text
Цього місяця ти витратив 12800 грн. Найбільше грошей пішло на продукти (5200 грн), потім комунальні послуги (2600 грн) та транспорт (1310 грн).
```

### analysis / пріоритезація — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: перелічити три проблеми як рівноцінні. Борг 42 000 під 32% річних коштує ~1100 грн/міс — на порядок більше за підписки 340 грн/міс. Порада «почни з підписок» тут шкідлива, і саме її попередній суддя зарахував як правильну.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
Спочатку варто розібратися з боргами та витратами. Я бачу, що у тебе є борг за кредитною карткою на суму 42000 грн під 32% річних, а також щомісячні витрати на підписки (340 грн) та їжу поза домом (4870 грн).

Щоб почати наводити лад у фінансах, я б рекомендував:
- **Сплатити частину боргу за кредитною карткою**, щоб зменшити відсоткові виплати.
- **Переглянути витрати на підписки та їжу поза домом**, можливо, є можливість їх оптимізувати.
- **Розпочати формування заощаджень**, навіть невелика сума щомісяця буде корисна.
```

<details><summary>Базова модель для порівняння — baseline (standard-кандидат)</summary>

```text
Я бачу, що в тебе є борг за кредитною карткою, який становить 42000 грн під 32% річних. Також є щомісячні витрати на підписки (340 грн) та їжу поза домом (4870 грн). Наразі заощаджень немає.

Щоб навести лад у фінансах, варто почати з аналізу твоїх витрат. Спробуй відстежити, куди саме йдуть гроші, окрім зазначених категорій. Потім можна спланувати бюджет, щоб контролювати витрати та почати відкладати кошти.
```

</details>

### analysis / пріоритезація — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: перелічити три проблеми як рівноцінні. Борг 42 000 під 32% річних коштує ~1100 грн/міс — на порядок більше за підписки 340 грн/міс. Порада «почни з підписок» тут шкідлива, і саме її попередній суддя зарахував як правильну.

**Суддя:** ✅ пройшов · голос: ❌ markdown

```text
**Фінанси**
Для початку наведи лад у фінансах, звернувши увагу на кредитну картку з боргом 42000 грн під 32% річних. Також варто переглянути щомісячні витрати на підписки (340 грн) та їжу поза домом (4870 грн). Відсутність заощаджень вказує на необхідність їх формування.
```

### analysis / крос-модульний звʼязок — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати три ряди чисел окремо. Тренування падають у ті самі дні, коли витрати на доставку зростають — це один патерн.

**Суддя:** ❌ провалив — не знайдено названий звʼязок між подіями · голос: ❌ markdown

```text
**Фінанси**
Твої витрати на доставку їжі суттєво зросли з четверга по неділю, становлячи 2800 грн.

**Рутина**
Ти тренуєшся з понеділка по середу, але пропускаєш заняття з четверга по неділю.

**Харчування**
З понеділка по середу ти спиш в середньому 7.5 годин, тоді як з четверга по неділю – лише 5.2 години.
```

### analysis / крос-модульний звʼязок — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати три ряди чисел окремо. Тренування падають у ті самі дні, коли витрати на доставку зростають — це один патерн.

**Суддя:** ❌ провалив — не знайдено названий звʼязок між подіями · голос: ❌ markdown

```text
**Харчування**
Твої витрати на доставку їжі значно зростають з четверга по неділю, сягаючи 2800 грн.

**Фізрук**
З четверга по неділю тренування пропускаються.

**Рутина**
Тривалість сну зменшується з 7.5 до 5.2 годин з четверга по неділю.
```

<details><summary>Базова модель для порівняння — baseline (standard-кандидат)</summary>

```text
**Фінанси**
Твої витрати на доставку їжі суттєво зросли з четверга по неділю, становлячи 2800 грн.

**Рутина**
Ти тренуєшся з понеділка по середу, але пропускаєш заняття з четверга по неділю.

**Харчування**
З понеділка по середу ти спиш в середньому 7.5 годин, тоді як з четверга по неділю – лише 5.2 години.
```

</details>

### analysis / крос-модульний звʼязок — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: подати три ряди чисел окремо. Тренування падають у ті самі дні, коли витрати на доставку зростають — це один патерн.

**Суддя:** ❌ провалив — не знайдено названий звʼязок між подіями · голос: ❌ markdown

```text
**Доставка їжі**
Твої витрати на доставку їжі зростають з четверга по неділю, сягаючи 2800 грн.

**Тренування**
Ти тренуєшся з понеділка по середу, але пропускаєш тренування з четверга по неділю.

**Сон**
З четверга по неділю ти спиш всього 5.2 години, тоді як з понеділка по середу — 7.5 годин.
```

### analysis / хибна причинність — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порадити «менше таксі, щоб краще спати». Збіг у часі ≠ причина; у ці ж дні робочі зустрічі тривали до 21:00.

**Суддя:** ❌ провалив — не знайдено розрізнення кореляції та причини · голос: ❌ Ви

```text
Ви погано спите, бо часто їздите на таксі після 22:00. Це відбувається в ті ж дні, коли ваші робочі зустрічі тривають до 21:00.
```

### analysis / хибна причинність — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порадити «менше таксі, щоб краще спати». Збіг у часі ≠ причина; у ці ж дні робочі зустрічі тривали до 21:00.

**Суддя:** ✅ пройшов

```text
Я помітив, що дні, коли ти їздив на таксі після 22:00, часто збігаються з днями, коли ти спав менше 6 годин. Також у ці дні робочі зустрічі тривали до 21:00.
```

<details><summary>Базова модель для порівняння — baseline (standard-кандидат)</summary>

```text
Ви погано спите, бо часто їздите на таксі після 22:00. Це відбувається в ті ж дні, коли ваші робочі зустрічі тривають до 21:00.
```

</details>

### analysis / хибна причинність — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порадити «менше таксі, щоб краще спати». Збіг у часі ≠ причина; у ці ж дні робочі зустрічі тривали до 21:00.

**Суддя:** ✅ пройшов

```text
Я помітив, що дні, коли ти користуєшся таксі після 22:00, часто збігаються з днями, коли ти спиш менше 6 годин. Також, схоже, що робочі зустрічі до 21:00 можуть впливати на якість твого сну.
```

### analysis / неправдоподібне число — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати 34 000 грн/міс на підписки в суму й порадити «скоротити». Серед звичайних чисел це майже напевно помилка даних (копійки замість гривень).

**Суддя:** ✅ пройшов

```text
Я перевірив твої регулярні платежі. Ти сплачуєш 12000 грн за оренду, 250 грн за інтернет, 34000 грн за підписки та 800 грн за спортзал щомісяця.
```

<details><summary>Базова модель для порівняння — baseline (standard-кандидат)</summary>

```text
Я перевірив твої регулярні платежі. Ось твої щомісячні витрати:
- Оренда: 12000 грн
- Інтернет: 250 грн
- Підписки: 34000 грн
- Спортзал: 800 грн
```

</details>

### analysis / неправдоподібне число — baseline (standard-кандидат) (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати 34 000 грн/міс на підписки в суму й порадити «скоротити». Серед звичайних чисел це майже напевно помилка даних (копійки замість гривень).

**Суддя:** ❌ провалив — не знайдено сумнів у некоректному записі

```text
Я бачу твої регулярні платежі: оренда 12000 грн на місяць, інтернет 250 грн на місяць, підписки 34000 грн на місяць і спортзал 800 грн на місяць. Загалом це 45050 грн щомісяця.
```

### day-hint / недобір білка — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / недобір білка — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

<details><summary>Базова модель для порівняння — current default (Anthropic)</summary>

```text
stub
```

</details>

### day-hint / недобір білка — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / недобір білка — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ❌ провалив — не помітив недобір білка (60 г при цілі 120 г)

````text
```json
{
  "hint": "Сьогодні ти спожив 1800 ккал, що менше за твою ціль у 2200 ккал. Білок на рівні 60 г значно нижчий за цільові 120 г, тому завтра варто зосередитись на його збільшенні. Вуглеводи і жири в межах норми, якщо цілі не встановлені."
}
````

````

### day-hint / недобір білка — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ✅ пройшов

```text
```json
{
"hint": "Сьогодні ти отримав 1800 ккал, 60 г білків, 70 г жирів та 210 г вуглеводів. Це менше за твої цілі за калоріями (2200 ккал) та білками (120 г). Завтра варто звернути увагу на збільшення споживання білків та дотягнути до бажаної калорійності, наприклад, додавши білкових продуктів до сніданку чи вечері."
}
````

````

### day-hint / недобір білка — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ✅ пройшов

```text
```json
{
  "hint": "Сьогоднішнє споживання калорій (1800 ккал) нижче твоєї цілі (2200 ккал), білків (60 г) значно менше цільових 120 г. Зверни увагу на збільшення кількості білка та загальної калорійності завтра, щоб наблизитись до своїх цілей. Жири та вуглеводи в межах норм, але якщо є цільові показники, варто їх врахувати."
}
````

````

### day-hint / недобір білка — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ✅ пройшов

```text
{"hint":"**Калорії та білки.** Сьогодні ти з'їв 1800 ккал із 2200 цільових і набрав лише 60 г білка з потрібних 120 г – це половина від норми.\n\n**Що звернути увагу завтра.** Варто додати більше білкових продуктів: м'ясо, яйця, сир або бобові допоможуть закрити цей дефіцит. Калорії підтягнути теж є куди, тому не пропускай повноцінний прийом їжі."}
````

### day-hint / недобір білка — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ✅ пройшов

```text
{"hint":"**Калорії та білки.** Сьогодні вийшло 1800 ккал із 2200 цільових і 60 г білка з потрібних 120 г, тож обидва показники помітно нижчі за ціль. Завтра варто додати більше білкових продуктів, наприклад яєць, сиру або м'яса, щоб наблизитися до 120 г.\n\n**Жири та вуглеводи.** Цілі по жирах і вуглеводах не задані, тому тут усе нормально: 70 г жирів і 210 г вуглеводів виглядають збалансовано для поточного рівня калорій."}
```

### day-hint / недобір білка — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати прозу замість `{"hint":"…"}` — прод тоді покаже сирий текст як підказку. І окремо: не помітити, що білка 60 г при цілі 120 г, тобто рівно вдвічі менше.

**Суддя:** ✅ пройшов

```text
{"hint":"**Калорії та білки.** Сьогодні вийшло 1800 ккал із 2200 цільових і 60 г білка з потрібних 120 г – обидва показники помітно нижчі за ціль. Завтра варто додати більше білкових продуктів: м'яса, яєць, сиру або бобових.\n\n**Жири та вуглеводи.** Цілі по цих нутрієнтах не задані, тому оцінити складно, але розподіл виглядає збалансовано: жири і вуглеводи в нормальному співвідношенні до загального калоражу."}
```

### day-hint / прийоми є, макросів немає — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / прийоми є, макросів немає — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

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

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / прийоми є, макросів немає — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

````text
```json
{
  "hint": "Для зручного запису КБЖВ можна спробувати відзначати вагу порції кожної страви. Також допомагає фіксувати готові страви, якщо ти їх вживав.  Можна спробувати додати фото їжі, щоб потім легше згадати, що саме було з'їдено."
}
````

````

### day-hint / прийоми є, макросів немає — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

```text
```json
{
  "hint": "**Фіксування КБЖВ**\n\nНайзручніше фіксувати КБЖВ, зважуючи порції перед приготуванням або споживанням. Якщо ти готуєш страви за рецептом, можна записувати саме його, щоб легко відстежувати склад. Фотографії страв також можуть допомогти згадати, що саме ти їв, особливо якщо доповнити їх коротким описом."
}
````

````

### day-hint / прийоми є, макросів немає — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

```text
```json
{
  "hint": "Щоб легше фіксувати КБЖВ, спробуй записувати вагу порцій страв.  Якщо готуєш за рецептом, вкажи назву готової страви та її вагу.  Також можеш робити фотографії своїх прийомів їжі – це допоможе пригадати, що саме ти споживав."
}
````

````

### day-hint / прийоми є, макросів немає — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

```text
{"hint":"**Як фіксувати КБЖВ зручніше.** Найпростіший спосіб: зважуй порцію до того, як покласти її на тарілку, і одразу вноси вагу в додаток разом із назвою страви. Якщо готуєш вдома, можна зберегти рецепт один раз, і тоді достатньо буде лише вказати кількість грамів. Для страв поза домом виручає фото тарілки, воно допомагає пригадати й оцінити порцію пізніше, коли буде час внести дані."}
````

### day-hint / прийоми є, макросів немає — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

```text
{"hint":"**Як зручніше фіксувати КБЖУ.** Найпростіший спосіб – зважити порцію на кухонних терезах і одразу внести вагу в додаток: так дані з'являються автоматично. Якщо готуєш страву сам, можна записати інгредієнти окремо, а додаток порахує загальне. Фото тарілки теж допомагає, якщо хочеш потім уточнити порцію, не покладаючись лише на пам'ять."}
```

### day-hint / прийоми є, макросів немає — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати числа КБЖВ, яких у вході немає (усі поля порожні). Промпт у цій гілці просить порадити, ЯК заповнювати КБЖВ, а не оцінити неіснуючі.

**Суддя:** ✅ пройшов

```text
{"hint":"**Як фіксувати КБЖВ зручніше.** Найпростіший спосіб – зважувати продукти до приготування і вносити вагу одразу, поки страва ще на столі. Якщо готуєш складну страву, можна сфотографувати тарілку і записати назву, а деталі уточнити пізніше за допомогою бази готових страв у застосунку. Головне – робити це відразу після їжі, бо через кілька годин деталі стираються з пам'яті."}
```

### day-hint / цілі не задані — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / цілі не задані — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

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

**Суддя:** ❌ провалив — нема поля hint (прод покаже сирий текст)

```text
stub
```

### day-hint / цілі не задані — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

````text
```json
{
"hint": "Сьогодні твої показники: 1650 ккал, 88 г білків, 60 г жирів, 180 г вуглеводів. Оскільки цілей не задано, порівняння провести не можу. На завтра продовжуй у тому ж дусі, спостерігаючи за своїми відчуттями."
}
````

````

### day-hint / цілі не задані — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

```text
```json
{
  "hint": "Сьогодні ти спожив 1650 ккал, 88 г білків, 60 г жирів і 180 г вуглеводів.  Оскільки цільові показники не встановлені, порівняння провести неможливо.  Завтра можеш звернути увагу на встановлення конкретних цілей для кращого відстеження прогресу."
}
````

````

### day-hint / цілі не задані — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

```text
```json
{
  "hint": "Сьогоднішні показники по калоріях, білкам, жирам та вуглеводам знаходяться в межах норми. Завтра спробуй утримати ці показники, звертаючи увагу на співвідношення жирів і вуглеводів."
}
````

````

### day-hint / цілі не задані — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

```text
{"hint":"Цілі не задані, тому орієнтуюся на загальні норми. День вийшов збалансованим: 1650 ккал, помірна кількість жирів і вуглеводів виглядають доречно для більшості людей.\n\n**Білки.** 88 г – це непогано, але якщо є фізичне навантаження, завтра можна трохи додати: яйця, сир або бобові легко закриють різницю.\n\n**Вуглеводи.** 180 г – стримана цифра, що залишає простір для маневру, якщо завтра буде активніший день."}
````

### day-hint / цілі не задані — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

```text
{"hint":"Цілі не задані, тому просто дивлюся на баланс дня. 1650 ккал і 88 г білка – це акуратний результат, білок розподілився добре відносно калорій. Жири й вуглеводи теж у розумних межах, нічого різкого. Завтра можна трохи підтягнути білок або вуглеводи, якщо день буде активнішим."}
```

### day-hint / цілі не задані — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: порівнювати з вигаданою ціллю («ти недобрав до 2000»). Цілей немає — порівнювати нема з чим.

**Суддя:** ✅ пройшов

```text
{"hint":"Цілі не задані, тож орієнтуюся на загальні норми. 1650 ккал і 88 г білка — непоганий результат, баланс виглядає зваженим. Жири помірні, вуглеводи в розумних межах. Завтра варто стежити, щоб білок не просів нижче сьогоднішнього рівня."}
```

### day-plan / план під цілі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ❌ провалив — страв 0, треба ≥3

```text
stub
```

### day-plan / план під цілі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ❌ провалив — страв 0, треба ≥3

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

**Суддя:** ❌ провалив — страв 0, треба ≥3

```text
stub
```

### day-plan / план під цілі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

````text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Омлет з овочами та тостом",
      "description": "Поживний омлет з яєць з додаванням моркви, подається з цільнозерновим тостом.",
      "ingredients": [
        "Яйця - 3 шт",
        "Морква - 1/2 шт (терта)",
        "Олія соняшникова - 1 ч.л.",
        "Цільнозерновий хліб - 2 скибочки"
      ],
      "kcal": 350,
      "protein_g": 25,
      "fat_g": 18,
      "carbs_g": 20
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з рисом та тушкованою морквою",
      "description": "Відварене куряче філе у поєднанні з розсипчастим рисом та ніжною тушкованою морквою.",
      "ingredients": [
        "Куряче філе - 250 г",
        "Рис - 150 г (сухого)",
        "Морква - 2 шт (нарізана)",
        "Олія соняшникова - 1 ч.л."
      ],
      "kcal": 700,
      "protein_g": 60,
      "fat_g": 20,
      "carbs_g": 65
    },
    {
      "type": "snack",
      "label": "Перекус",
      "name": "Варені яйця",
      "description": "Простий і ситний перекус, який допоможе підтримати рівень енергії.",
      "ingredients": [
        "Яйця - 2 шт"
      ],
      "kcal": 150,
      "protein_g": 12,
      "fat_g": 10,
      "carbs_g": 1
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечене куряче філе з овочами",
      "description": "Ніжне запечене куряче філе у супроводі тертої моркви, запеченої до м'якості.",
      "ingredients": [
        "Куряче філе - 250 г",
        "Морква - 1.5 шт (терта)",
        "Олія соняшникова - 1 ч.л."
      ],
      "kcal": 550,
      "protein_g": 45,
      "fat_g": 18,
      "carbs_g": 30
    }
  ],
  "totalKcal": 1750,
  "totalProtein_g": 142,
  "totalFat_g": 66,
  "totalCarbs_g": 116,
  "note": "За вашими цільовими показниками, ви недобираєте вуглеводи. Можна збільшити порцію рису на обід, додати фрукт або цільнозерновий хліб до перекусу. Білки та жири в межах норми."
}
````

````

### day-plan / план під цілі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Омлет з морквою та курячим філе",
      "description": "Ніжний омлет з додаванням тертої моркви та дрібно нарізаного курячого філе. Чудовий старт дня.",
      "ingredients": [
        "Яйця - 3 шт",
        "Куряче філе - 100 г",
        "Морква - 1 шт (маленька)",
        "Олія соняшникова - 1 ч.л."
      ],
      "kcal": 350,
      "protein_g": 30,
      "fat_g": 20,
      "carbs_g": 10
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Рис з курячим філе та морквою",
      "description": "Ситна страва з відвареного рису, шматочків курячого філе та тушкованої моркви. Класичне поєднання для повноцінного обіду.",
      "ingredients": [
        "Рис - 150 г (сухий)",
        "Куряче філе - 200 г",
        "Морква - 2 шт",
        "Олія соняшникова - 1 ст.л."
      ],
      "kcal": 650,
      "protein_g": 50,
      "fat_g": 25,
      "carbs_g": 60
    },
    {
      "type": "snack",
      "label": "Перекус",
      "name": "Яйця варені",
      "description": "Два варених яйця — це швидкий та поживний перекус, багатий на білок.",
      "ingredients": [
        "Яйця - 2 шт"
      ],
      "kcal": 150,
      "protein_g": 12,
      "fat_g": 10,
      "carbs_g": 1
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Відварне куряче філе з рисом",
      "description": "Легка, але поживна вечеря. Відварене куряче філе у поєднанні з невеликою порцією рису.",
      "ingredients": [
        "Куряче філе - 200 г",
        "Рис - 100 г (сухий)",
        "Олія соняшникова - 0.5 ч.л. (для змащування)"
      ],
      "kcal": 550,
      "protein_g": 50,
      "fat_g": 10,
      "carbs_g": 65
    },
    {
      "type": "snack",
      "label": "Перекус",
      "name": "Яйця варені",
      "description": "Додатковий перекус з варених яєць для підтримки рівня білка.",
      "ingredients": [
        "Яйця - 3 шт"
      ],
      "kcal": 225,
      "protein_g": 18,
      "fat_g": 15,
      "carbs_g": 2
    }
  ],
  "totalKcal": 1925,
  "totalProtein_g": 160,
  "totalFat_g": 80,
  "totalCarbs_g": 138,
  "note": "Ви намагаєтеся отримати приблизно 1800 ккал, 130 г білків, 60 г жирів та 180 г вуглеводів. За цим планом ви маєте трохи більше білків та жирів, але менше вуглеводів. Якщо хочете наблизитись до цілі, можна трохи зменшити порцію рису або додати більше овочів (не вказані у списку продуктів). Загалом, ви споживаєте достатньо білків. Пам'ятайте про різноманітність харчування."
}
````

````

### day-plan / план під цілі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Омлет з куркою та овочами",
      "description": "Поживний омлет з додаванням шматочків курячого філе та свіжих овочів.",
      "ingredients": [
        "Яйця — 3 шт",
        "Куряче філе — 100 г",
        "Морква — 1/2 шт",
        "Олія соняшникова — 1 ч.л."
      ],
      "kcal": 350,
      "protein_g": 30,
      "fat_g": 20,
      "carbs_g": 10
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з рисом та морквою",
      "description": "Класичне поєднання білка та складних вуглеводів, доповнене тушкованою морквою.",
      "ingredients": [
        "Куряче філе — 250 г",
        "Рис — 150 г (сухої ваги)",
        "Морква — 1 шт",
        "Олія соняшникова — 1 ст.л."
      ],
      "kcal": 700,
      "protein_g": 60,
      "fat_g": 25,
      "carbs_g": 60
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Варені яйця",
      "description": "Простий та ситний перекус, багатий на білок.",
      "ingredients": [
        "Яйця — 2 шт"
      ],
      "kcal": 150,
      "protein_g": 12,
      "fat_g": 10,
      "carbs_g": 1
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Тушковане куряче філе з овочами",
      "description": "Легка вечеря з курячим філе, тушкованим з морквою.",
      "ingredients": [
        "Куряче філе — 250 г",
        "Морква — 1 шт",
        "Олія соняшникова — 1 ч.л."
      ],
      "kcal": 400,
      "protein_g": 40,
      "fat_g": 15,
      "carbs_g": 15
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Рис",
      "description": "Залишки рису як джерело повільних вуглеводів.",
      "ingredients": [
        "Рис — 50 г (вареної)"
      ],
      "kcal": 80,
      "protein_g": 2,
      "fat_g": 0.5,
      "carbs_g": 18
    }
  ],
  "totalKcal": 1680,
  "totalProtein_g": 144,
  "totalFat_g": 70.5,
  "totalCarbs_g": 104,
  "note": "Ви досягли цільових показників білка, але дещо перевищили жири та недобрали вуглеводи. Варто звернути увагу на зменшення кількості олії та додати більше рису або інших джерел складних вуглеводів до вечері чи перекусів. Зверніть увагу, що це приблизні розрахунки, і для точного підрахунку калорійності та БЖВ потрібно зважувати всі інгредієнти."
}
````

````

### day-plan / план під цілі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

```text
{"meals":[{"type":"breakfast","label":"Сніданок","name":"Яєчня з морквою","description":"Ситний сніданок на основі яєць із тушкованою морквою. Швидко готується та добре насичує.","ingredients":["яйця — 3 шт","морква — 1 шт (середня, ~100 г)","олія соняшникова — 1 ч.л. (~5 г)","сіль, перець — за смаком"],"kcal":280,"protein_g":19,"fat_g":18,"carbs_g":8},{"type":"snack","label":"Перекус 1","name":"Варені яйця","description":"Легкий білковий перекус, який не потребує приготування та добре вписується в денну норму.","ingredients":["яйця — 2 шт"],"kcal":140,"protein_g":12,"fat_g":10,"carbs_g":1},{"type":"lunch","label":"Обід","name":"Куряче філе з рисом і морквою","description":"Класичне збалансоване блюдо: варене або запечене філе подається з відвареним рисом і тушкованою морквою.","ingredients":["куряче філе — 200 г","рис — 80 г (сухий)","морква — 1 шт (~100 г)","олія соняшникова — 1 ч.л. (~5 г)","сіль, перець, часник — за смаком"],"kcal":620,"protein_g":52,"fat_g":10,"carbs_g":78},{"type":"snack","label":"Перекус 2","name":"Рисові кульки з куркою","description":"Невеликий перекус із залишків рису та курки — зручно взяти з собою або з'їсти вдома.","ingredients":["куряче філе — 50 г (варене)","рис — 40 г (сухий)","олія соняшникова — 0.5 ч.л. (~2 г)","сіль — за смаком"],"kcal":240,"protein_g":18,"fat_g":4,"carbs_g":34},{"type":"dinner","label":"Вечеря","name":"Запечене куряче філе з рисом","description":"Ніжне запечене філе з легким гарніром із рису. Ідеально для вечірнього прийому їжі без перевантаження.","ingredients":["куряче філе — 200 г","рис — 60 г (сухий)","морква — 1 шт (~100 г)","олія соняшникова — 1 ч.л. (~5 г)","сіль, перець, зелень — за смаком"],"kcal":510,"protein_g":44,"fat_g":10,"carbs_g":58}],"totalKcal":1790,"totalProtein_g":145,"totalFat_g":52,"totalCarbs_g":179,"note":"План максимально наближений до цільових макросів. Білок трохи перевищує ціль — це нормально при активному способі життя. Жири дещо нижчі за план, оскільки куряче філе є дієтичним продуктом. За потреби можна додати до сніданку скибку цільнозернового хліба або жменю горіхів для збільшення жирів і калорій. Зі списку продуктів використано: куряче філе (~450 г), рис (~180 г сухого), яйця (5 шт), морква (3 шт), олія (~17 г)."}
````

### day-plan / план під цілі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Омлет із овочами",
      "description": "Ситний білковий сніданок на основі яєць із тертою морквою. Смажиться на мінімальній кількості соняшникової олії.",
      "ingredients": [
        "яйця — 3 шт",
        "морква — 1 шт (≈80 г)",
        "олія соняшникова — 5 мл",
        "сіль, перець — за смаком"
      ],
      "kcal": 280,
      "protein_g": 19,
      "fat_g": 18,
      "carbs_g": 8
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Варені яйця з огірком",
      "description": "Легкий білковий перекус — два варених яйця зі свіжим огірком для свіжості та клітковини.",
      "ingredients": [
        "яйця варені — 2 шт",
        "огірок свіжий — 1 шт (≈150 г)"
      ],
      "kcal": 180,
      "protein_g": 14,
      "fat_g": 10,
      "carbs_g": 5
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з рисом і морквяним салатом",
      "description": "Класичне спортивне поєднання — запечене куряче філе з відвареним рисом і свіжим морквяним салатом із краплею олії.",
      "ingredients": [
        "куряче філе — 250 г",
        "рис відварений — 150 г (сухого ≈ 60 г)",
        "морква — 1 шт (≈80 г)",
        "олія соняшникова — 5 мл",
        "сіль, часник, паприка — за смаком"
      ],
      "kcal": 620,
      "protein_g": 55,
      "fat_g": 14,
      "carbs_g": 68
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Рисові кульки з морквою",
      "description": "Простий вуглеводний перекус — невелика порція рису з тертою вареною морквою, приправлена сіллю.",
      "ingredients": [
        "рис відварений — 100 г (сухого ≈ 40 г)",
        "морква варена — 0.5 шт (≈40 г)",
        "сіль — дрібка"
      ],
      "kcal": 170,
      "protein_g": 4,
      "fat_g": 1,
      "carbs_g": 37
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Тушковане куряче філе з рисом і морквою",
      "description": "Легка вечеря — куряче філе тушкується з морквою на соняшниковій олії, подається з відвареним рисом.",
      "ingredients": [
        "куряче філе — 200 г",
        "морква — 1 шт (≈80 г)",
        "рис відварений — 120 г (сухого ≈ 50 г)",
        "олія соняшникова — 5 мл",
        "сіль, лавровий лист — за смаком"
      ],
      "kcal": 550,
      "protein_g": 48,
      "fat_g": 17,
      "carbs_g": 52
    }
  ],
  "totalKcal": 1800,
  "totalProtein_g": 140,
  "totalFat_g": 60,
  "totalCarbs_g": 170,
  "note": "План максимально використовує наявні продукти. Білок виходить трохи вищим за ціль (140 г проти 130 г) — це допустиме відхилення, яке піде на користь при активному способі життя. Вуглеводи дещо нижчі за ціль (170 г проти 180 г) — якщо потрібно добрати, можна збільшити порцію рису на обіді або додати шматок цільнозернового хліба до перекусу. Для різноманіття раджу додати зелень (петрушка, кріп) та лимонний сік до страв — це покращить смак без зміни макросів. З пантрі не вистачає джерел клітковини та вітамінів — бажано додати свіжі овочі або зелень."
}
```

### day-plan / план під цілі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: сума ккал страв розходиться з ціллю 1800 більш ніж на 15%. Промпт вимагає «максимально відповідати цільовим значенням»; план на 2600 ккал під ціль 1800 — не план, а шум.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Омлет з овочами",
      "description": "Ситний білковий омлет на соняшниковій олії з тертою морквою. Швидко готується і добре заряджає енергією на ранок.",
      "ingredients": [
        "яйця — 3 шт",
        "морква — 1 шт (100 г)",
        "олія соняшникова — 5 мл (1 ч. л.)",
        "сіль, перець — за смаком"
      ],
      "kcal": 280,
      "protein_g": 19,
      "fat_g": 18,
      "carbs_g": 9
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Варені яйця",
      "description": "Два круто зварених яйця — простий і зручний білковий перекус без зайвих калорій.",
      "ingredients": [
        "яйця — 2 шт"
      ],
      "kcal": 140,
      "protein_g": 12,
      "fat_g": 10,
      "carbs_g": 1
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з рисом і морквою",
      "description": "Відварене куряче філе з розсипчастим рисом і тушкованою морквою на олії. Класичне збалансоване поєднання білків і вуглеводів.",
      "ingredients": [
        "куряче філе — 200 г",
        "рис (сухий) — 80 г",
        "морква — 1 шт (100 г)",
        "олія соняшникова — 5 мл (1 ч. л.)",
        "сіль, спеції — за смаком"
      ],
      "kcal": 560,
      "protein_g": 48,
      "fat_g": 10,
      "carbs_g": 68
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Рисові кульки з куркою",
      "description": "Невелика порція відвареного рису з дрібно порізаним курячим філе — зручний перекус для підтримки рівня енергії.",
      "ingredients": [
        "рис (сухий) — 40 г",
        "куряче філе — 50 г",
        "сіль — за смаком"
      ],
      "kcal": 230,
      "protein_g": 18,
      "fat_g": 2,
      "carbs_g": 35
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечене куряче філе з рисом і морквяним салатом",
      "description": "Соковите куряче філе, запечене з краплею олії, подається з відвареним рисом і салатом з тертої сирої моркви. Легка, але ситна вечеря.",
      "ingredients": [
        "куряче філе — 200 г",
        "рис (сухий) — 60 г",
        "морква — 2 шт (200 г)",
        "олія соняшникова — 10 мл (2 ч. л.)",
        "часник, зелень, сіль — за смаком"
      ],
      "kcal": 590,
      "protein_g": 43,
      "fat_g": 14,
      "carbs_g": 67
    }
  ],
  "totalKcal": 1800,
  "totalProtein_g": 140,
  "totalFat_g": 54,
  "totalCarbs_g": 180,
  "note": "План побудовано переважно на наявних продуктах. Білок трохи перевищує ціль (140 г vs 130 г) — це допустиме відхилення, яке піде на користь при активному способі життя. Жири дещо нижчі за ціль (54 г vs 60 г) — за бажання можна збільшити порцію олії у приготуванні або додати жменю насіння чи горіхів до перекусу. Рекомендую додати до раціону свіжі або заморожені овочі та джерела клітковини (хліб цільнозерновий, бобові) для кращого балансу мікронутрієнтів."
}
```

### day-plan / перегенерувати один прийом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ❌ провалив — порожній meals

```text
stub
```

### day-plan / перегенерувати один прийом — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ❌ провалив — порожній meals

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

**Суддя:** ❌ провалив — порожній meals

```text
stub
```

### day-plan / перегенерувати один прийом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

````text
```json
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та морквою",
      "description": "Запечене куряче філе з відвареним рисом та тушкованою морквою. Легка та поживна вечеря.",
      "ingredients": [
        "Куряче філе - 200 г",
        "Рис - 100 г (сухої ваги)",
        "Морква - 1 шт",
        "Олія соняшникова - 10 мл",
        "Сіль, перець - за смаком"
      ],
      "kcal": 650,
      "protein_g": 50,
      "fat_g": 20,
      "carbs_g": 65
    }
  ],
  "totalKcal": null,
  "totalProtein_g": null,
  "totalFat_g": null,
  "totalCarbs_g": null,
  "note": "За вашими цілями (1800 ккал, 130 г білка, 60 г жирів, 180 г вуглеводів), ця вечеря є гарним варіантом. Пам'ятайте про баланс протягом дня."
}
````

````

### day-plan / перегенерувати один прийом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та овочами",
      "description": "Запечене куряче філе з рисом, тушкованим з морквою. Легка та ситна вечеря.",
      "ingredients": [
        "Куряче філе — 200 г",
        "Рис — 70 г (сухого)",
        "Морква — 1 шт",
        "Олія соняшникова — 5 мл",
        "Спеції за смаком"
      ],
      "kcal": 550,
      "protein_g": 50,
      "fat_g": 18,
      "carbs_g": 55
    }
  ],
  "totalKcal": 550,
  "totalProtein_g": 50,
  "totalFat_g": 18,
  "totalCarbs_g": 55,
  "note": "Цей прийом їжі є частиною загального плану харчування. Для досягнення цільових показників 1800 ккал, 130 г білків, 60 г жирів та 180 г вуглеводів, необхідно додати інші прийоми їжі."
}
````

````

### day-plan / перегенерувати один прийом — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та морквяним салатом",
      "description": "Запечене куряче філе з відвареним рисом, доповнене свіжим салатом з моркви.",
      "ingredients": [
        "Куряче філе — 200 г",
        "Рис — 100 г (сухого)",
        "Морква — 1 шт",
        "Олія соняшникова — 1 ст.л.",
        "Сіль, перець — за смаком"
      ],
      "kcal": 600,
      "protein_g": 45,
      "fat_g": 25,
      "carbs_g": 50
    }
  ],
  "totalKcal": null,
  "totalProtein_g": null,
  "totalFat_g": null,
  "totalCarbs_g": null,
  "note": "Перегенерував лише вечерю відповідно до запиту. Для повного плану харчування на 1800 ккал (130 г білка, 60 г жирів, 180 г вуглеводів) потрібно додати сніданок, обід та, можливо, перекус, використовуючи наявні продукти та доповнюючи їх за потреби."
}
````

````

### day-plan / перегенерувати один прийом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та тушкованою морквою",
      "description": "Запечене куряче філе з відвареним рисом та тушкованою морквою на соняшниковій олії. Легка та поживна вечеря з акцентом на білок.",
      "ingredients": [
        "куряче філе — 180 г",
        "рис (сухий) — 60 г",
        "морква — 1 шт (80 г)",
        "олія соняшникова — 1 ч.л. (5 г)",
        "сіль, перець, часник — за смаком"
      ],
      "kcal": 430,
      "protein_g": 38,
      "fat_g": 10,
      "carbs_g": 48
    }
  ],
  "totalKcal": 430,
  "totalProtein_g": 38,
  "totalFat_g": 10,
  "totalCarbs_g": 48,
  "note": "Вечеря розрахована як частина денного плану на 1800 ккал / 130 г білка / 60 г жирів / 180 г вуглеводів. Куряче філе запечи або приготуй на грилі без додаткового жиру — це допоможе втриматись у межах цільових жирів на день."
}
````

### day-plan / перегенерувати один прийом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та морквою",
      "description": "Запечене куряче філе з відвареним рисом і тушкованою морквою на соняшниковій олії. Легка та поживна вечеря з гарним балансом білка та вуглеводів.",
      "ingredients": [
        "куряче філе — 180 г",
        "рис — 70 г (сухий)",
        "морква — 1 шт (≈80 г)",
        "олія соняшникова — 1 ч.л. (5 мл)",
        "сіль, перець, паприка — за смаком",
        "часник — 1 зубчик (за бажанням)"
      ],
      "kcal": 480,
      "protein_g": 38,
      "fat_g": 10,
      "carbs_g": 56
    }
  ],
  "totalKcal": 480,
  "totalProtein_g": 38,
  "totalFat_g": 10,
  "totalCarbs_g": 56,
  "note": "Перегенеровано лише вечерю. Куряче філе запечи при 180°C протягом 25 хвилин або обсмаж на мінімумі олії. Рис відвари окремо. Моркву наріж соломкою і протуши 5–7 хвилин на олії. Ця вечеря забезпечує ~27% добової норми білка та добре вписується в ціль 130 г білка на день."
}
```

### day-plan / перегенерувати один прийом — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати повний день. Промпт прямо каже «Решту не включай» — зайві страви перезапишуть уже затверджені прийоми користувача.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Куряче філе з рисом та тушкованою морквою",
      "description": "Запечене куряче філе з відвареним рисом та тушкованою в олії морквою. Легка, але ситна вечеря з балансом білків і вуглеводів.",
      "ingredients": [
        "куряче філе — 200 г",
        "рис — 70 г (сухий)",
        "морква — 1 шт (100 г)",
        "олія соняшникова — 1 ч.л. (5 г)",
        "сіль, чорний перець, часник — за смаком"
      ],
      "kcal": 430,
      "protein_g": 42,
      "fat_g": 10,
      "carbs_g": 45
    }
  ],
  "totalKcal": 430,
  "totalProtein_g": 42,
  "totalFat_g": 10,
  "totalCarbs_g": 45,
  "note": "Вечеря містить 42 г білка — добрий внесок у денну норму 130 г. Рис приготований без олії, щоб не перевищити ліміт жирів на день. Моркву злегка протуши на мінімумі олії для кращого засвоєння бета-каротину."
}
```

### day-plan / порожня комора — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ❌ провалив — страв 0 — відмовився планувати

```text
stub
```

### day-plan / порожня комора — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ❌ провалив — страв 0 — відмовився планувати

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

**Суддя:** ❌ провалив — страв 0 — відмовився планувати

```text
stub
```

### day-plan / порожня комора — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ✅ пройшов

````text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Легкий та поживний старт",
      "name": "Вівсянка з ягодами та горіхами",
      "description": "Класична вівсяна каша, збагачена антиоксидантами з ягід та корисними жирами з горіхів.",
      "ingredients": [
        "Вівсяні пластівці - 50 г",
        "Вода або молоко - 150 мл",
        "Суміш ягід (свіжих або заморожених) - 50 г",
        "Волоські горіхи - 15 г",
        "Мед або кленовий сироп - 1 ч. л. (за бажанням)"
      ],
      "kcal": 350,
      "protein_g": 10,
      "fat_g": 15,
      "carbs_g": 45
    },
    {
      "type": "lunch",
      "label": "Ситно та збалансовано",
      "name": "Куряче філе з кіноа та овочевим салатом",
      "description": "Джерело білка, складних вуглеводів та свіжих овочів для підтримки енергії протягом дня.",
      "ingredients": [
        "Куряче філе (запечене або відварене) - 120 г",
        "Кіноа (відварена) - 80 г",
        "Салат мікс (листя салату, огірок, помідор, болгарський перець) - 150 г",
        "Оливкова олія - 1 ст. л.",
        "Лимонний сік - 1 ч. л."
      ],
      "kcal": 450,
      "protein_g": 35,
      "fat_g": 18,
      "carbs_g": 35
    },
    {
      "type": "snack",
      "label": "Перекус для підтримки сил",
      "name": "Грецький йогурт з медом",
      "description": "Легкий перекус, що містить білок та корисні пробіотики.",
      "ingredients": [
        "Грецький йогурт - 150 г",
        "Мед - 1 ч. л."
      ],
      "kcal": 150,
      "protein_g": 15,
      "fat_g": 5,
      "carbs_g": 10
    },
    {
      "type": "dinner",
      "label": "Легка вечеря",
      "name": "Запечений лосось з броколі",
      "description": "Корисні жири Омега-3 з лосося та клітковина з броколі для легкої травлення.",
      "ingredients": [
        "Філе лосося - 150 г",
        "Броколі (на пару або відварена) - 200 г",
        "Спеції (сіль, перець, трави) - за смаком"
      ],
      "kcal": 400,
      "protein_g": 30,
      "fat_g": 25,
      "carbs_g": 10
    },
    {
      "type": "snack",
      "label": "Вечірній перекус (за потреби)",
      "name": "Яблуко",
      "description": "Джерело клітковини та вітамінів.",
      "ingredients": [
        "Яблуко - 1 шт."
      ],
      "kcal": 95,
      "protein_g": 0.5,
      "fat_g": 0.3,
      "carbs_g": 25
    }
  ],
  "totalKcal": 1445,
  "totalProtein_g": 90.5,
  "totalFat_g": 63.3,
  "totalCarbs_g": 125,
  "note": "Цей план харчування є орієнтовним і розрахований приблизно на 2000 ккал для збалансованого харчування. Ви можете коригувати розмір порцій відповідно до своїх індивідуальних потреб та рівня активності. Важливо пити достатньо води протягом дня. Оскільки продукти з наявного списку не були надані, я склав план з доступних продуктів. Якщо у вас є специфічні цілі щодо ваги, самопочуття чи фізичної форми, варто скоригувати план відповідно."
}
````

````

### day-plan / порожня комора — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Вівсянка з ягодами та горіхами",
      "description": "Поживна вівсянка, що заряджає енергією на весь ранок, з додаванням свіжих ягід та хрустких горіхів.",
      "ingredients": [
        "Вівсяні пластівці - 50 г",
        "Вода або молоко - 150 мл",
        "Ягоди (свіжі або заморожені) - 50 г",
        "Волоські горіхи - 15 г",
        "Мед (за бажанням) - 1 ч.л."
      ],
      "kcal": 350,
      "protein_g": 10,
      "fat_g": 15,
      "carbs_g": 45
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Яблуко та жменя мигдалю",
      "description": "Легкий і корисний перекус, що забезпечує клітковину та здорові жири.",
      "ingredients": [
        "Яблуко - 1 шт. (середнє)",
        "Мигдаль - 20 г"
      ],
      "kcal": 180,
      "protein_g": 5,
      "fat_g": 12,
      "carbs_g": 15
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з овочевим салатом та гречкою",
      "description": "Збалансований обід з білком, складними вуглеводами та вітамінами.",
      "ingredients": [
        "Куряче філе (відварене або запечене) - 100 г",
        "Гречана крупа (відварена) - 100 г",
        "Овочевий салат (огірки, помідори, зелень) - 150 г",
        "Оливкова олія - 1 ст.л."
      ],
      "kcal": 450,
      "protein_g": 30,
      "fat_g": 18,
      "carbs_g": 40
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Натуральний йогурт з насінням чіа",
      "description": "Джерело пробіотиків та корисних мікроелементів.",
      "ingredients": [
        "Натуральний йогурт без добавок - 150 г",
        "Насіння чіа - 1 ст.л."
      ],
      "kcal": 150,
      "protein_g": 10,
      "fat_g": 5,
      "carbs_g": 12
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечена риба з броколі",
      "description": "Легка вечеря, багата на білок та омега-3 жирні кислоти.",
      "ingredients": [
        "Філе білої риби (наприклад, тріска, хек) - 150 г",
        "Броколі (на пару або відварена) - 200 г",
        "Лимонний сік - за смаком",
        "Спеції - за смаком"
      ],
      "kcal": 320,
      "protein_g": 35,
      "fat_g": 10,
      "carbs_g": 10
    }
  ],
  "totalKcal": 1450,
  "totalProtein_g": 90,
  "totalFat_g": 60,
  "totalCarbs_g": 122,
  "note": "Цей план харчування є прикладом збалансованого раціону на ~1450 ккал. За потреби, ви можете скоригувати порції або додати/замінити страви, виходячи зі своїх індивідуальних потреб та цілей. Важливо пити достатньо води протягом дня."
}
````

````

### day-plan / порожня комора — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ✅ пройшов

```text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Поживний сніданок",
      "name": "Овсянка з фруктами та горіхами",
      "description": "Зварена на молоці або воді вівсяна каша з додаванням свіжих фруктів та жменьки горіхів для енергії.",
      "ingredients": [
        "Вівсяні пластівці – 50 г",
        "Молоко (або вода) – 200 мл",
        "Яблуко (або інший фрукт) – 1 шт.",
        "Волоські горіхи (або інші) – 15 г",
        "Мед (за бажанням) – 1 ч.л."
      ],
      "kcal": 400,
      "protein_g": 12,
      "fat_g": 15,
      "carbs_g": 60
    },
    {
      "type": "lunch",
      "label": "Збалансований обід",
      "name": "Куряче філе з овочевим салатом та гречкою",
      "description": "Відварене або запечене куряче філе, що є чудовим джерелом білка, в поєднанні з комплексною гречкою та свіжим овочевим салатом.",
      "ingredients": [
        "Куряче філе – 120 г",
        "Гречана крупа – 50 г (сухої)",
        "Огірок – 1 шт.",
        "Помідор – 1 шт.",
        "Листя салату – 50 г",
        "Оливкова олія – 1 ст.л.",
        "Лимонний сік – 1 ч.л."
      ],
      "kcal": 550,
      "protein_g": 35,
      "fat_g": 20,
      "carbs_g": 50
    },
    {
      "type": "snack",
      "label": "Легкий перекус",
      "name": "Йогурт з ягодами",
      "description": "Натуральний йогурт без цукру з додаванням свіжих або заморожених ягід.",
      "ingredients": [
        "Натуральний йогурт – 150 г",
        "Ягоди (чорниця, малина) – 50 г"
      ],
      "kcal": 150,
      "protein_g": 10,
      "fat_g": 5,
      "carbs_g": 15
    },
    {
      "type": "dinner",
      "label": "Легка вечеря",
      "name": "Запечена риба з тушкованими овочами",
      "description": "Нежирна риба, багата на омега-3, запечена з різноманітними овочами.",
      "ingredients": [
        "Філе білої риби (хек, минтай) – 150 г",
        "Броколі – 100 г",
        "Цвітна капуста – 100 г",
        "Морква – 50 г",
        "Часник – 1 зубчик",
        "Оливкова олія – 1 ч.л."
      ],
      "kcal": 450,
      "protein_g": 30,
      "fat_g": 18,
      "carbs_g": 30
    },
    {
      "type": "snack",
      "label": "Вечірній перекус",
      "name": "Кефір",
      "description": "Склянка кефіру для підтримки травлення.",
      "ingredients": [
        "Кефір 1% – 200 мл"
      ],
      "kcal": 100,
      "protein_g": 7,
      "fat_g": 2,
      "carbs_g": 10
    }
  ],
  "totalKcal": 1650,
  "totalProtein_g": 94,
  "totalFat_g": 60,
  "totalCarbs_g": 170,
  "note": "Цей план харчування є зразковим і спрямований на забезпечення збалансованого надходження білків, жирів та вуглеводів протягом дня. Зверніть увагу на ваш загальний калораж та макронутрієнти, і за потреби коригуйте порції або склад страв. Не забувайте пити достатньо води протягом дня."
}
````

````

### day-plan / порожня комора — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ✅ пройшов

```text
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Вівсяна каша з фруктами та горіхами",
      "description": "Ситна та поживна каша на молоці з бананом і мигдалем. Забезпечує тривале відчуття насичення та заряд енергії на ранок.",
      "ingredients": [
        "Вівсяні пластівці — 80 г",
        "Молоко 2,5% — 200 мл",
        "Банан — 1 шт (120 г)",
        "Мигдаль — 20 г",
        "Мед — 1 ч.л. (10 г)"
      ],
      "kcal": 480,
      "protein_g": 15,
      "fat_g": 14,
      "carbs_g": 72
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Грецький йогурт з ягодами",
      "description": "Легкий білковий перекус із натуральним йогуртом та свіжими або замороженими ягодами. Підтримує рівень енергії між сніданком і обідом.",
      "ingredients": [
        "Грецький йогурт 2% — 150 г",
        "Полуниця або чорниця — 80 г",
        "Насіння чіа — 1 ч.л. (8 г)"
      ],
      "kcal": 175,
      "protein_g": 12,
      "fat_g": 4,
      "carbs_g": 22
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з гречкою та овочевим салатом",
      "description": "Збалансований обід із запеченим курячим філе, розсипчастою гречкою та свіжим салатом із сезонних овочів. Відмінне джерело білка та складних вуглеводів.",
      "ingredients": [
        "Куряче філе — 180 г",
        "Гречана крупа суха — 80 г",
        "Огірок — 100 г",
        "Помідор — 100 г",
        "Листовий салат — 40 г",
        "Оливкова олія — 1 ст.л. (10 мл)",
        "Лимонний сік — 1 ч.л.",
        "Сіль, перець, паприка — за смаком"
      ],
      "kcal": 560,
      "protein_g": 48,
      "fat_g": 13,
      "carbs_g": 58
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Яйце круто з цільнозерновим хлібцем",
      "description": "Простий і поживний перекус із вареним яйцем та хрустким хлібцем. Допомагає втамувати голод перед вечерею.",
      "ingredients": [
        "Яйце куряче — 2 шт",
        "Цільнозерновий хлібець — 2 шт (30 г)",
        "Свіжий огірок — 80 г"
      ],
      "kcal": 210,
      "protein_g": 14,
      "fat_g": 10,
      "carbs_g": 16
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечений лосось з овочами та картоплею",
      "description": "Легка та корисна вечеря із запеченим лососем, броколі та молодою картоплею. Багата на омега-3 жирні кислоти та клітковину.",
      "ingredients": [
        "Філе лосося — 150 г",
        "Броколі — 150 г",
        "Молода картопля — 150 г",
        "Часник — 2 зубчики",
        "Оливкова олія — 1 ч.л. (5 мл)",
        "Лимон — кілька скибочок",
        "Свіжий кріп — за смаком",
        "Сіль, перець — за смаком"
      ],
      "kcal": 480,
      "protein_g": 36,
      "fat_g": 18,
      "carbs_g": 38
    }
  ],
  "totalKcal": 1905,
  "totalProtein_g": 125,
  "totalFat_g": 59,
  "totalCarbs_g": 206,
  "note": "План розраховано на збалансоване харчування близько 1900 ккал на день із розподілом БЖВ приблизно 26% білків, 28% жирів і 46% вуглеводів — це відповідає загальним рекомендаціям здорового харчування. Оскільки список продуктів не вказано, усі інгредієнти є звичайними та доступними. За потреби скоригуй порції відповідно до своєї активності та особистих цілей."
}
````

### day-plan / порожня комора — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ❌ провалив — страв 0 — відмовився планувати

````text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Вівсяна каша з бананом і горіхами",
      "description": "Ситна і поживна каша на молоці з натуральною солодкістю банана та хрусткими волоськими горіхами. Дає тривале відчуття насичення та заряджає енергією на ранок.",
      "ingredients": [
        "Вівсяні пластівці — 80 г",
        "Молоко 2,5% — 200 мл",
        "Банан — 1 шт. (~100 г)",
        "Волоські горіхи — 20 г",
        "Мед — 1 ч. л. (~10 г)"
      ],
      "kcal": 480,
      "protein_g": 14,
      "fat_g": 16,
      "carbs_g": 68
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Грецький йогурт з ягодами",
      "description": "Легкий і білковий перекус із натуральним грецьким йогуртом і свіжими або замороженими ягодами. Підтримує рівень енергії між прийомами їжі.",
      "ingredients": [
        "Грецький йогурт 2% — 150 г",
        "Полуниця або чорниця — 80 г",
        "Насіння чіа — 5 г"
      ],
      "kcal": 180,
      "protein_g": 12,
      "fat_g": 4,
      "carbs_g": 22
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з булгуром і овочами",
      "description": "Збалансована тарілка з запеченим курячим філе, розсипчастим булгуром і тушкованими сезонними овочами. Висококалорійний і білковий прийом їжі для середини дня.",
      "ingredients": [
        "Куряче філе — 180 г",
        "Булгур сухий — 80 г",
        "Броколі — 100 г",
        "Морква — 80 г",
        "Перець болгарський — 70 г",
        "Оливкова олія — 10 мл",
        "Часник, сіль, спеції — за смаком"
      ],
      "kcal": 560,
      "protein_g": 42,
      "fat_g": 12,
      "carbs_g": 62
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Яйце круте з хлібцями і авокадо",
      "description": "Швидкий і поживний перекус із корисними жирами авокадо та якісним білком яйця. Ідеально для другої половини дня.",
      "ingredients": [
        "Яйце куряче варене — 2 шт.",
        "Авокадо — 60 г",
        "Рисові хлібці — 2 шт. (~20 г)",
        "Лимонний сік, сіль — за смаком"
      ],
      "kcal": 260,
      "protein_g": 13,
      "fat_g": 17,
      "carbs_g": 12
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечений лосось з картоплею та салатом",
      "description": "Ніжний запечений лосось із молодою картоплею та свіжим салатом зі шпинату, огірка та помідорів. Легка, але ситна вечеря, багата на омега-3 та клітковину.",
      "ingredients": [
        "Філе лосося — 150 г",
        "Молода картопля — 150 г",
        "Шпинат свіжий — 50 г",
        "Огірок — 80 г",
        "Помідор черрі — 70 г",
        "Оливкова олія — 10 мл",
        "Лимон, сіль, кріп — за смаком"
      ],
      "kcal": 480,
      "protein_g": 34,
      "fat_g": 22,
      "carbs_g": 36
    }
  ],
  "totalKcal": 1960,
  "totalProtein_g": 115,
  "totalFat_g": 71,
  "totalCarbs_g": 200,
  "note": "План розрахований приблизно на 1960 ккал із збалансованим розподілом БЖВ: ~115 г білка, ~71 г жирів, ~200 г вуглеводів. Білок становить близько 23% від загальної калорійності — це хороший показник для підтримки м'язів і насичення. Намагайся випивати 1,5–2 л чистої води протягом дня. Якщо маєш конкретні цілі (схуднення, набір маси, підвищена активність
````

### day-plan / порожня комора — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати порожній `meals` чи `rawText`-прозу. Промпт вимагає збалансований ~2000 ккал план, коли ні комори, ні цілей немає — відмова тут є регресом.

**Суддя:** ✅ пройшов

````text
```json
{
  "meals": [
    {
      "type": "breakfast",
      "label": "Сніданок",
      "name": "Вівсяна каша з бананом і горіхами",
      "description": "Ситний і поживний сніданок на основі вівсянки. Банан додає природну солодкість, а горіхи — корисні жири та хрустку текстуру.",
      "ingredients": [
        "Вівсяні пластівці — 80 г",
        "Молоко 2,5% — 200 мл",
        "Банан — 1 шт (≈120 г)",
        "Волоські горіхи — 20 г",
        "Мед — 1 ч. л. (10 г)"
      ],
      "kcal": 480,
      "protein_g": 14,
      "fat_g": 16,
      "carbs_g": 70
    },
    {
      "type": "snack",
      "label": "Перекус 1",
      "name": "Яблуко з твердим сиром",
      "description": "Легкий перекус, який поєднує клітковину з фрукту та білок і кальцій із сиру. Добре тримає насичення до обіду.",
      "ingredients": [
        "Яблуко — 1 середнє (≈180 г)",
        "Твердий сир (наприклад, Гауда або Едам) — 40 г"
      ],
      "kcal": 210,
      "protein_g": 9,
      "fat_g": 9,
      "carbs_g": 22
    },
    {
      "type": "lunch",
      "label": "Обід",
      "name": "Куряче філе з гречкою та овочевим салатом",
      "description": "Класичний збалансований обід із повноцінним білком, складними вуглеводами і свіжими овочами. Гречка забезпечує тривалу енергію.",
      "ingredients": [
        "Куряче філе (грудка) — 180 г",
        "Гречана крупа (суха) — 80 г",
        "Оливкова олія — 1 ст. л. (10 г)",
        "Помідор — 1 шт (≈120 г)",
        "Огірок — 1 шт (≈120 г)",
        "Листя салату — 40 г",
        "Лимонний сік — 1 ст. л.",
        "Сіль, перець, зелень — за смаком"
      ],
      "kcal": 540,
      "protein_g": 46,
      "fat_g": 13,
      "carbs_g": 58
    },
    {
      "type": "snack",
      "label": "Перекус 2",
      "name": "Грецький йогурт з ягодами",
      "description": "Протеїновий перекус із пробіотиками для підтримки травлення. Ягоди додають антиоксиданти та натуральну солодкість.",
      "ingredients": [
        "Грецький йогурт 2% — 200 г",
        "Заморожені або свіжі ягоди (чорниця, малина) — 80 г"
      ],
      "kcal": 175,
      "protein_g": 14,
      "fat_g": 4,
      "carbs_g": 20
    },
    {
      "type": "dinner",
      "label": "Вечеря",
      "name": "Запечений лосось з броколі та картоплею",
      "description": "Легка, але поживна вечеря з омега-3 жирними кислотами з лосося. Броколі та картопля запікаються разом — мінімум зусиль, максимум смаку.",
      "ingredients": [
        "Філе лосося — 160 г",
        "Броколі — 200 г",
        "Картопля — 150 г",
        "Оливкова олія — 1 ст. л. (10 г)",
        "Часник — 2 зубчики",
        "Лимон — ½ шт",
        "Сіль, перець, розмарин — за смаком"
      ],
      "kcal": 520,
      "protein_g": 36,
      "fat_g": 22,
      "carbs_g": 42
    }
  ],
  "totalKcal": 1925,
  "totalProtein_g": 119,
  "totalFat_g": 64,
  "totalCarbs_g": 212,
  "note": "План розраховано на збалансоване харчування ~1925 ккал із розподілом БЖВ приблизно 25% білків, 30% жирів, 45% вуглеводів. Білок — на гарному рівні для підтримки м'язів і насичення. Рекомендую випивати 1,5–2 л чистої води протягом дня. Якщо є конкретні цілі (схуднення, набір маси, активний спорт) або обмеження в харчуванні — повідом, і я скоригую план."
}
````

````

### week-plan / тиждень із комори — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ❌ провалив — порожній days

```text
stub
````

### week-plan / тиждень із комори — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ❌ провалив — порожній days

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

**Суддя:** ❌ провалив — порожній days

```text
stub
```

### week-plan / тиждень із комори — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

````text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Початок тижня, фокус на білку.",
      "meals": [
        "сніданок — омлет з 3 яєць з морквою, відварений рис",
        "обід — куряче філе, тушковане з морквою, рис",
        "вечеря — куряче філе, запечене, салат з моркви"
      ]
    },
    {
      "label": "Вт",
      "note": "Продовжуємо білкову основу.",
      "meals": [
        "сніданок — варені яйця (3 шт), рис",
        "обід — курячий бульйон з рисом, відварне куряче філе",
        "вечеря — куряче філе, тушковане з морквою"
      ]
    },
    {
      "label": "Ср",
      "note": "День збалансованого харчування.",
      "meals": [
        "сніданок — омлет з 2 яєць, рис",
        "обід — куряче філе, запечене, рис, морква",
        "вечеря — куряче філе, відварне, салат з моркви"
      ]
    },
    {
      "label": "Чт",
      "note": "Акцент на відновлення.",
      "meals": [
        "сніданок — яйця (3 шт) пашот, рис",
        "обід — куряче філе, тушковане, рис",
        "вечеря — куряче філе, запечене"
      ]
    },
    {
      "label": "Пт",
      "note": "Завершення робочого тижня.",
      "meals": [
        "сніданок — омлет з 2 яєць з морквою, рис",
        "обід — курячий бульйон, рис, відварне куряче філе",
        "вечеря — куряче філе, запечене, салат з моркви"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний, більше часу на приготування.",
      "meals": [
        "сніданок — варені яйця (3 шт), рис",
        "обід — куряче філе, запечене з морквою, рис",
        "вечеря — куряче філе, тушковане"
      ]
    },
    {
      "label": "Нд",
      "note": "Відпочинок і підготовка до нового тижня.",
      "meals": [
        "сніданок — омлет з 3 яєць, рис",
        "обід — куряче філе, відварне, рис, морква",
        "вечеря — куряче філе, запечене, салат з моркви"
      ]
    }
  ]
}
````

````

### week-plan / тиждень із комори — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

```text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Старт набору",
      "meals": [
        "Сніданок: омлет з 3 яєць, рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Вт",
      "note": "Продовжуємо",
      "meals": [
        "Сніданок: яйця варені (3 шт), рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Ср",
      "note": "М'ясний день",
      "meals": [
        "Сніданок: омлет з 3 яєць, рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Чт",
      "note": "Повторюємо",
      "meals": [
        "Сніданок: яйця варені (3 шт), рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Пт",
      "note": "Закріплюємо",
      "meals": [
        "Сніданок: омлет з 3 яєць, рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідні",
      "meals": [
        "Сніданок: яйця варені (3 шт), рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    },
    {
      "label": "Нд",
      "note": "Відпочинок",
      "meals": [
        "Сніданок: омлет з 3 яєць, рис",
        "Обід: куряче філе з рисом, морква",
        "Вечеря: куряче філе з рисом"
      ]
    }
  ]
}
````

````

### week-plan / тиждень із комори — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

```text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Початок тижня, акцент на білок та вуглеводи.",
      "meals": [
        "Сніданок: омлет з 3 яєць з тертою морквою, відварений рис",
        "Обід: куряче філе (200г), відварений рис (150г)",
        "Вечеря: куряче філе (150г), салат з моркви з олією"
      ]
    },
    {
      "label": "Вт",
      "note": "Продовжуємо відновлення.",
      "meals": [
        "Сніданок: рис з молоком (якщо є) або водою, 2 варені яйця",
        "Обід: куряче філе (200г), відварена морква",
        "Вечеря: омлет з 3 яєць, невелика порція рису"
      ]
    },
    {
      "label": "Ср",
      "note": "Акцент на різноманіття прийомів їжі.",
      "meals": [
        "Сніданок: 3 варені яйця, рис",
        "Обід: куряче філе (200г) тушковане з морквою, рис",
        "Вечеря: куряче філе (150г), салат з моркви"
      ]
    },
    {
      "label": "Чт",
      "note": "Збалансований день.",
      "meals": [
        "Сніданок: омлет з 3 яєць, невелика порція рису",
        "Обід: куряче філе (200г), відварений рис",
        "Вечеря: відварене куряче філе (150г), морква"
      ]
    },
    {
      "label": "Пт",
      "note": "Завершення робочого тижня.",
      "meals": [
        "Сніданок: 3 варені яйця, рис",
        "Обід: куряче філе (200г) з морквою, рис",
        "Вечеря: омлет з 3 яєць, салат з моркви"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний, приділяємо увагу відновленню.",
      "meals": [
        "Сніданок: рис з яйцем (2 шт.)",
        "Обід: куряче філе (200г), відварений рис",
        "Вечеря: куряче філе (150г), салат з моркви"
      ]
    },
    {
      "label": "Нд",
      "note": "Підготовка до нового тижня.",
      "meals": [
        "Сніданок: омлет з 3 яєць, невелика порція рису",
        "Обід: куряче філе (200г), відварена морква",
        "Вечеря: куряче філе (150г), рис"
      ]
    }
  ]
}
````

````

### week-plan / тиждень із комори — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

```text
{
  "days": [
    {
      "label": "Пн",
      "note": "Старт тижня — акцент на білок зранку",
      "meals": [
        "сніданок — омлет з 3 яєць на соняшниковій олії + варений рис 150 г",
        "обід — куряче філе 200 г смажене + рис 150 г + морква тушкована",
        "вечеря — куряче філе 150 г відварне + рис 100 г + 1 варене яйце"
      ]
    },
    {
      "label": "Вт",
      "note": "Додаємо більше калорій через олію та рис",
      "meals": [
        "сніданок — 3 варені яйця + рис 150 г з олією",
        "обід — куряче філе 200 г запечене + морква 100 г запечена з олією + рис 150 г",
        "вечеря — курячий бульйон з філе 150 г + рис 100 г"
      ]
    },
    {
      "label": "Ср",
      "note": "Середина тижня — підтримуємо ритм",
      "meals": [
        "сніданок — яєчня з 3 яєць з морквою на олії + рис 150 г",
        "обід — куряче філе 200 г + рис 200 г + морква відварна",
        "вечеря — куряче філе 150 г + 2 варені яйця + морква сира"
      ]
    },
    {
      "label": "Чт",
      "note": "Збільшуємо порцію рису — додаткові вуглеводи для енергії",
      "meals": [
        "сніданок — омлет з 4 яєць на олії + рис 200 г",
        "обід — куряче філе 250 г смажене + рис 150 г + морква тушкована з олією",
        "вечеря — куряче філе 150 г відварне + рис 100 г"
      ]
    },
    {
      "label": "Пт",
      "note": "Наближаємося до вихідних — тримаємо баланс",
      "meals": [
        "сніданок — 3 варені яйця + рис 150 г з олією + морква сира",
        "обід — куряче філе 200 г запечене з морквою + рис 150 г",
        "вечеря — яєчня 2 яйця + куряче філе 100 г + рис 100 г"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний — більше їжі, якщо є тренування",
      "meals": [
        "сніданок — омлет з 4 яєць з морквою на олії + рис 200 г",
        "обід — куряче філе 250 г смажене + рис 200 г + морква тушкована",
        "вечеря — куряче філе 200 г відварне + рис 150 г + 1 варене яйце"
      ]
    },
    {
      "label": "Нд",
      "note": "День відновлення — легше, але без дефіциту білка",
      "meals": [
        "сніданок — 3 варені яйця + рис 150 г",
        "обід — куряче філе 200 г + морква запечена з олією + рис 150 г",
        "вечеря — куряче філе 150 г + рис 100 г + морква сира"
      ]
    }
  ]
}
````

### week-plan / тиждень із комори — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

```text
{
  "days": [
    {
      "label": "Пн",
      "note": "Старт тижня — акцент на білку зранку",
      "meals": [
        "сніданок — омлет з 3 яєць на соняшниковій олії + відварений рис 150 г",
        "обід — варене куряче філе 200 г + рис 150 г + відварена морква",
        "вечеря — куряче філе смажене 150 г + рис 100 г + 2 варені яйця"
      ]
    },
    {
      "label": "Вт",
      "note": "Додаємо калорійності через яйця та олію",
      "meals": [
        "сніданок — 3 варені яйця + рис 150 г з олією",
        "обід — куряче філе тушковане з морквою 200 г + рис 150 г",
        "вечеря — смажене куряче філе 180 г + рис 100 г + морква відварена"
      ]
    },
    {
      "label": "Ср",
      "note": "Рекомендую купити грецький йогурт або сир — зараз недобираєш молочного білка",
      "meals": [
        "сніданок — яєчня з 3 яєць + рис 120 г",
        "обід — куряче філе варене 200 г + рис 150 г + морква тушкована в олії",
        "вечеря — куряче філе 150 г + 2 яйця варені + рис 100 г"
      ]
    },
    {
      "label": "Чт",
      "note": "Середина тижня — тримай рівень калорій",
      "meals": [
        "сніданок — омлет з 3 яєць з тертою морквою на олії + рис 130 г",
        "обід — курячий суп з рисом і морквою (філе 180 г, рис 100 г)",
        "вечеря — смажене філе 170 г + рис 120 г"
      ]
    },
    {
      "label": "Пт",
      "note": "Можна додати хліб або макарони — рис не єдине джерело вуглеводів",
      "meals": [
        "сніданок — 3 варені яйця + рис 150 г з олією",
        "обід — куряче філе запечене в олії 200 г + рис 150 г + морква тушкована",
        "вечеря — філе варене 150 г + рис 100 г + 1 яйце"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний — більше часу готувати, роби порції більшими",
      "meals": [
        "сніданок — омлет з 4 яєць з морквою на олії + рис 160 г",
        "обід — куряче філе тушковане з морквою і рисом (філе 220 г, рис 160 г)",
        "вечеря — смажене куряче філе 180 г + 2 варені яйця + рис 120 г"
      ]
    },
    {
      "label": "Нд",
      "note": "Завершення тижня — оціни самопочуття і підготуй список продуктів у Комору",
      "meals": [
        "сніданок — 3 яйця варені + рис 150 г з олією",
        "обід — курячий бульйон з рисом і морквою + філе 200 г окремо",
        "вечеря — смажене філе 160 г + рис 130 г + морква відварена"
      ]
    }
  ]
}
```

### week-plan / тиждень із комори — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) віддати список покупок — прод його викидає, а користувач генерує окремо у «Коморі»; (б) більше 7 днів — `normalizeWeekPlan` мовчки обріже, і план стане неповним.

**Суддя:** ✅ пройшов

```text
{
  "days": [
    {
      "label": "Пн",
      "note": "Старт тижня — акцент на білок зранку",
      "meals": [
        "сніданок — омлет із 3 яєць на соняшниковій олії + варений рис 150 г",
        "обід — відварене куряче філе 200 г + рис 150 г + тушкована морква з олією",
        "вечеря — куряче філе на сковороді 180 г + рис 100 г"
      ]
    },
    {
      "label": "Вт",
      "note": "Додаємо калорій через олію — недобір жирів гальмує набір маси",
      "meals": [
        "сніданок — 3 варених яйця + рис 150 г з чайною ложкою олії",
        "обід — куряче філе тушковане з морквою та олією 200 г + рис 200 г",
        "вечеря — смажене куряче філе 180 г + морква варена"
      ]
    },
    {
      "label": "Ср",
      "note": "Середина тижня — збільш порцію рису, якщо тренувався",
      "meals": [
        "сніданок — яєчня з 3 яєць на олії + рис 150 г",
        "обід — куряче філе запечене 200 г + рис 200 г + морква тушкована",
        "вечеря — відварене куряче філе 150 г + рис 150 г"
      ]
    },
    {
      "label": "Чт",
      "note": "Гарний день для щільного обіду",
      "meals": [
        "сніданок — 4 варених яйця + рис 150 г з олією",
        "обід — курячий рис із морквою та олією (все разом) — 400 г готового",
        "вечеря — куряче філе смажене 180 г + рис 100 г"
      ]
    },
    {
      "label": "Пт",
      "note": "Кінець робочого тижня — не пропускай вечерю",
      "meals": [
        "сніданок — омлет із 3 яєць + рис 150 г",
        "обід — куряче філе відварене 200 г + рис 200 г + морква з олією",
        "вечеря — куряче філе 180 г + рис 150 г + 1 яйце варене"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний — готуй більше за раз, щоб не пропускати прийоми їжі",
      "meals": [
        "сніданок — рисова каша на воді 200 г + 3 яйця смажені на олії",
        "обід — куряче філе з рисом і тушкованою морквою 450 г готового",
        "вечеря — куряче філе запечене 200 г + рис 150 г"
      ]
    },
    {
      "label": "Нд",
      "note": "Завершення тижня — підбий, чи вистачало білка щодня",
      "meals": [
        "сніданок — 4 варених яйця + рис 150 г з олією",
        "обід — куряче філе тушковане з морквою 200 г + рис 200 г",
        "вечеря — куряче філе 180 г + рис 100 г + 1 яйце варене"
      ]
    }
  ]
}
```

### week-plan / комора порожня — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ❌ провалив — днів 0 — відмовився планувати

```text
stub
```

### week-plan / комора порожня — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ❌ провалив — днів 0 — відмовився планувати

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

**Суддя:** ❌ провалив — днів 0 — відмовився планувати

```text
stub
```

### week-plan / комора порожня — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

````text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Збалансований початок тижня",
      "meals": [
        "Сніданок: вівсянка на молоці з ягодами та горіхами",
        "Обід: курячий суп з овочами, цільнозерновий хліб",
        "Вечеря: запечена риба з броколі та кіноа"
      ]
    },
    {
      "label": "Вт",
      "note": "Енергія для активного дня",
      "meals": [
        "Сніданок: омлет з овочами та сиром, скибочка авокадо",
        "Обід: гречка з тушкованою яловичиною та салатом зі свіжих овочів",
        "Вечеря: сочевичний суп-пюре, цільнозернові хлібці"
      ]
    },
    {
      "label": "Ср",
      "note": "Легкий середи",
      "meals": [
        "Сніданок: йогурт без добавок з фруктами та насінням чіа",
        "Обід: салат з тунцем, вареним яйцем, огірками та зеленню, заправлений оливковою олією",
        "Вечеря: овочеве рагу з квасолею"
      ]
    },
    {
      "label": "Чт",
      "note": "Насичений білком",
      "meals": [
        "Сніданок: сирники з натуральним йогуртом",
        "Обід: індича грудка, запечена з травами, з гарніром з булгуру та тушкованих овочів",
        "Вечеря: крем-суп з шампіньйонів, шматочок цільнозернового хліба"
      ]
    },
    {
      "label": "Пт",
      "note": "Приємний початок вихідних",
      "meals": [
        "Сніданок: млинці з сиром та сухофруктами",
        "Обід: рисова локшина з куркою та овочами у стилі азіатської кухні",
        "Вечеря: запечений лосось з спаржею"
      ]
    },
    {
      "label": "Сб",
      "note": "Відпочинок та смак",
      "meals": [
        "Сніданок: великий фруктовий салат з медом та м'ятою",
        "Обід: домашні пельмені або вареники з картоплею та грибами",
        "Вечеря: легкий салат з моцарелою, томатами та базиліком"
      ]
    },
    {
      "label": "Нд",
      "note": "Завершення тижня",
      "meals": [
        "Сніданок: круасан з фруктовим джемом та склянка молока",
        "Обід: запечена курка з картоплею та морквою",
        "Вечеря: кефір з висівками"
      ]
    }
  ]
}
````

````

### week-plan / комора порожня — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

```text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Збалансований початок тижня",
      "meals": [
        "Сніданок: вівсянка на молоці з ягодами та горіхами",
        "Обід: куряче філе, запечене з овочами (броколі, перець, морква)",
        "Вечеря: салат з тунцем, яйцем та зеленню"
      ]
    },
    {
      "label": "Вт",
      "note": "Насичений білком",
      "meals": [
        "Сніданок: омлет з сиром та шпинатом",
        "Обід: суп-пюре з сочевиці, цільнозерновий хліб",
        "Вечеря: риба (наприклад, лосось) на пару з гарніром з кіноа"
      ]
    },
    {
      "label": "Ср",
      "note": "Овочевий день",
      "meals": [
        "Сніданок: йогурт з фруктами та насінням чіа",
        "Обід: овочеве рагу з квасолею",
        "Вечеря: гречана каша з грибами"
      ]
    },
    {
      "label": "Чт",
      "note": "Енергетичний заряд",
      "meals": [
        "Сніданок: сирники зі сметаною та фруктами",
        "Обід: індичка, тушкована з овочами",
        "Вечеря: салат з куркою, авокадо та зеленню"
      ]
    },
    {
      "label": "Пт",
      "note": "Легкий старт вихідних",
      "meals": [
        "Сніданок: фруктовий смузі з білком (протеїн)",
        "Обід: рибний суп",
        "Вечеря: паста з морепродуктами"
      ]
    },
    {
      "label": "Сб",
      "note": "Відпочинок та смак",
      "meals": [
        "Сніданок: млинці з ягодами",
        "Обід: домашній бургер з цільнозерновою булочкою та овочами",
        "Вечеря: запечена курка з картоплею"
      ]
    },
    {
      "label": "Нд",
      "note": "Підготовка до нового тижня",
      "meals": [
        "Сніданок: вівсянка з фруктами",
        "Обід: овочевий суп, салат",
        "Вечеря: легкий овочевий салат з додаванням білка (яйце, сир)"
      ]
    }
  ]
}
````

````

### week-plan / комора порожня — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

```text
```json
{
  "days": [
    {
      "label": "Пн",
      "note": "Початок тижня, фокус на білок",
      "meals": [
        "Сніданок: Яєчня з двох яєць з помідорами та зеленню",
        "Обід: Куряча грудка, запечена з овочами (броколі, морква)",
        "Вечеря: Риба (наприклад, лосось) на пару з салатом з огірків та авокадо"
      ]
    },
    {
      "label": "Вт",
      "note": "Різноманітність білків",
      "meals": [
        "Сніданок: Грецький йогурт з ягодами та жменькою горіхів",
        "Обід: Яловичий стейк з гарніром з кіноа",
        "Вечеря: Сочевичний суп з цільнозерновим хлібом"
      ]
    },
    {
      "label": "Ср",
      "note": "Легкий день",
      "meals": [
        "Сніданок: Вівсянка на воді з фруктами",
        "Обід: Салат з тунцем, зеленню та яйцем",
        "Вечеря: Омлет з грибами та шпинатом"
      ]
    },
    {
      "label": "Чт",
      "note": "Повернення до білків",
      "meals": [
        "Сніданок: Сир кисломолочний з медом та родзинками",
        "Обід: Індича грудка, тушкована з овочами",
        "Вечеря: Запечена тріска з лимоном та зеленню"
      ]
    },
    {
      "label": "Пт",
      "note": "Риба та складні вуглеводи",
      "meals": [
        "Сніданок: Яйця пашот на цільнозерновому тості з авокадо",
        "Обід: Форель, запечена з картоплею",
        "Вечеря: Хумус з овочевими паличками (морква, селера, перець)"
      ]
    },
    {
      "label": "Сб",
      "note": "Вихідний, можна побалуватись",
      "meals": [
        "Сніданок: Панкейки з цільнозернового борошна з фруктовим пюре",
        "Обід: Курка-гриль з овочевим салатом",
        "Вечеря: Бурий рис з овочами та тофу"
      ]
    },
    {
      "label": "Нд",
      "note": "Завершення тижня, спокійний прийом їжі",
      "meals": [
        "Сніданок: Фруктовий смузі з додаванням протеїну (за бажанням)",
        "Обід: Борщ з яловичиною",
        "Вечеря: Салат з куркою, овочами та легким йогуртовим заправленням"
      ]
    }
  ]
}
````

````

### week-plan / комора порожня — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

```text
{"days":[{"label":"Пн","note":"Старт тижня — простий і збалансований день","meals":["сніданок — вівсяна каша на молоці з бананом та медом","обід — курячий суп з овочами та картоплею, хліб","вечеря — тушкована куряча грудка з гречкою та свіжим огірком"]},{"label":"Вт","note":"Більше овочів у раціоні","meals":["сніданок — яєчня з двох яєць з помідором, хліб з маслом, чай","обід — борщ з квасолею, сметана, хліб","вечеря — запечена риба (хек або тріска) з вареною картоплею та салатом з капусти"]},{"label":"Ср","note":"Середина тижня — акцент на білку","meals":["сніданок — сир кисломолочний з медом або варенням, хліб","обід — гречка з тушкованою яловичиною та морквою і цибулею","вечеря — омлет з двох яєць з грибами, хліб, чай"]},{"label":"Чт","note":"Різноманітність — бобові як джерело білка","meals":["сніданок — тости з хліба з яйцем пашот та помідором","обід — суп-пюре з сочевиці з цибулею та морквою, хліб","вечеря — куряче філе на сковороді з рисом та тушкованими кабачками"]},{"label":"Пт","note":"Легший день перед вихідними","meals":["сніданок — йогурт натуральний з вівсяними пластівцями та яблуком","обід — макарони з томатним соусом та фаршем (паста болоньєзе), салат","вечеря — запечена риба з овочами (морква, цибуля, болгарський перець)"]},{"label":"Сб","note":"Вихідний — більше часу на готування","meals":["сніданок — млинці на молоці з сиром або варенням","обід — домашній борщ зі свининою, сметана, хліб","вечеря — запечена картопля з куркою та часником, салат зі свіжих овочів"]},{"label":"Нд","note":"Завершення тижня — комфортна їжа","meals":["сніданок — тости з хліба з вершковим сиром та огірком, яйце варене, чай або кава","обід — курячий бульйон з локшиною та зеленню, хліб","вечеря — котлети з яловичого або курячого фаршу з пюре з картоплі та тушкованою капустою"]}]}
````

### week-plan / комора порожня — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

```text
{"days":[{"label":"Пн","note":"Легкий старт тижня, збалансовано","meals":["сніданок — вівсянка на молоці з бананом та медом","обід — курячий суп з овочами та картоплею, хліб","вечеря — запечена куряча грудка з тушкованою капустою та гречкою"]},{"label":"Вт","note":"Більше білка в середині дня","meals":["сніданок — яєчня з двох яєць, тост з маслом, чай","обід — тушкована яловичина з рисом та морквою","вечеря — сирна запіканка з ягодами або джемом"]},{"label":"Ср","note":"Рибний день — омега-3","meals":["сніданок — йогурт з мюслі та яблуком","обід — запечена риба (хек або минтай) з картопляним пюре та салатом з огірків","вечеря — овочевий омлет з сиром, хліб"]},{"label":"Чт","note":"Акцент на складних вуглеводах","meals":["сніданок — гречана каша на воді з маслом та яйцем зварене","обід — курячі котлети з макаронами та тушкованими помідорами","вечеря — сочевичний суп з морквою та цибулею, хліб"]},{"label":"Пт","note":"Легше до кінця тижня","meals":["сніданок — тости з яйцем пашот та авокадо або огірком","обід — запечена картопля з куркою та сметаною, свіжі овочі","вечеря — рисова каша з молоком та родзинками або медом"]},{"label":"Сб","note":"Вихідний — є час приготувати щось смачніше","meals":["сніданок — млинці з сиром або джемом, чай або кава","обід — борщ з квасолею та пампушками","вечеря — запечені овочі (кабачок, перець, морква) з філе риби або м'яса"]},{"label":"Нд","note":"Підготовка до нового тижня, легко і ситно","meals":["сніданок — омлет з овочами та сиром, хліб","обід — курячий плов з морквою та цибулею","вечеря — кефір або йогурт, тост з арахісовою пастою або сиром"]}]}
```

### week-plan / комора порожня — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: відмовитись планувати («немає продуктів»). Промпт дозволяє базові допущення; порожній `days` доїжджає до UI як порожній екран.

**Суддя:** ✅ пройшов

```text
{"days":[{"label":"Пн","note":"Легкий старт тижня, акцент на складних вуглеводах і білку","meals":["Сніданок — вівсянка на молоці з бананом і ложкою арахісової пасти","Обід — куряча грудка з гречкою і свіжим огірком","Вечеря — омлет з двох яєць з помідором і цільнозерновим хлібом"]},{"label":"Вт","note":"Більше овочів, підтримка балансу","meals":["Сніданок — яєчня з двох яєць з помідором і тостом","Обід — суп-пюре з броколі та картоплі, шматок житнього хліба","Вечеря — запечена риба (хек або минтай) з відвареним рисом і салатом з капусти"]},{"label":"Ср","note":"Середина тижня — підзарядка енергією","meals":["Сніданок — сирники з знежиреного сиру зі сметаною","Обід — макарони з м'ясним фаршем і томатним соусом, салат","Вечеря — тушкована куряча гомілка з тушкованими кабачками"]},{"label":"Чт","note":"Легший день для травлення","meals":["Сніданок — натуральний йогурт з вівсянкою та яблуком","Обід — борщ з пісним м'ясом, шматок хліба","Вечеря — відварена квасоля з тушкованими овочами (цибуля, морква, перець)"]},{"label":"Пт","note":"Готуємось до вихідних, трохи різноманітніше","meals":["Сніданок — тости з авокадо і яйцем пашот","Обід — курячий бульйон з вермішеллю і варене яйце","Вечеря — запечений лосось або оселедець з відвареною картоплею та зеленню"]},{"label":"Сб","note":"Вихідний — є час готувати повноцінніше","meals":["Сніданок — млинці на кефірі з медом або джемом","Обід — домашні котлети з індички з гречаним гарніром і салатом із буряка","Вечеря — піца на цільнозерновому тісті з моцарелою, помідорами і базиліком"]},{"label":"Нд","note":"Плавне завершення тижня, підготовка до нового","meals":["Сніданок — яєчня з беконом або шинкою, цільнозерновий тост","Обід — запечена картопля з куркою і грибами у сметані","Вечеря — легкий овочевий суп з сочевицею, шматок житнього хліба"]}]}
```

### shopping-list / виключити наявне в коморі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив — порожній список

```text
stub
```

### shopping-list / виключити наявне в коморі — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив — порожній список

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

**Суддя:** ❌ провалив — порожній список

```text
stub
```

### shopping-list / виключити наявне в коморі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив — вже в коморі: олія

````text
```json
{
  "categories": [
    {
      "name": "Молочні продукти",
      "items": [
        {
          "name": "молоко",
          "quantity": "400 мл",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "цукор",
          "quantity": "1 порція",
          "note": ""
        },
        {
          "name": "сіль",
          "quantity": "1 порція",
          "note": ""
        }
      ]
    },
    {
      "name": "Олії та жири",
      "items": [
        {
          "name": "олія",
          "quantity": "1 порція",
          "note": ""
        }
      ]
    }
  ]
}
````

````

### shopping-list / виключити наявне в коморі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ✅ пройшов

```text
```json
{
  "categories": [
    {
      "name": "Молочні продукти",
      "items": [
        { "name": "Молоко", "quantity": "400 мл", "note": "" }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        { "name": "Сіль", "quantity": "за смаком", "note": "" },
        { "name": "Цукор", "quantity": "за смаком", "note": "" }
      ]
    }
  ]
}
````

````

### shopping-list / виключити наявне в коморі — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив — вже в коморі: куряче філе, морква, рис

```text
```json
{
  "categories": [
    {
      "name": "М'ясо та риба",
      "items": [
        {
          "name": "куряче філе",
          "quantity": "400 г",
          "note": ""
        }
      ]
    },
    {
      "name": "Молочні продукти",
      "items": [
        {
          "name": "молоко",
          "quantity": "400 мл",
          "note": ""
        }
      ]
    },
    {
      "name": "Овочі та гриби",
      "items": [
        {
          "name": "морква",
          "quantity": "2 шт",
          "note": ""
        }
      ]
    },
    {
      "name": "Крупи та злаки",
      "items": [
        {
          "name": "рис",
          "quantity": "350 г",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "сіль",
          "quantity": "1",
          "note": "за смаком"
        }
      ]
    },
    {
      "name": "Інше",
      "items": [
        {
          "name": "цукор",
          "quantity": "1",
          "note": "за смаком"
        }
      ]
    }
  ]
}
````

````

### shopping-list / виключити наявне в коморі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ✅ пройшов

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]}]}
````

### shopping-list / виключити наявне в коморі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ❌ провалив — порожній список

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},"items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}

Wait, let me recount and fix the JSON.

{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},{"name":"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}
```

### shopping-list / виключити наявне в коморі — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: включити рис, яйця чи моркву — вони вже в коморі, і промпт прямо каже їх ВИКЛЮЧАТИ. Купити вдруге те, що є вдома, — найдорожча з помилок цього шляху.

**Суддя:** ✅ пройшов

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для рисової каші"}]},{"name":"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}
```

### shopping-list / дублікат між рецептами — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив — молоко 0 раз(и):

```text
stub
```

### shopping-list / дублікат між рецептами — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив — молоко 0 раз(и):

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

**Суддя:** ❌ провалив — молоко 0 раз(и):

```text
stub
```

### shopping-list / дублікат між рецептами — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ✅ пройшов

````text
```json
{
  "categories": [
    {
      "name": "Молочні продукти",
      "items": [
        {
          "name": "молоко",
          "quantity": "400 мл",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "сіль",
          "quantity": "за смаком",
          "note": ""
        },
        {
          "name": "цукор",
          "quantity": "за смаком",
          "note": ""
        }
      ]
    },
    {
      "name": "Інше",
      "items": [
        {
          "name": "олія",
          "quantity": "для смаження",
          "note": "не соняшникова"
        }
      ]
    }
  ]
}
````

````

### shopping-list / дублікат між рецептами — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ✅ пройшов

```text
```json
{
  "categories": [
    {
      "name": "Молочні продукти",
      "items": [
        {
          "name": "молоко",
          "quantity": "400 мл",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "цукор",
          "quantity": "1 уп",
          "note": ""
        },
        {
          "name": "сіль",
          "quantity": "1 уп",
          "note": ""
        }
      ]
    },
    {
      "name": "Олії та жири",
      "items": [
        {
          "name": "олія",
          "quantity": "1 пляшка",
          "note": "для смаження"
        }
      ]
    }
  ]
}
````

````

### shopping-list / дублікат між рецептами — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ✅ пройшов

```text
```json
{
  "categories": [
    {
      "name": "Молочні продукти",
      "items": [
        {
          "name": "молоко",
          "quantity": "400 мл",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "цукор",
          "quantity": "1 пачка",
          "note": "не вказано кількість, взяти стандартну упаковку"
        }
      ]
    }
  ]
}
````

````

### shopping-list / дублікат між рецептами — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив — молоко 0 раз(и):

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}

Wait, let me recount and fix the JSON.

{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},{"name":"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}
````

### shopping-list / дублікат між рецептами — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ❌ провалив — молоко 0 раз(и):

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},"Інше":{"name":"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}

Wait, let me fix the JSON structure.

{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]},{"name":"Інше","items":[{"name":"Цукор","quantity":"за смаком","note":"для рисової каші"}]}]}
```

### shopping-list / дублікат між рецептами — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: два окремі пункти «молоко». Воно є в двох рецептах, і промпт вимагає об'єднати в один із підсумованою кількістю.

**Суддя:** ✅ пройшов

```text
{"categories":[{"name":"Молочні продукти","items":[{"name":"Молоко","quantity":"400 мл","note":"100 мл для омлету + 300 мл для каші"}]}]}
```

### shopping-list / усе вже є вдома — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив — нема поля categories

```text
stub
```

### shopping-list / усе вже є вдома — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив — нема поля categories

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

**Суддя:** ❌ провалив — нема поля categories

```text
stub
```

### shopping-list / усе вже є вдома — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив — вигадано: яйця, сіль

````text
```json
{
  "categories": [
    {
      "name": "Яйця",
      "items": [
        {
          "name": "яйця",
          "quantity": "3 шт",
          "note": ""
        }
      ]
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "сіль",
          "quantity": "1 дрібка",
          "note": ""
        }
      ]
    }
  ]
}
````

````

### shopping-list / усе вже є вдома — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив — вигадано: сіль

```text
```json
{
  "categories": [
    {
      "name": "Яйця",
      "items": []
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "сіль",
          "quantity": "1 пачка",
          "note": ""
        }
      ]
    }
  ]
}
````

````

### shopping-list / усе вже є вдома — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ❌ провалив — вигадано: сіль

```text
```json
{
  "categories": [
    {
      "name": "Яйця",
      "items": []
    },
    {
      "name": "Приправи та соуси",
      "items": [
        {
          "name": "Сіль",
          "quantity": "1 пачка",
          "note": ""
        }
      ]
    }
  ]
}
````

````

### shopping-list / усе вже є вдома — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ✅ пройшов

```text
{"categories":[]}
````

### shopping-list / усе вже є вдома — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ✅ пройшов

```text
{"categories":[]}
```

### shopping-list / усе вже є вдома — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: вигадати позиції, щоб список не був порожнім. Промпт прямо дозволяє порожній `categories` — вигаданий пункт тут гірший за порожній екран.

**Суддя:** ✅ пройшов

```text
{"categories":[]}
```

### recommend-recipes / pantryMode=only — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

```text
stub
```

### recommend-recipes / pantryMode=only — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

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

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

```text
stub
```

### recommend-recipes / pantryMode=only — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

````text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Відваріть рис згідно інструкції на пакуванні.",
        "Наріжте куряче філе кубиками.",
        "Натріть моркву на грубій тертці.",
        "Обсмажте курку на розігрітій сковороді з олією до золотистої скоринки.",
        "Додайте моркву до курки і тушкуйте 5-7 хвилин.",
        "Подавайте куряче філе з рисом."
      ],
      "tips": [
        "Для кращого смаку додайте сіль та перець до смаку.",
        "Не пересмажте курку, щоб вона залишилася соковитою.",
        "Рис можна готувати на воді або бульйоні (якщо є).",
        "Смажте на середньому вогні."
      ],
      "macros": {
        "kcal": 850,
        "protein_g": 60,
        "fat_g": 25,
        "carbs_g": 90
      }
    },
    {
      "title": "Яєчня з відвареним рисом",
      "timeMinutes": 15,
      "servings": 2,
      "ingredients": [
        "яйця",
        "рис",
        "олія соняшникова"
      ],
      "steps": [
        "Відваріть рис згідно інструкції на пакуванні.",
        "Розігрійте сковороду з олією.",
        "Розбийте яйця на сковороду, формуючи яєчню.",
        "Смажте до бажаного ступеня готовності.",
        "Подавайте яєчню з відвареним рисом."
      ],
      "tips": [
        "Додайте сіль та перець до яєць.",
        "Можна додати дрібно нарізану моркву до яєчні за бажанням.",
        "Смажте на помірному вогні.",
        "Готуйте під кришкою для більш ніжної консистенції."
      ],
      "macros": {
        "kcal": 600,
        "protein_g": 30,
        "fat_g": 35,
        "carbs_g": 40
      }
    },
    {
      "title": "Куряче філе, тушковане з морквою",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Наріжте куряче філе великими шматками.",
        "Натріть моркву на грубій тертці.",
        "Розігрійте олію в каструлі або глибокій сковороді.",
        "Обсмажте курку до легкої скоринки.",
        "Додайте моркву, перемішайте.",
        "Додайте трохи води (приблизно 100 мл), сіль, перець, накрийте кришкою і тушкуйте на повільному вогні 15-20 хвилин до готовності курки."
      ],
      "tips": [
        "Не додавайте забагато води, щоб страва не стала водянистою.",
        "Тушкуйте на дуже повільному вогні, щоб курка залишалася ніжною.",
        "Перевіряйте готовність курки, проколюючи найтовстіший шматок.",
        "Подавайте гарячим."
      ],
      "macros": {
        "kcal": 500,
        "protein_g": 55,
        "fat_g": 25,
        "carbs_g": 15
      }
    }
  ]
}
````

````

### recommend-recipes / pantryMode=only — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе - 400 г",
        "рис - 200 г",
        "морква - 2 шт",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Промити рис, відварити до готовності.",
        "Нарізати куряче філе кубиками.",
        "Натерти моркву на тертці.",
        "Розігріти олію на пательні.",
        "Обсмажити курку до золотистої скоринки.",
        "Додати моркву, смажити ще 5-7 хвилин.",
        "Подавати курку з морквою та рисом."
      ],
      "tips": [
        "Для більш насиченого смаку можна додати улюблені спеції до курки.",
        "Рис можна відварити заздалегідь.",
        "Не пересмажуйте моркву, щоб зберегти її хрусткість.",
        "Подавати гарячим."
      ],
      "macros": {
        "kcal": 650,
        "protein_g": 50,
        "fat_g": 25,
        "carbs_g": 55
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе - 300 г",
        "яйця - 2 шт",
        "рис - 150 г",
        "морква - 1 шт",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відварити рис до напівготовності.",
        "Пропустити куряче філе через м'ясорубку або подрібнити в блендері.",
        "Натерти моркву на дрібній тертці.",
        "Змішати фарш, яйця, рис, моркву, сіль і перець.",
        "Сформувати котлети.",
        "Обсмажити котлети на розігрітій олії до готовності з обох боків.",
        "Подавати з відвареним рисом."
      ],
      "tips": [
        "До фаршу можна додати дрібно нарізану цибулю (якщо є).",
        "Щоб котлети були ніжнішими, фарш можна збити.",
        "Смажити на середньому вогні.",
        "Готовність перевіряти, проткнувши котлету."
      ],
      "macros": {
        "kcal": 600,
        "protein_g": 45,
        "fat_g": 28,
        "carbs_g": 40
      }
    },
    {
      "title": "Омлет з куркою та рисом",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "яйця - 6 шт",
        "куряче філе - 200 г",
        "рис - 100 г",
        "морква - 1 шт",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відварити рис.",
        "Нарізати куряче філе дрібними кубиками.",
        "Натерти моркву.",
        "Обсмажити курку з морквою на олії до готовності.",
        "Збити яйця з сіллю та перцем.",
        "Вилити яєчну суміш на пательню з куркою та рисом.",
        "Готувати під кришкою до готовності омлету."
      ],
      "tips": [
        "Можна додати тертий сир (якщо є) для більш насиченого смаку.",
        "Смажити на повільному вогні, щоб омлет не підгорів.",
        "Подавати одразу після приготування.",
        "Можна прикрасити зеленню (якщо є)."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 40,
        "fat_g": 30,
        "carbs_g": 30
      }
    }
  ]
}
````

````

### recommend-recipes / pantryMode=only — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "яйця"
      ],
      "steps": [
        "Відварити рис до готовності.",
        "Нарізати куряче філе кубиками, посолити, поперчити.",
        "Натерти моркву на крупній тертці.",
        "Обсмажити курку на розігрітій соняшниковій олії до золотистої скоринки.",
        "Додати моркву до курки, тушкувати 5-7 хвилин.",
        "Відварити яйця круто.",
        "Подавати курку з морквою, гарніруючи рисом та половинками яєць."
      ],
      "tips": [
        "Для більш насиченого смаку можна додати улюблені спеції до курки.",
        "Рис можна відварити заздалегідь.",
        "Яйця можна подати як варені, так і приготувати з них омлет.",
        "Контролюйте ступінь просмаження курки, щоб уникнути пересушування."
      ],
      "macros": {
        "kcal": 750,
        "protein_g": 65,
        "fat_g": 25,
        "carbs_g": 60
      }
    },
    {
      "title": "Рисовий пудинг з куркою та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "рис",
        "куряче філе",
        "морква",
        "яйця",
        "олія соняшникова"
      ],
      "steps": [
        "Відварити рис до напівготовності.",
        "Куряче філе нарізати дрібними кубиками.",
        "Моркву натерти на дрібній тертці.",
        "Яйця збити з невеликою кількістю солі.",
        "На пательні з олією обсмажити курку з морквою до м'якості.",
        "Змішати напівготовий рис з обсмаженою куркою та морквою.",
        "Додати збиті яйця, перемішати і готувати ще 5-7 хвилин на повільному вогні, доки пудинг не загусне."
      ],
      "tips": [
        "Слідкуйте за консистенцією, додаючи трохи води, якщо суміш занадто густа.",
        "Можна додати дрібку цукру для солодкого відтінку, якщо бажано.",
        "Пудинг виходить більш ніжним, якщо готувати під кришкою.",
        "Подавати теплим."
      ],
      "macros": {
        "kcal": 680,
        "protein_g": 55,
        "fat_g": 22,
        "carbs_g": 65
      }
    },
    {
      "title": "Омлет з куркою та овочами",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "яйця",
        "куряче філе",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Куряче філе нарізати дрібними шматочками.",
        "Моркву натерти на дрібній тертці.",
        "Яйця збити з сіллю та перцем.",
        "На пательні з олією обсмажити курку до готовності.",
        "Додати моркву до курки, тушкувати 3-5 хвилин.",
        "Залити суміш з курки та моркви збитими яйцями.",
        "Готувати під кришкою на повільному вогні до готовності омлету."
      ],
      "tips": [
        "Для кращого смаку можна додати трохи молока, якщо воно є.",
        "Не пересмажуйте омлет, щоб він залишався ніжним.",
        "Можна подавати з відвареним рисом як окрему страву.",
        "Використовуйте антипригарну пательню для кращого результату."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 45,
        "fat_g": 30,
        "carbs_g": 20
      }
    }
  ]
}
````

````

### recommend-recipes / pantryMode=only — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г",
        "морква — 1 шт",
        "олія соняшникова — 2 ст. л."
      ],
      "steps": [
        "Рис промий, залий 300 мл води, вари 18 хв на малому вогні під кришкою.",
        "Філе наріж кубиками 3–4 см, посоли, поперчи.",
        "Моркву натри на крупній тертці.",
        "Розігрій олію на сковороді, обсмажуй філе 7 хв на середньому вогні до золотистої скоринки.",
        "Додай моркву, смаж іще 5 хв, помішуючи.",
        "Подавай філе з морквою поверх рису."
      ],
      "tips": [
        "Внутрішня температура курки — мінімум 74 °C.",
        "Сіль, перець, олія — базові припущення.",
        "Рис промивай до прозорої води — буде розсипчастим.",
        "Для набору маси збільш порцію рису до 200 г."
      ],
      "macros": {
        "kcal": 560,
        "protein_g": 52,
        "fat_g": 14,
        "carbs_g": 54
      }
    },
    {
      "title": "Омлет з куркою і морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "куряче філе — 250 г",
        "яйця — 4 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст. л."
      ],
      "steps": [
        "Філе дрібно наріж, посоли, поперчи.",
        "Моркву натри на тертці.",
        "Обсмажуй філе на олії 6–7 хв до готовності.",
        "Додай моркву, смаж 3 хв.",
        "Збий яйця з дрібкою солі, вилий на сковороду поверх начинки.",
        "Накрий кришкою, готуй 4–5 хв на малому вогні до схоплювання яйця."
      ],
      "tips": [
        "Яйця мають бути повністю схоплені — без рідкого білка.",
        "Сіль, перець, олія — базові припущення.",
        "Висока білкова щільність — ідеально після тренування.",
        "Можна згорнути омлет рулетом для зручної подачі."
      ],
      "macros": {
        "kcal": 420,
        "protein_g": 48,
        "fat_g": 20,
        "carbs_g": 8
      }
    },
    {
      "title": "Рис з яйцями і морквою (смажений)",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "рис — 180 г",
        "яйця — 3 шт",
        "морква — 2 шт",
        "олія соняшникова — 2 ст. л."
      ],
      "steps": [
        "Рис зваріть заздалегідь або швидко: 180 г на 360 мл води, 18 хв.",
        "Моркву наріж дрібними кубиками.",
        "Розігрій олію, обсмажуй моркву 4–5 хв до м'якості.",
        "Додай варений рис, перемішай, смаж 3 хв на сильному вогні.",
        "Зроби ямки в рисі, вбий яйця, одразу перемішай.",
        "Смаж іще 2–3 хв до готовності яйця, посоли, поперчи."
      ],
      "tips": [
        "Сіль, перець, олія — базові припущення.",
        "Використовуй охолоджений варений рис — не злипатиметься.",
        "Страва менш білкова — доповни куркою для кращого набору маси.",
        "Яйця мають бути повністю приготовані."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 18,
        "fat_g": 16,
        "carbs_g": 66
      }
    }
  ]
}
````

````

### recommend-recipes / pantryMode=only — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з відвареним рисом і морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г",
        "морква — 1 шт",
        "олія соняшникова — 1 ст.л."
      ],
      "steps": [
        "Рис промий 2–3 рази, залий 300 мл води, посоли, вари 18–20 хв на малому вогні.",
        "Моркву наріж кубиком, обсмаж на олії 5 хв до м'якості.",
        "Куряче філе наріж на шматки ~3 см, посоли, поперчи.",
        "Додай філе до моркви, смаж на середньому вогні 10–12 хв, перевертаючи.",
        "Перевір готовність курки: внутрішня температура 75 °C або сік прозорий.",
        "Подай курку з морквою поверх рису."
      ],
      "tips": [
        "Базові спеції (сіль, перець, вода) використано за замовчуванням.",
        "Не накривай рис одразу після варіння — дай настоятись 5 хв під кришкою.",
        "Щоб курка була соковитішою, не пересушуй: 75 °C всередині — достатньо.",
        "Ціль набору маси: на порцію ~55 г білка — непогано для вечері."
      ],
      "macros": {
        "kcal": 520,
        "protein_g": 55,
        "fat_g": 10,
        "carbs_g": 52
      }
    },
    {
      "title": "Рисовий омлет з куркою",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "рис — 100 г (відварений)",
        "яйця — 4 шт",
        "олія соняшникова — 1 ст.л."
      ],
      "steps": [
        "Рис відвари заздалегідь або використай залишки: 100 г сухого = ~220 г готового.",
        "Куряче філе дрібно наріж, посоли, обсмаж на олії 8–10 хв до готовності.",
        "Яйця збий з дрібкою солі та перцю.",
        "Додай відварений рис до курки, перемішай, рівномірно розподіли по сковороді.",
        "Залий яєчною сумішшю, накрий кришкою, смаж 5–6 хв на малому вогні до схоплювання.",
        "Поріж на порції та подай гарячим."
      ],
      "tips": [
        "Базові спеції (сіль, перець) використано за замовчуванням.",
        "Малий вогонь під кришкою — яйця пропечуться рівномірно і не пригорять.",
        "Рецепт зручний для використання залишків вареного рису з попереднього прийому.",
        "Висока калорійність і білок з яєць+курки — ідеально для вечері при наборі маси."
      ],
      "macros": {
        "kcal": 490,
        "protein_g": 50,
        "fat_g": 18,
        "carbs_g": 30
      }
    },
    {
      "title": "Смажена морква з яйцями і рисом",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "морква — 2 шт",
        "яйця — 4 шт",
        "рис — 150 г",
        "олія соняшникова — 1 ст.л."
      ],
      "steps": [
        "Рис відвари у підсоленій воді 18–20 хв.",
        "Моркву натри на крупній тертці або наріж соломкою.",
        "Обсмаж моркву на олії 5–7 хв до легкого рум'янцю, посоли, поперчи.",
        "Додай відварений рис до моркви, перемішай, смаж 2 хв.",
        "Зроби 4 заглиблення, вбий по яйцю в кожне, накрий кришкою.",
        "Смаж 3–4 хв до бажаного ступеня готовності жовтка, подай одразу."
      ],
      "tips": [
        "Базові спеції (сіль, перець) використано за замовчуванням.",
        "Якщо хочеш рідкий жовток — 3 хв під кришкою; для твердого — 5 хв.",
        "Рецепт без курки — легший варіант, підходить якщо курку вже їв раніше вдень.",
        "Недобір білка відносно норми набору маси: додай курку з комори наступного прийому."
      ],
      "macros": {
        "kcal": 420,
        "protein_g": 22,
        "fat_g": 16,
        "carbs_g": 50
      }
    }
  ]
}
````

````

### recommend-recipes / pantryMode=only — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: додати інгредієнт поза коморою (окрім солі/перцю/олії/води/спецій). `only` означає «тільки наявне»; вигаданий інгредієнт робить рецепт неможливим, а це вся суть екрана.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г",
        "морква — 1 шт",
        "олія соняшникова — 1 ст. л."
      ],
      "steps": [
        "Рис промити, залити 300 мл підсоленої води, варити 18 хв на малому вогні.",
        "Філе нарізати кубиками 2–3 см, посолити і поперчити.",
        "Моркву натерти на крупній тертці.",
        "Розігріти олію на сковороді, обсмажити філе 5–6 хв до золотистості (внутрішня t° — 74°C).",
        "Додати моркву, смажити ще 3–4 хв.",
        "Змішати з готовим рисом, прогріти 1–2 хв."
      ],
      "tips": [
        "Базові припущення: сіль, перець, вода.",
        "Перевіряй готовність курки: сік повинен бути прозорим.",
        "Для набору маси збільш порцію рису до 200 г на людину."
      ],
      "macros": {
        "kcal": 620,
        "protein_g": 58,
        "fat_g": 14,
        "carbs_g": 68
      }
    },
    {
      "title": "Омлет із куркою та морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "яйця — 4 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст. л."
      ],
      "steps": [
        "Філе нарізати тонкими смужками, посолити.",
        "Моркву натерти на дрібній тертці.",
        "Обсмажити філе на олії 5–6 хв (внутрішня t° — 74°C), додати моркву, смажити 3 хв.",
        "Яйця збити з щіпкою солі і перцю.",
        "Вилити яйця на сковороду поверх начинки, накрити кришкою.",
        "Готувати 4–5 хв на середньому вогні до повного схоплення білка."
      ],
      "tips": [
        "Базові припущення: сіль, перець, олія.",
        "Не піднімай вогонь — омлет буде гумовим знизу і рідким зверху.",
        "Для більшого білка додай ще 1–2 яйця."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 52,
        "fat_g": 24,
        "carbs_g": 8
      }
    },
    {
      "title": "Рисова каша з яйцем і морквою",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "рис — 160 г",
        "яйця — 3 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст. л."
      ],
      "steps": [
        "Рис промити, залити 320 мл підсоленої води, варити 18 хв.",
        "Моркву нарізати дрібними кубиками, обсмажити на олії 4–5 хв.",
        "Яйця збити, вилити до моркви, помішуючи готувати 2–3 хв (яйця мають повністю згорнутися).",
        "Змішати яєчно-моркв'яну масу з рисом, прогріти 1 хв, посолити і поперчити."
      ],
      "tips": [
        "Базові припущення: сіль, перець, вода, олія.",
        "Яйця готуй до повного схоплення — не залишай рідкого білка.",
        "Страва вуглеводно-білкова: добре підходить як вечеря при наборі маси."
      ],
      "macros": {
        "kcal": 520,
        "protein_g": 22,
        "fat_g": 16,
        "carbs_g": 72
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

```text
stub
````

### recommend-recipes / алерген у виключеннях — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

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

**Суддя:** ❌ провалив — рецептів 0, треба ≥2

```text
stub
```

### recommend-recipes / алерген у виключеннях — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

````text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 400 г",
        "рис — 200 г",
        "морква — 2 шт",
        "олія соняшникова"
      ],
      "steps": [
        "Відварити рис до готовності.",
        "Нарізати куряче філе кубиками.",
        "Натерти моркву на крупній тертці.",
        "Обсмажити курку на розігрітій пательні з олією до золотистої скоринки.",
        "Додати моркву до курки, смажити ще 5-7 хвилин.",
        "З'єднати курку з морквою та рис. Перемішати.",
        "Подавати гарячим."
      ],
      "tips": [
        "Для кращого смаку можна додати спеції до курки перед смаженням.",
        "Рис можна промити перед варінням для розсипчастості.",
        "Смажити на середньому вогні, щоб продукти не підгоріли.",
        "Не пересмажуйте моркву, щоб зберегти її корисні властивості."
      ],
      "macros": {
        "kcal": 650,
        "protein_g": 50,
        "fat_g": 25,
        "carbs_g": 60
      }
    },
    {
      "title": "Омлет з куркою та морквою",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "яйця — 4 шт",
        "морква — 1 шт",
        "олія соняшникова"
      ],
      "steps": [
        "Відварити куряче філе до готовності, охолодити та нарізати кубиками.",
        "Натерти моркву на дрібній тертці.",
        "Збити яйця виделкою, посолити і поперчити.",
        "Додати до яєць курку та моркву, перемішати.",
        "Розігріти пательню з олією.",
        "Вилити яєчну суміш на пательню, готувати під кришкою на повільному вогні до готовності (приблизно 10-15 хвилин).",
        "Розрізати омлет навпіл і подавати."
      ],
      "tips": [
        "Можна додати дрібно нарізану зелень.",
        "Для більш пишного омлету, білки можна збити окремо.",
        "Смажити на повільному вогні, щоб омлет не підгорів знизу, а проготувався всередині.",
        "Перевіряти готовність, проткнувши омлет ножем."
      ],
      "macros": {
        "kcal": 450,
        "protein_g": 40,
        "fat_g": 28,
        "carbs_g": 15
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "рис — 100 г",
        "яйце — 1 шт",
        "морква — 1 шт",
        "олія соняшникова"
      ],
      "steps": [
        "Відварити рис до напівготовності.",
        "Пропустити куряче філе через м'ясорубку.",
        "Відварити моркву, охолодити, натерти на дрібній тертці.",
        "Змішати фарш, рис, яйце, моркву. Посолити, поперчити.",
        "Сформувати невеликі котлети.",
        "Обсмажити котлети на розігрітій пательні з олією до золотистої скоринки з обох боків.",
        "Тушкувати під кришкою ще 5-7 хвилин на повільному вогні."
      ],
      "tips": [
        "Для кращої консистенції можна додати до фаршу трохи води або молока.",
        "Можна додати цибулю в фарш за бажанням.",
        "Смажити на середньому вогні.",
        "Перевірити готовність котлет, проткнувши її ножем."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 35,
        "fat_g": 25,
        "carbs_g": 45
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та овочами",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "соняшникова олія",
        "яйця"
      ],
      "steps": [
        "Відварити рис до готовності.",
        "Нарізати куряче філе на невеликі шматочки.",
        "Нарізати моркву соломкою.",
        "Обсмажити куряче філе на розігрітій соняшниковій олії до золотистого кольору.",
        "Додати моркву до курки і смажити ще 5-7 хвилин.",
        "Відварити яйця круто.",
        "Подати куряче філе з рисом, прикрасивши половинками яєць."
      ],
      "tips": [
        "Для більш насиченого смаку можна додати улюблені спеції до курки.",
        "Важливо не переварити рис, щоб він не став клейким.",
        "Смажити курку на середньому вогні, щоб вона добре просмажилась зсередини.",
        "Яйця можна також приготувати як омлет, додавши до них дрібно нарізану моркву."
      ],
      "macros": {
        "kcal": 850,
        "protein_g": 60,
        "fat_g": 35,
        "carbs_g": 70
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "рис",
        "яйця",
        "морква",
        "соняшникова олія"
      ],
      "steps": [
        "Відварити рис до готовності.",
        "Пропустити куряче філе через м'ясорубку або подрібнити в блендері.",
        "Натерти моркву на дрібній терці.",
        "Змішати курячий фарш, 1 яйце, натерту моркву, відварений рис (приблизно половину порції), сіль та перець.",
        "Сформувати невеликі котлети.",
        "Обсмажити котлети на розігрітій соняшниковій олії до золотистої скоринки з обох боків.",
        "Подавати котлети з рештою відвареного рису."
      ],
      "tips": [
        "Для кращого зв'язування фаршу можна додати до нього ще одне яйце.",
        "Котлети можна запекти в духовці замість смаження.",
        "Смажити на помірному вогні, щоб котлети пропеклися всередині.",
        "Рис для котлет має бути повністю охолоджений."
      ],
      "macros": {
        "kcal": 780,
        "protein_g": 55,
        "fat_g": 30,
        "carbs_g": 65
      }
    },
    {
      "title": "Омлет з куркою та овочами",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "яйця",
        "морква",
        "соняшникова олія"
      ],
      "steps": [
        "Нарізати куряче філе дрібними кубиками.",
        "Натерти моркву на дрібній терці.",
        "Обсмажити курку на розігрітій соняшниковій олії до готовності.",
        "Додати моркву до курки і смажити ще 3-4 хвилини.",
        "Збити яйця з сіллю та перцем.",
        "Вилити яєчну суміш на курку з морквою.",
        "Готувати омлет під кришкою на повільному вогні до готовності."
      ],
      "tips": [
        "Можна додати улюблені зелень або спеції до яєчної суміші.",
        "Не пересмажте моркву, щоб вона залишилася трохи хрусткою.",
        "Готувати під кришкою, щоб омлет добре піднявся.",
        "Для більш насиченого білкового профілю можна збільшити кількість яєць."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 50,
        "fat_g": 35,
        "carbs_g": 10
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г",
        "морква — 2 шт",
        "соняшникова олія",
        "сіль",
        "перець"
      ],
      "steps": [
        "Промити рис, залити водою (1:2), варити до готовності (приблизно 15-20 хв).",
        "Куряче філе нарізати шматочками, посолити, поперчити.",
        "Моркву нарізати соломкою.",
        "Розігріти олію на пательні.",
        "Обсмажити курку до золотистої скоринки (5-7 хв).",
        "Додати моркву, смажити ще 5 хв.",
        "Подавати з рисом."
      ],
      "tips": [
        "Рис можна варити паралельно з приготуванням курки.",
        "Для більш насиченого смаку, курку можна попередньо замаринувати в спеціях.",
        "Слідкуйте за тим, щоб курка не пересохла під час смаження.",
        "Регулюйте кількість солі та перцю за смаком."
      ],
      "macros": {
        "kcal": 850,
        "protein_g": 55,
        "fat_g": 35,
        "carbs_g": 80
      }
    },
    {
      "title": "Омлет з куркою та морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "яйця — 4 шт",
        "куряче філе — 150 г",
        "морква — 1 шт",
        "соняшникова олія",
        "сіль",
        "перець"
      ],
      "steps": [
        "Куряче філе нарізати дрібними кубиками, обсмажити до готовності на пательні (7-10 хв).",
        "Моркву натерти на терці.",
        "Яйця збити з сіллю та перцем.",
        "Додати до яєць обсмажене куряче філе та моркву, перемішати.",
        "Розігріти олію на пательні.",
        "Вилити яєчну суміш, готувати під кришкою на повільному вогні до готовності (10-15 хв).",
        "Розрізати навпіл та подавати."
      ],
      "tips": [
        "Для пишності омлету, яйця можна збити з невеликою кількістю води або молока (якщо є).",
        "Слідкуйте за температурою, щоб омлет не підгорів.",
        "Можна додати зелень за смаком (якщо є).",
        "Подавати гарячим."
      ],
      "macros": {
        "kcal": 650,
        "protein_g": 45,
        "fat_g": 40,
        "carbs_g": 25
      }
    },
    {
      "title": "Відварений рис з курячим філе та яйцем",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "рис — 150 г",
        "куряче філе — 150 г",
        "яйця — 2 шт",
        "сіль",
        "перець"
      ],
      "steps": [
        "Промити рис, відварити до готовності (приблизно 15-20 хв).",
        "Куряче філе відварити до готовності (приблизно 20-25 хв), нарізати кубиками.",
        "Яйця зварити круто (10 хв після закипання), почистити, нарізати.",
        "Змішати рис, курку та яйця.",
        "Додати сіль та перець за смаком.",
        "Ретельно перемішати.",
        "Розділити на дві порції."
      ],
      "tips": [
        "Рис та курку можна варити одночасно.",
        "Для кращого смаку, можна додати трохи соняшникової олії.",
        "Страву можна їсти як в гарячому, так і в холодному вигляді.",
        "Добре смакує з будь-яким соусом (якщо є)."
      ],
      "macros": {
        "kcal": 700,
        "protein_g": 50,
        "fat_g": 25,
        "carbs_g": 70
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г (сухий)",
        "морква — 2 шт",
        "олія соняшникова — 2 ст.л."
      ],
      "steps": [
        "Рис промити, залити 300 мл води, варити 18–20 хв на малому вогні.",
        "Філе нарізати кубиками 3–4 см, посолити, поперчити.",
        "Моркву натерти на крупній тертці.",
        "Розігріти олію на сковороді, смажити курку 5–6 хв до золотистості (внутрішня t° ≥ 74 °C).",
        "Додати моркву, смажити ще 4–5 хв.",
        "Подати курку з морквою поверх рису."
      ],
      "tips": [
        "Перевір готовність курки: м'ясо всередині не рожеве.",
        "Рис не мішай під час варіння — буде розсипчастим.",
        "Базові припущення: сіль, перець, вода."
      ],
      "macros": {
        "kcal": 620,
        "protein_g": 52,
        "fat_g": 14,
        "carbs_g": 68
      }
    },
    {
      "title": "Рисова запіканка з куркою та яйцями",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис відварний — 200 г",
        "яйця — 3 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст.л."
      ],
      "steps": [
        "Відварити рис заздалегідь або використати готовий.",
        "Філе подрібнити у фарш або дрібно нарізати, посолити.",
        "Моркву натерти, злегка обсмажити на олії 3 хв.",
        "Змішати рис, курку, моркву та яйця в мисці, посолити.",
        "Вилити масу у форму, змащену олією.",
        "Запікати при 190 °C 20 хв до золотистої скоринки."
      ],
      "tips": [
        "Внутрішня температура запіканки має бути ≥ 74 °C.",
        "Можна додати зелень (петрушку, кріп) — якщо є.",
        "Базові припущення: сіль, перець, олія для форми."
      ],
      "macros": {
        "kcal": 580,
        "protein_g": 54,
        "fat_g": 16,
        "carbs_g": 48
      }
    },
    {
      "title": "Смажений рис з яйцями та морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "рис відварний — 300 г",
        "яйця — 4 шт",
        "морква — 2 шт",
        "олія соняшникова — 2 ст.л."
      ],
      "steps": [
        "Моркву нарізати дрібним кубиком, обсмажити на олії 4 хв.",
        "Додати відварний рис, смажити 3–4 хв, помішуючи.",
        "Зрушити рис до краю, розбити яйця на вільне місце сковороди.",
        "Перемішати яйця з рисом, смажити ще 2–3 хв.",
        "Посолити, поперчити, подавати гарячим."
      ],
      "tips": [
        "Рис краще брати вчорашній — не злипається.",
        "Для більшого білка додай ще 1–2 яйця.",
        "Базові припущення: сіль, перець."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 22,
        "fat_g": 18,
        "carbs_g": 56
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою на сковороді",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 400 г",
        "рис — 200 г (сухий)",
        "морква — 2 шт",
        "олія соняшникова — 2 ст.л.",
        "сіль, перець — за смаком"
      ],
      "steps": [
        "Відваріть рис у підсоленій воді 18–20 хв, злийте.",
        "Наріжте філе смужками ~2 см, моркву — тонкою соломкою.",
        "Розігрійте олію на сковороді на сильному вогні.",
        "Обсмажте філе 5–6 хв до золотистої скоринки, посоліть, поперчіть.",
        "Додайте моркву, смажте ще 4–5 хв до м'якості.",
        "Змішайте з рисом, прогрійте 1–2 хв і подавайте."
      ],
      "tips": [
        "Внутрішня температура курки — мінімум 74°C.",
        "Базові припущення: сіль, перець, вода.",
        "Для набору маси збільшуйте порцію рису до 250 г на людину.",
        "Не перемішуйте курку одразу — дайте підрум'янитись для скоринки."
      ],
      "macros": {
        "kcal": 720,
        "protein_g": 72,
        "fat_g": 14,
        "carbs_g": 78
      }
    },
    {
      "title": "Омлет із куркою та морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "яйця — 4 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст.л.",
        "сіль, перець — за смаком"
      ],
      "steps": [
        "Відваріть або обсмажте філе заздалегідь, наріжте дрібними кубиками.",
        "Натріть моркву на крупній тертці, обсмажте на олії 3–4 хв.",
        "Збийте яйця з сіллю і перцем до однорідності.",
        "Додайте курку до моркви на сковороді, залийте яйцями.",
        "Накрийте кришкою, смажте на середньому вогні 5–7 хв до повного схоплення.",
        "Складіть навпіл і подавайте гарячим."
      ],
      "tips": [
        "Яйця мають бути повністю пропечені — без рідкого центру.",
        "Базові припущення: сіль, перець, вода.",
        "Швидкий варіант для вечері з високим вмістом білка.",
        "Доповніть рисом як гарнір для більшого калоражу."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 58,
        "fat_g": 22,
        "carbs_g": 8
      }
    },
    {
      "title": "Рисова каша з яйцем і морквою (протеїновий боул)",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "рис — 180 г (сухий)",
        "яйця — 4 шт",
        "морква — 2 шт",
        "олія соняшникова — 1 ст.л.",
        "сіль, перець — за смаком"
      ],
      "steps": [
        "Відваріть рис 18–20 хв у підсоленій воді.",
        "Наріжте моркву кубиками, обсмажте на олії 5 хв до м'якості.",
        "Зваріть яйця некруто — 6–7 хв після закипання, охолодіть, очистіть.",
        "Розкладіть рис по мисках, зверху додайте моркву.",
        "Наріжте яйця навпіл, викладіть поряд, посоліть і поперчіть."
      ],
      "tips": [
        "Базові припущення: сіль, перець, вода.",
        "6 хвилин варіння яйця дає м'який жовток з більшою біодоступністю жирів.",
        "Для набору маси додайте ще 2 яйця або збільшуйте рис.",
        "Морква дає бета-каротин — корисно для відновлення після навантажень."
      ],
      "macros": {
        "kcal": 560,
        "protein_g": 26,
        "fat_g": 16,
        "carbs_g": 74
      }
    }
  ]
}
````

````

### recommend-recipes / алерген у виключеннях — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: згадати арахіс будь-де в інгредієнтах. `exclude` — це алергени; порушення тут не косметичне.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 2,
      "ingredients": [
        "куряче філе — 300 г",
        "рис — 150 г (сухий)",
        "морква — 1 шт",
        "олія соняшникова — 1 ст.л.",
        "сіль, перець"
      ],
      "steps": [
        "Рис промити, залити 300 мл холодної води, довести до кипіння, зменшити вогонь, варити 18 хв під кришкою.",
        "Куряче філе нарізати шматочками ~3 см, посолити, поперчити.",
        "Моркву натерти на крупній тертці.",
        "Розігріти олію на сковороді на середньому вогні, обсмажити курку 5–6 хв до золотистої скоринки.",
        "Додати моркву, смажити разом іще 4 хв, помішуючи.",
        "Подати курку з морквою поверх рису."
      ],
      "tips": [
        "Внутрішня температура курки — мінімум 74 °C.",
        "Базові припущення: сіль, перець, вода.",
        "Для набору маси додай 1 ст.л. олії зверху на готову страву — це +120 ккал.",
        "Рис можна замінити на бурий для більшої кількості клітковини."
      ],
      "macros": {
        "kcal": 620,
        "protein_g": 58,
        "fat_g": 12,
        "carbs_g": 68
      }
    },
    {
      "title": "Омлет з куркою і морквою",
      "timeMinutes": 20,
      "servings": 2,
      "ingredients": [
        "куряче філе — 200 г",
        "яйця — 4 шт",
        "морква — 1 шт",
        "олія соняшникова — 1 ст.л.",
        "сіль, перець"
      ],
      "steps": [
        "Куряче філе нарізати дрібними кубиками, посолити, поперчити.",
        "Моркву натерти на дрібній тертці.",
        "Обсмажити курку на олії 5–6 хв до готовності, додати моркву, смажити 2 хв.",
        "Яйця збити виделкою з щіпкою солі.",
        "Залити яйцями вміст сковороди, накрити кришкою.",
        "Готувати на малому вогні 5–6 хв до повного схоплення білка.",
        "Скласти омлет навпіл і подавати."
      ],
      "tips": [
        "Внутрішня температура готового омлету — 72 °C, жовток не повинен бути рідким.",
        "Базові припущення: сіль, перець, олія.",
        "4 яйця + 200 г курки = ~60 г білка на 2 порції — добре для вечірнього прийому.",
        "Не піднімай вогонь — омлет стане гумовим."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 60,
        "fat_g": 22,
        "carbs_g": 8
      }
    },
    {
      "title": "Рисова каша з яйцями і морквою (протеїновий боул)",
      "timeMinutes": 25,
      "servings": 2,
      "ingredients": [
        "рис — 150 г (сухий)",
        "яйця — 4 шт",
        "морква — 2 шт",
        "олія соняшникова — 1 ст.л.",
        "сіль, перець"
      ],
      "steps": [
        "Рис промити, варити у 300 мл підсоленої води 18 хв.",
        "Моркву нарізати соломкою або натерти, обсмажити на олії 4–5 хв.",
        "Яйця відварити круто (10 хв після закипання), охолодити, очистити, розрізати навпіл.",
        "Готовий рис змішати з морквою, викласти у боул.",
        "Розмістити яйця зверху, посолити, поперчити."
      ],
      "tips": [
        "Базові припущення: сіль, перець, вода.",
        "Круте яйце — мінімум 10 хв кипіння, безпечно для сальмонели.",
        "Додай 0,5 ст.л. олії в рис — підвищить калорійність для набору маси.",
        "Страва холодного приготування — зручно взяти з собою."
      ],
      "macros": {
        "kcal": 530,
        "protein_g": 28,
        "fat_g": 18,
        "carbs_g": 65
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ❌ провалив — рецептів 0 — відповідь обірвалась на ліміті токенів

```text
stub
````

### recommend-recipes / обрізана відповідь — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ❌ провалив — рецептів 0 — відповідь обірвалась на ліміті токенів

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

**Суддя:** ❌ провалив — рецептів 0 — відповідь обірвалась на ліміті токенів

```text
stub
```

### recommend-recipes / обрізана відповідь — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

````text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відваріть рис до готовності.",
        "Наріжте куряче філе кубиками.",
        "Натріть моркву на крупній тертці.",
        "Обсмажте курку на розігрітій олії до золотистої скоринки.",
        "Додайте моркву до курки та тушкуйте 5-7 хвилин.",
        "Змішайте готову курку з морквою та рис.",
        "Посоліть та поперчіть за смаком."
      ],
      "tips": [
        "Для більш насиченого смаку можна додати улюблені спеції до курки.",
        "Важливо не переварити рис, щоб він залишився розсипчастим.",
        "Тушкуйте моркву до м'якості, але не перетворіть її на пюре."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 45,
        "fat_g": 15,
        "carbs_g": 60
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "рис",
        "яйця",
        "морква",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відваріть рис до готовності та охолодіть.",
        "Пропустіть куряче філе через м'ясорубку або подрібніть у блендері.",
        "Натріть моркву на дрібній тертці.",
        "Змішайте фарш, охолоджений рис, яйця, моркву, сіль і перець.",
        "Сформуйте котлети.",
        "Обсмажте котлети на розігрітій олії до золотистої скоринки з обох боків.",
        "Доведіть до готовності під кришкою на невеликому вогні 5-7 хвилин."
      ],
      "tips": [
        "Якщо фарш вийшов занадто рідким, можна додати трохи панірувальних сухарів (якщо є в наявності, але не входять до комори).",
        "Смажте на середньому вогні, щоб котлети не підгоріли зовні, але приготувалися всередині.",
        "Для соковитості можна додати до фаршу трохи води або бульйону."
      ],
      "macros": {
        "kcal": 500,
        "protein_g": 40,
        "fat_g": 20,
        "carbs_g": 40
      }
    },
    {
      "title": "Омлет з куркою та морквою",
      "timeMinutes": 20,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "яйця",
        "морква",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відваріть куряче філе до готовності та наріжте дрібними кубиками.",
        "Натріть моркву на дрібній тертці.",
        "Збийте яйця з сіллю та перцем.",
        "Обсмажте моркву на розігрітій олії до м'якості.",
        "Додайте до моркви куряче філе, прогрійте 2 хвилини.",
        "Залийте суміш з курки та моркви збитими яйцями.",
        "Готуйте під кришкою на невеликому вогні до готовності омлету."
      ],
      "tips": [
        "Цей рецепт чудово підійде для швидкої вечері.",
        "Не пересмажте моркву, щоб вона залишилася трохи хрусткою.",
        "Можна використовувати залишки відвареної курки з попередніх страв."
      ],
      "macros": {
        "kcal": 300,
        "protein_g": 30,
        "fat_g": 18,
        "carbs_g": 5
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Промити рис, залити водою у співвідношенні 1:2, посолити, варити до готовності.",
        "Куряче філе нарізати невеликими шматочками.",
        "Моркву натерти на крупній тертці.",
        "На пательні розігріти олію, обсмажити куряче філе до золотистої скоринки.",
        "Додати моркву до курки, тушкувати 5-7 хвилин.",
        "Подати куряче філе з морквою разом з відвареним рисом."
      ],
      "tips": [
        "Для більш насиченого смаку можна додати базові спеції за смаком (перець).",
        "Слідкуйте за готовністю рису, щоб він не переварився.",
        "Смажити курку на середньому вогні.",
        "Подавати страву гарячою."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 45,
        "fat_g": 15,
        "carbs_g": 60
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "рис",
        "яйця",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Відварити рис до напівготовності, охолодити.",
        "Куряче філе пропустити через м'ясорубку.",
        "Моркву натерти на дрібній тертці.",
        "Змішати фарш з рисом, морквою, яйцями, сіллю та перцем.",
        "Сформувати невеликі котлети.",
        "Розігріти олію на пательні, обсмажити котлети з обох боків до золотистої скоринки, потім тушкувати під кришкою 10-15 хвилин."
      ],
      "tips": [
        "Щоб котлети не розпадалися, можна додати ще одне яйце.",
        "Смажити на середньому вогні.",
        "Можна подавати з будь-яким гарніром.",
        "Важливо добре просмажити котлети для безпеки."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 35,
        "fat_g": 18,
        "carbs_g": 45
      }
    },
    {
      "title": "Яєчня з куркою та овочами",
      "timeMinutes": 15,
      "servings": 2,
      "ingredients": [
        "куряче філе",
        "яйця",
        "морква",
        "олія соняшникова"
      ],
      "steps": [
        "Куряче філе нарізати тонкими смужками.",
        "Моркву нарізати тонкою соломкою.",
        "На пательні розігріти олію, обсмажити курку до готовності.",
        "Додати моркву, смажити ще 3-5 хвилин.",
        "Вбити яйця, посолити, поперчити.",
        "Смажити до готовності яєць."
      ],
      "tips": [
        "Можна використовувати рис як гарнір.",
        "Смажити на середньому вогні.",
        "Регулюйте кількість яєць за бажанням.",
        "Подавати гарячим."
      ],
      "macros": {
        "kcal": 400,
        "protein_g": 30,
        "fat_g": 25,
        "carbs_g": 15
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом та морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "рис",
        "морква",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відварити рис згідно з інструкцією на упаковці.",
        "Куряче філе нарізати невеликими шматочками.",
        "Моркву натерти на крупній тертці.",
        "На пательні розігріти олію, обсмажити куряче філе до золотистої скоринки.",
        "Додати моркву до курки, смажити ще 5-7 хвилин.",
        "Приправити сіллю та перцем за смаком.",
        "Подавати курку з морквою, гарніруючи відвареним рисом."
      ],
      "tips": [
        "Для кращого смаку рис можна промити перед варінням.",
        "Не пересмажуйте курку, щоб вона залишилася соковитою.",
        "Контролюйте температуру під час смаження, щоб уникнути пригорання.",
        "Можна додати улюблені спеції для аромату."
      ],
      "macros": {
        "kcal": 550,
        "protein_g": 35,
        "fat_g": 18,
        "carbs_g": 60
      }
    },
    {
      "title": "Курячі котлети з рисом",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе",
        "яйця",
        "рис",
        "олія соняшникова",
        "сіль",
        "перець"
      ],
      "steps": [
        "Відварити рис до готовності, охолодити.",
        "Куряче філе перемолоти на м'ясорубці або подрібнити у блендері.",
        "Змішати курячий фарш, відварений рис, яйця, сіль та перець.",
        "Сформувати невеликі котлети.",
        "На пательні розігріти олію, обсмажити котлети з обох боків до золотистої скоринки.",
        "Можна додати трохи води, накрити кришкою та тушкувати до повної готовності (близько 10-15 хвилин).",
        "Подавати як самостійну страву."
      ],
      "tips": [
        "Якщо фарш вийшов занадто рідким, можна додати трохи більше рису.",
        "Смажте котлети на середньому вогні, щоб вони просмажилися всередині.",
        "Для більш ніжного смаку можна додати трохи води і тушкувати під кришкою.",
        "Готовність котлет можна перевірити, проколовши одну виделкою – сік має бути прозорим."
      ],
      "macros": {
        "kcal": 500,
        "protein_g": 32,
        "fat_g": 20,
        "carbs_g": 50
      }
    },
    {
      "title": "Рисовий пудинг з яйцем та морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "рис",
        "яйця",
        "морква",
        "олія соняшникова",
        "сіль",
        "цукор"
      ],
      "steps": [
        "Відварити рис майже до готовності, промити.",
        "Моркву натерти на дрібній тертці.",
        "Яйця збити з дрібкою солі та цукром (за смаком).",
        "Змішати рис, терту моркву та збиті яйця.",
        "На пательні розігріти трохи олії, викласти рисово-морквяну суміш.",
        "Смажити на повільному вогні під кришкою до готовності (близько 15-20 хвилин), перевернувши один раз.",
        "Подавати теплим."
      ],
      "tips": [
        "Не переварюйте рис, він має бути трохи твердим, щоб пудинг не розвалився.",
        "Якщо хочете солодший пудинг, додайте більше цукру.",
        "Смажте на повільному вогні, щоб пудинг просмажився рівномірно.",
        "Можна подавати з ягодами або фруктами, якщо вони є."
      ],
      "macros": {
        "kcal": 400,
        "protein_g": 15,
        "fat_g": 15,
        "carbs_g": 55
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "рис — 400 г",
        "морква — 2 шт",
        "олія соняшникова — 3 ст.л."
      ],
      "steps": [
        "Рис промий, залий 800 мл води, відвари 18 хв на малому вогні під кришкою.",
        "Філе наріж кубиками 3 см, посоли, поперчи.",
        "Моркву натри на крупній тертці.",
        "Розігрій олію на сковороді, обсмаж філе 6–7 хв до золотистої скоринки.",
        "Додай моркву, смаж ще 4 хв, помішуючи.",
        "З'єднай рис з куркою та морквою, перемішай, прогрій 2 хв."
      ],
      "tips": [
        "Внутрішня температура курки — мінімум 74 °C.",
        "Сіль, перець, вода — базові; інших інгредієнтів не додавалось.",
        "Для соковитості не пересмажуй філе — достатньо 6–7 хв.",
        "Рис можна зварити заздалегідь, щоб вкластись у 30 хв."
      ],
      "macros": {
        "kcal": 420,
        "protein_g": 32,
        "fat_g": 9,
        "carbs_g": 52
      }
    },
    {
      "title": "Яєчня з морквою та рисом",
      "timeMinutes": 20,
      "servings": 6,
      "ingredients": [
        "яйця — 10 шт",
        "морква — 2 шт",
        "рис — 300 г",
        "олія соняшникова — 2 ст.л."
      ],
      "steps": [
        "Рис відвари до готовності (18 хв), злий воду.",
        "Моркву натри на крупній тертці, обсмаж на олії 4 хв.",
        "Яйця збий із сіллю та перцем у мисці.",
        "Додай яєчну суміш до моркви, перемішай, смаж 3–4 хв на середньому вогні.",
        "Викладай яєчню поверх рису при подачі."
      ],
      "tips": [
        "Яйця смаж до повного згортання білка — не менше 3 хв.",
        "Сіль, перець, вода — базові; інших інгредієнтів не додавалось.",
        "Рис охолодженого дня можна використати вчорашній — смажиться краще.",
        "Для калорійності (набір маси) збільш порцію рису до 400 г."
      ],
      "macros": {
        "kcal": 370,
        "protein_g": 22,
        "fat_g": 13,
        "carbs_g": 42
      }
    },
    {
      "title": "Куряче філе з яйцем та морквою (протеїновий стир-фрай)",
      "timeMinutes": 25,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "яйця — 6 шт",
        "морква — 2 шт",
        "олія соняшникова — 3 ст.л."
      ],
      "steps": [
        "Філе наріж тонкими смужками, посоли, поперчи.",
        "Моркву наріж тонкою соломкою.",
        "Розігрій олію на великому вогні, обсмаж філе 5–6 хв до готовності.",
        "Додай моркву, смаж 3 хв, помішуючи.",
        "Злегка відсунь вміст, вилий збиті яйця на вільне місце сковороди.",
        "Перемішай яйця з куркою та морквою, смаж ще 2–3 хв до готовності яєць."
      ],
      "tips": [
        "Внутрішня температура курки — мінімум 74 °C; яйця — повністю згорнуті.",
        "Сіль, перець, вода — базові; інших інгредієнтів не додавалось.",
        "Великий вогонь дає рум'яну скоринку без зайвого соку.",
        "Подавай із відвареним рисом з цього ж списку для повноцінного прийому їжі."
      ],
      "macros": {
        "kcal": 310,
        "protein_g": 38,
        "fat_g": 15,
        "carbs_g": 4
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Курка з рисом і морквою на сковороді",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "рис — 600 г",
        "морква — 3 шт",
        "олія соняшникова — 3 ст. л."
      ],
      "steps": [
        "Наріж філе кубиками 2–3 см, моркву — соломкою.",
        "Розігрій олію на сковороді, обсмаж курку 5–7 хв до золотистої скоринки.",
        "Додай моркву, смаж ще 3 хв.",
        "Всип промитий рис, перемішай.",
        "Залий 1,2 л окропу, посоли, накрий кришкою.",
        "Вари на середньому вогні 18–20 хв до повного всотування води.",
        "Дай настоятись 5 хв під кришкою перед подачею."
      ],
      "tips": [
        "Базові спеції (сіль, перець, вода, олія) вважаються наявними.",
        "Внутрішня температура курки — мінімум 75 °C.",
        "Рис перед готуванням промий до прозорої води — буде розсипчастим.",
        "Для набору маси порція ~300 г дає ~45 г білка."
      ],
      "macros": {
        "kcal": 520,
        "protein_g": 42,
        "fat_g": 9,
        "carbs_g": 68
      }
    },
    {
      "title": "Яєчно-рисова запіканка з морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "рис — 500 г (відварений)",
        "яйця — 8 шт",
        "морква — 2 шт",
        "олія соняшникова — 2 ст. л."
      ],
      "steps": [
        "Відвари рис 15 хв, остуди.",
        "Натри моркву на крупній тертці, обсмаж на олії 3 хв.",
        "Збий яйця з сіллю та перцем.",
        "З'єднай рис, моркву й яйця, перемішай.",
        "Вилий масу у змащену форму або глибоку сковороду.",
        "Запікай при 200 °C 20 хв або накрий кришкою і готуй на тихому вогні 15 хв.",
        "Перевір готовність — центр має бути твердим, не рідким."
      ],
      "tips": [
        "Базові спеції (сіль, перець, вода, олія) вважаються наявними.",
        "Яйця дають зв'язок — не зменшуй кількість.",
        "Запіканка багата білком: яйця + рис = повноцінний набірний обід.",
        "Температура готовності всередині — 72 °C."
      ],
      "macros": {
        "kcal": 390,
        "protein_g": 18,
        "fat_g": 11,
        "carbs_g": 52
      }
    },
    {
      "title": "Варена курка з яйцями та морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "яйця — 6 шт",
        "морква — 2 шт"
      ],
      "steps": [
        "Налий воду у дві каструлі, доведи до кипіння.",
        "У першу поклади філе, посоли — вари 20 хв.",
        "У другу одночасно поклади яйця — вари 10 хв круто.",
        "Моркву наріж брусочками, постав варитись разом із куркою.",
        "Готове філе наріж порційно, яйця очисти і розріж навпіл.",
        "Виклади на тарілку: курка + яйце + морква, полий ложкою бульйону."
      ],
      "tips": [
        "Базові спеції (сіль, перець, вода) вважаються наявними.",
        "Висока білкова щільність без зайвого жиру — ідеально для набору маси ввечері.",
        "Курка готова, коли м'ясний сік прозорий, температура всередині — 75 °C.",
        "Бульйон не виливай — можна використати для варіння рису наступного разу."
      ],
      "macros": {
        "kcal": 280,
        "protein_g": 46,
        "fat_g": 8,
        "carbs_g": 5
      }
    }
  ]
}
````

````

### recommend-recipes / обрізана відповідь — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: почати 3 розлогі рецепти й обірватись на ліміті токенів — `normalizeRecipes` тоді віддасть порожньо, і користувач побачить `rawText`. Промпт прямо каже: не вміщається — поверни МЕНШЕ рецептів.

**Суддя:** ✅ пройшов

```text
```json
{
  "recipes": [
    {
      "title": "Куряче філе з рисом і морквою",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "рис — 400 г",
        "морква — 2 шт",
        "олія соняшникова — 3 ст. л."
      ],
      "steps": [
        "Відмір 400 г рису, промий і постав варитися у 800 мл підсоленої води на 18 хв.",
        "Куряче філе наріж кубиками 2–3 см, посоли і поперчи.",
        "Моркву натри на крупній тертці.",
        "Розігрій олію на сковороді, обсмаж курку на середньому вогні 7–8 хв до золотистої скоринки (внутрішня температура ≥74°C).",
        "Додай моркву до курки, смаж ще 3–4 хв.",
        "Змішай готовий рис із курятиною та морквою.",
        "Розклади по тарілках і подавай гарячим."
      ],
      "tips": [
        "Базові спеції (сіль, перець, паприка) дозволені — вони не є інгредієнтами комори.",
        "Щоб рис не злипався, промивай до прозорої води.",
        "Перевіряй готовність курки термометром: 74°C усередині.",
        "На 6 порцій цієї страви припадає ~38 г білка — добре для вечері при наборі маси."
      ],
      "macros": {
        "kcal": 420,
        "protein_g": 38,
        "fat_g": 9,
        "carbs_g": 52
      }
    },
    {
      "title": "Яєчний омлет з морквою",
      "timeMinutes": 15,
      "servings": 6,
      "ingredients": [
        "яйця — 10 шт",
        "морква — 2 шт",
        "олія соняшникова — 2 ст. л."
      ],
      "steps": [
        "Моркву натри на дрібній тертці.",
        "Яйця розбий у миску, посоли, збий виделкою до однорідності.",
        "Додай моркву до яєць, перемішай.",
        "Розігрій олію на сковороді (середній вогонь), вилий суміш.",
        "Накрий кришкою і готуй 8–10 хв до повного схоплення білка.",
        "Наріж на 6 частин і подавай."
      ],
      "tips": [
        "Омлет готовий, коли центр не тремтить і не рідкий — безпечна температура яєць 72°C.",
        "Сіль і перець — базові спеції, присутні за замовчуванням.",
        "Для об'єму можна збити яйця активніше — омлет вийде пишніший.",
        "Страва легка, але багата на повноцінний білок — ідеально як доповнення до рису."
      ],
      "macros": {
        "kcal": 160,
        "protein_g": 13,
        "fat_g": 11,
        "carbs_g": 4
      }
    },
    {
      "title": "Рисова запіканка з куркою та яйцями",
      "timeMinutes": 30,
      "servings": 6,
      "ingredients": [
        "куряче філе — 600 г",
        "рис — 300 г",
        "яйця — 4 шт",
        "олія соняшникова — 2 ст. л."
      ],
      "steps": [
        "Відвари рис у підсоленій воді 15 хв, злий воду.",
        "Куряче філе дрібно наріж або подрібни, посоли і поперчи.",
        "Обсмаж курку на олії 6–7 хв до готовності (74°C усередині).",
        "Змішай рис, курку і збиті яйця в жаростійкій формі.",
        "Запікай при 200°C протягом 15 хв до золотистої скоринки.",
        "Дай охолонути 3 хв, наріж на 6 порцій."
      ],
      "tips": [
        "Форму злегка змасти олією, щоб запіканка не прилипала.",
        "Яйця виступають 'клеєм' — не пропускай цей крок.",
        "Базові спеції (сіль, перець) позначені як дозволені.",
        "Страва висококалорійна і багата на білок — оптимально для вечері при наборі маси."
      ],
      "macros": {
        "kcal": 480,
        "protein_g": 42,
        "fat_g": 12,
        "carbs_g": 48
      }
    }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ❌ провалив — порожній items

```text
stub
````

### parse-pantry / дублікати й одиниці — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ❌ провалив — порожній items

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

**Суддя:** ❌ провалив — порожній items

```text
stub
```

### parse-pantry / дублікати й одиниці — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

````text
```json
{
  "items": [
    {
      "name": "молоко",
      "qty": 1,
      "unit": "л",
      "notes": null
    },
    {
      "name": "банан",
      "qty": 2,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "куряче філе",
      "qty": 600,
      "unit": "г",
      "notes": null
    },
    {
      "name": "молоко",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": 1,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "рис",
      "qty": 1,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": 2,
      "unit": "шт",
      "notes": null
    }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    {
      "name": "молоко",
      "qty": 1,
      "unit": "л",
      "notes": null
    },
    {
      "name": "банан",
      "qty": 2,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "куряче філе",
      "qty": 600,
      "unit": "г",
      "notes": null
    },
    {
      "name": "молоко",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "рис",
      "qty": 1,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": 2,
      "unit": "шт",
      "notes": null
    }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    {
      "name": "молоко",
      "qty": 1,
      "unit": "л",
      "notes": null
    },
    {
      "name": "банан",
      "qty": 2,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "куряче філе",
      "qty": 600,
      "unit": "г",
      "notes": null
    },
    {
      "name": "молоко",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "рис",
      "qty": 1,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "йогурт",
      "qty": 2,
      "unit": "шт",
      "notes": null
    }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "молоко", "qty": 1, "unit": "л", "notes": null },
    { "name": "банан", "qty": 2, "unit": "шт", "notes": null },
    { "name": "куряче філе", "qty": 600, "unit": "г", "notes": null },
    { "name": "йогурт", "qty": 2, "unit": "шт", "notes": null },
    { "name": "рис", "qty": 1, "unit": "кг", "notes": null }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "молоко", "qty": 1, "unit": "л", "notes": null },
    { "name": "банан", "qty": 2, "unit": "шт", "notes": null },
    { "name": "куряче філе", "qty": 600, "unit": "г", "notes": null },
    { "name": "йогурт", "qty": 2, "unit": "шт", "notes": null },
    { "name": "рис", "qty": 1, "unit": "кг", "notes": null }
  ]
}
````

````

### parse-pantry / дублікати й одиниці — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: (а) лишити «молоко» і «йогурт» по два рази — промпт вимагає об'єднання; (б) для «дві банани» поставити unit ≠ «шт» або null. Дублікат у коморі мовчки ламає і список покупок, і план.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "молоко", "qty": 1, "unit": "л", "notes": null },
    { "name": "банан", "qty": 2, "unit": "шт", "notes": null },
    { "name": "куряче філе", "qty": 600, "unit": "г", "notes": null },
    { "name": "йогурт", "qty": 2, "unit": "шт", "notes": null },
    { "name": "рис", "qty": 1, "unit": "кг", "notes": null }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ❌ провалив — позицій 0, треба ≥3

```text
stub
````

### parse-pantry / надиктований текст з помилками — current default (Anthropic) (`claude-sonnet-4-6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ❌ провалив — позицій 0, треба ≥3

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

**Суддя:** ❌ провалив — позицій 0, треба ≥3

```text
stub
```

### parse-pantry / надиктований текст з помилками — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

````text
```json
{
  "items": [
    {
      "name": "помідор",
      "qty": 3,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "огірок",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "картопля",
      "qty": 5,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "хліб",
      "qty": null,
      "unit": null,
      "notes": null
    }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    {
      "name": "помідор",
      "qty": 3,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "огірок",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "картопля",
      "qty": 5,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "хліб",
      "qty": null,
      "unit": null,
      "notes": null
    }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — OpenRouter Gemini Flash Lite (`google/gemini-2.5-flash-lite`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    {
      "name": "помідор",
      "qty": 3,
      "unit": "шт",
      "notes": null
    },
    {
      "name": "огірок",
      "qty": null,
      "unit": null,
      "notes": null
    },
    {
      "name": "картопля",
      "qty": 5,
      "unit": "кг",
      "notes": null
    },
    {
      "name": "хліб",
      "qty": null,
      "unit": null,
      "notes": null
    }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "помідор", "qty": 3, "unit": "шт", "notes": null },
    { "name": "огірок", "qty": null, "unit": null, "notes": null },
    { "name": "картопля", "qty": 5, "unit": "кг", "notes": null },
    { "name": "хліб", "qty": null, "unit": null, "notes": null }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "помідор", "qty": 3, "unit": "шт", "notes": null },
    { "name": "огірок", "qty": null, "unit": null, "notes": null },
    { "name": "картопля", "qty": 5, "unit": "кг", "notes": null },
    { "name": "хліб", "qty": null, "unit": null, "notes": null }
  ]
}
````

````

### parse-pantry / надиктований текст з помилками — sonnet46-real (`anthropic/claude-sonnet-4.6`)

**Пастка:** НЕПРАВИЛЬНО: віддати назви як є («памідори», «агуркі») або зовсім порожній масив. Промпт вимагає нормалізації в однину й українську норму.

**Суддя:** ✅ пройшов

```text
```json
{
  "items": [
    { "name": "помідор", "qty": 3, "unit": "шт", "notes": null },
    { "name": "огірок", "qty": null, "unit": null, "notes": null },
    { "name": "картопля", "qty": 5, "unit": "кг", "notes": null },
    { "name": "хліб", "qty": null, "unit": null, "notes": null }
  ]
}
````

```


## Промпти (джерело)

| Пайплайн | Продовий білдер | system | Кейсів |
| --- | --- | --- | --- |
| classify | `routes/internal/categorize.ts::buildCategorizePrompt` | 1130 симв. | 5 |
| digest | `modules/digest/weekly-digest.ts::buildWeeklyDigestPrompt` | 1843 симв. | 4 |
| mono | `lib/mcc/batchPrompt.ts::buildBatchPrompt` | 1254 симв. | 2 |
| coach-insight | `modules/chat/coach.ts::buildCoachInsightPrompt` | — (прод шле все user-реплікою) | 4 |
| chat | `modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX` | 4422 симв. | 6 |
| analysis | `modules/chat/toolDefs/systemPrompt.ts::SYSTEM_PREFIX` | 4422 симв. | 8 |
| day-hint | `modules/nutrition/day-hint.ts::buildDayHintPrompt` | — (прод шле все user-реплікою) | 3 |
| day-plan | `modules/nutrition/day-plan.ts::buildDayPlanPrompt` | 1664 симв. | 3 |
| week-plan | `modules/nutrition/week-plan.ts::buildWeekPlanPrompt` | 974 симв. | 2 |
| shopping-list | `modules/nutrition/shopping-list.ts::buildShoppingListPrompt` | 1554 симв. | 3 |
| recommend-recipes | `modules/nutrition/recommend-recipes.ts::buildRecommendRecipesPrompt` | 1807 симв. | 3 |
| parse-pantry | `modules/nutrition/parse-pantry.ts::buildParsePantryPrompt` | 1261 симв. | 3 |
```
