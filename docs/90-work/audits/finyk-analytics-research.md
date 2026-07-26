# Research: аналітика конкурентів і шортлист для Фініка (C6)

> **Last touched:** 2026-07-26 by Claude (Fable 5). **Next review:** 2026-10-26.
> **Status:** Active

Двофазне дослідження: deep-research воркфлоу (103 агенти, адверсарійна верифікація тверджень) + 4 прицільні доборні прогони по прогалинах (легкі трекери, Emma/Revolut, вбудований monobank, думки юзерів). Всі твердження з джерелами; де джерел нема — так і написано.

## 1. Таблиця: що дають конкуренти

| Продукт                                     | Розрізи                                              | Порівняння/тренди                               | Recurring/підписки                                                                                                 | Прогноз/cash flow                                 | Insights                                                                                                                        |
| ------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **monobank (вбудований)**                   | категорії у %, день/тиждень/місяць, теги, всі картки | **нема** MoM-порівняння/трендів                 | **нема** (лише анонсовано)                                                                                         | нема                                              | нема                                                                                                                            |
| **Monefy / Spendee / 1Money / Money Lover** | pie/bar по категоріях, періоди                       | Money Lover: bar-тренд; решта — не підтверджено | лише manual scheduled (Spendee)                                                                                    | Spendee: місячний cash-flow overview              | нема (маркетинг без конкретики)                                                                                                 |
| **Emma**                                    | категорії+мерчанти, week/mo/q/yr/custom              | гортання минулих періодів                       | **дашборд підписок, детекція, алерт на підвищення ціни**, скасування                                               | income vs spending                                | частина в платних тарифах                                                                                                       |
| **Revolut**                                 | категорії (+кастомні), мерчанти                      | **multi-month тренд-лінії по категоріях**       | scheduled + trial-ending detection                                                                                 | —                                                 | **weekly-репорт пушем**; бюджети лише в платних                                                                                 |
| **Copilot Money**                           | категорії/мерчанти                                   | так                                             | так                                                                                                                | —                                                 | **алерти на аномальні витрати; бюджет-рекомендації з 3–6 міс історії (accept/adjust/reject)**; правило «завжди категоризуй так» |
| **PocketSmith / Kualto / Foreseenly**       | forecasting-first                                    | —                                               | основа прогнозу                                                                                                    | **прогноз балансу (до 30 р.) + what-if сценарії** | —                                                                                                                               |
| **Plaid (інфраструктура)**                  | —                                                    | —                                               | **евристика без ML**: групування опис+сума+каденс, поріг 3 входження, active/inactive, виключення habitual-покупок | —                                                 | —                                                                                                                               |

Ключовий факт для позиціювання: **вбудований mono дає лише відсотковий розріз по категоріях** — без трендів, порівнянь і підписок. Легкі трекери (Monefy-клас) аналітично не глибші за mono. Планка — Emma/Copilot/Revolut.

## 2. Що юзери цінують / шум (HN + агрегатори; Reddit напряму недоступний — застереження)

**Цінують:** одне просте число «скільки можна витратити сьогодні» (люди прямо обирають апки заради цього, бо повні дашборди «overwhelming»); контроль над категоризацією — правило «завжди категоризуй так» для продавця; проактивне планування важливіше за ретроспективні звіти.

**Шум:** перевантажені дашборди («reliable import + прості правила + чистий UI» цінніші, ніж апка «що робить все»); щоденний net-worth-трекінг («стрілка так швидко не рухається»); генеричні AI-фінпоради (CNBC: неточні/упереджені; «графіки безкорисні, якщо не міняють поведінку»).

**Найбільша скарга:** категоризація, яку треба виправляти щоразу заново — виправлення не застосовується до майбутніх однотипних транзакцій.

## 3. Ранжований шортлист для Фініка (без ML-інфраструктури, на локальних mono-даних)

1. **Порівняння місяць-до-місяця + тренд по категоріях** — 3–6-місячні bar-тренди, «цей місяць vs минулий» по кожній категорії. Дірка вбудованого mono, є всі дані, дешево. (Revolut-патерн)
2. **Детекція регулярних платежів/підписок** — Plaid-евристика без ML (групування нормалізований-опис+сума±10%+каденс, поріг 3 входження, виключити habitual типу продукти/кава); екран «Підписки» з сумою/міс + алерт при підвищенні ціни (Emma-патерн). NB: у фініку вже є `useRecurringDetectedInsight` — розширити, не дублювати.
3. **Підсилити «Можна сьогодні»** — формат, який юзери прямо шукають, і він у Фініку ВЖЕ є на Огляді (₴/день з фінплану). Зробити головним числом: у hub quick-stats, врахувати recurring-зобовʼязання з п.2 у розрахунку.
4. **Правила категоризації «завжди так»** — при зміні категорії транзакції продавця пропонувати «застосовувати до всіх майбутніх від X» (merchant→category правило; у фініку вже є AI merchant-підказка — доростити до явного правила). Закриває головну скаргу юзерів. (Copilot-патерн)
5. **Прогноз до кінця місяця** — «за поточним темпом витратиш ~X, план Y» на базі денного темпу + відомих recurring з п.2. Простий лінійний розрахунок, без ML. (Спрощений PocketSmith)
6. **Аномальні витрати** — «у Сільпо цього тижня 2× від звичного»: відхилення від ковзного середнього по категорії/продавцю, просте статправило. (Copilot-патерн)
7. **Weekly-підсумок пушем** — тижневий дайджест витрат (Revolut-патерн). NB: у Sergeant вже є weekly-digest механіка — інтегрувати, не будувати заново.
8. _(опційно)_ **What-if разова покупка** — «якщо витратиш X зараз — що з "можна сьогодні" до кінця місяця» (Kualto-патерн, найдешевша форма форекасту).

**Анти-фічі (свідомо не робити):** щоденний net-worth-графік, генеричні AI-поради без привʼязки до дії, перевантажений дашборд «усе одразу».

## 4. Джерела

Monobank: [speka.ua](https://speka.ua/life-hacks/u-zastosunku-monobank-onovlyat-rozdil-statistiki-yak-vin-viglyadatime-p68ejv), [rates.fm](https://rates.fm/ua-uk/banks/monobank-statistika-ta-analitika/), [ain.ua](https://ain.ua/2025/09/16/dasbord-monobanku/), [itc.ua](https://itc.ua/ua/novini/monobank-nastupnogo-tizhnya-otrimaye-povnistyu-onovlenij-rozdil-zi-statistikoyu-ta-analitikoyu-vitrat/), [mobanking.com.ua](https://mobanking.com.ua/uk/statistika/)
Emma: [help.emma-app.com/Analytics](https://help.emma-app.com/en/category/analytics-155lckn/), [emma-app.com/features/recurring-payments](https://emma-app.com/features/recurring-payments)
Revolut: [blog: spending analytics](https://www.revolut.com/blog/post/introducing-spending-analytics/), [subscriptions](https://www.revolut.com/en-US/subscriptions/), [budget planner](https://www.revolut.com/en-IE/best-budget-planner/)
Легкі трекери: [monefy — Google Play](https://play.google.com/store/apps/details?id=com.monefy.app.lite), [spendee.com](https://www.spendee.com/), [help.spendee.com](https://help.spendee.com/article/229-scheduled-transactions), [1moneyapp.com](https://1moneyapp.com/), [moneylover.me](https://moneylover.me/), [Report Definition](https://moneylover.zendesk.com/hc/en-us/articles/34533897137177-Report-Definition-and-Usage)
Recurring-методологія: [plaid.com/blog/recurring-transactions](https://plaid.com/blog/recurring-transactions/), [finexer blog](https://blog.finexer.com/recurring-transaction-detection-bank-data-apis/)
Forecast: [pocketsmith.com/tour/cash-flow-forecasts](https://www.pocketsmith.com/tour/cash-flow-forecasts/), [kualto.com](https://www.kualto.com/)
Copilot: [zenfinanceai](https://zenfinanceai.com/ynab-vs-copilot-ai/), [moneypatrol](https://moneypatrol.com/moneytalk/budgeting/ynab-vs-copilot/)
Думки юзерів: [HN #40108404](https://news.ycombinator.com/item?id=40108404), [HN #42256125](https://news.ycombinator.com/item?id=42256125), [HN #46566663](https://news.ycombinator.com/item?id=46566663), [CNBC про AI-поради](https://www.cnbc.com/2026/07/07/ai-personal-finance-advice.html), [teamblind](https://www.teamblind.com/post/what-does-your-personal-finance-app-lack-tskkxgh6)

## 5. Застереження

- «Що цінують юзери» — з HN/агрегаторів; прямий Reddit недоступний для фетчу — вибірка зміщена в бік технічної аудиторії.
- Verified-набір першого прогону активно спростував 5 тверджень про YNAB — позитивних фактів про його аналітику НЕ підтверджено, тому YNAB у таблиці відсутній.
- Фічі конкурентів дрейфують; дати перевірки — липень 2026.
