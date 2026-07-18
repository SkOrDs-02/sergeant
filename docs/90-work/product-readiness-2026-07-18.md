# Готовність продукту й залишок робіт — 2026-07-18

> **Last validated:** 2026-07-18 by Codex. **Next review:** 2026-08-18.
> **Status:** Active

Це ручний portfolio-зріз поверх автоматичного [`open-work.md`](../open-work.md).
Автоматичний файл відповідає на питання «які trackers мають відкритий lifecycle»,
а цей документ — «що реально можна робити зараз і що блокує готовність продукту».

## Вердикт

Sergeant перебуває на стадії **функціонального web beta / pre-launch**, а не
production-ready launch. Основні модулі й інженерна основа вже реалізовані,
але реліз для платних користувачів блокують три контури:

1. повний multi-device sync ще не має завершеного локального й production E2E;
2. billing-код існує, але live Stripe, legal/ФОП і перший реальний платіж не
   пройшли acceptance;
3. `main` не має стабільно зеленого release signal: останній snapshot показав
   failures у coverage, links, docs automation і server integration.

Функціональна ширина продукту висока, але operational confidence середня.
Тому нові великі фічі не є пріоритетом до закриття цих трьох контурів.

## Що готове до роботи зараз

| Черга | Робота                                                                                          | Готовність                                  | Наступний доказ                                                                                                     |
| ----- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| P0    | [`sync-client-wiring.md`](./planning/sync-client-wiring.md)                                     | Ready після локального verification handoff | Testcontainers, два профілі/device E2E, `pnpm check`; потім закрити Phase 2 і перейти до pull/SSE                   |
| P0    | Стабілізація release signal                                                                     | Ready                                       | Розібрати актуальні failures `main`, відділити flaky/baseline від regressions, повернути обов'язкові checks у green |
| P1    | S10-Q1 mutation-testing workflow                                                                | Ready                                       | Weekly/manual workflow, tier-1 score ≥ 70%, artifact retention                                                      |
| P1    | S10-T2 bundle cuts                                                                              | Ready, але після P0                         | Підтверджений size report і знижений budget без UX-регресії                                                         |
| P1    | Повний EN-locale contract із S10-R2                                                             | Ready                                       | Parity gate та критичні launch screens без hard-coded UA copy                                                       |
| P2    | [`ponytail-packages-cleanup-2026-07.md`](./planning/specs/ponytail-packages-cleanup-2026-07.md) | Ready пакетами WP1→WP5                      | Окремі scoped PR, тести кожного package, вимір видаленого коду                                                      |
| P2    | Tech-debt burndown                                                                              | Ready вибірково                             | `eslint-disable` cleanup і аудит реальних rate-limit gaps; не брати trigger-gated пункти                            |

## Не брати зараз

| Робота                          | Причина                                                        | Умова активації                                                  |
| ------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------- |
| Initiative 0003 Phase 7         | Data/time-gated                                                | 8 тижнів zero signal або 2026-08-04, потім повторна перевірка    |
| Initiative 0022 imports         | Немає founder-рішення по scope, dedup і currency normalization | Зафіксовані рішення й Phase 1 fixtures                           |
| Stack Pulse speculative cards   | Це травневі design notes, а не поточний backlog                | Конкретний incident, security finding або dependency trigger     |
| Native mobile launch            | Web-first рішення до traction                                  | Стабільний web, реальні користувачі й окремий mobile launch call |
| Post-launch monetization extras | Немає baseline paid funnel                                     | Перший live платіж і 30-денні conversion/cost metrics            |

## Зовнішні блокери

- live Stripe Product/Price, webhook і production smoke;
- legal pages, ФОП та payment-provider acceptance;
- Apple/Google/Sentry/EAS credentials, де код уже готовий;
- production telemetry для умовних performance/worker follow-up-ів;
- ручне branch-protection увімкнення після стабільного Lighthouse baseline.

Ці пункти не можна маскувати під інженерну чергу: вони потребують дії власника
або доступу до зовнішнього сервісу.

## Що було застарілим або мертвим у `docs/90-work`

Під час звірки 207 файлів виправлено такі класи drift:

- завершені storage stages помилково мали статус `Active`;
- dated audit snapshots і execution reports лишалися відкритою роботою;
- повторювані browser/audit loop-и рахувалися як задачі, хоча це протоколи;
- майбутні `2026-08-XX` roast-заготовки не мали дати або commitment;
- Stack Pulse містив trigger-gated і вже shipped картки в активній черзі;
- Expo SDK 53 plan застарів відносно актуальних dependency PR;
- founder-feedback audit лишався активним після merge PR #304, #306 і #307.

Після lifecycle reconciliation автоматична черга зменшилась з **70 до 34**
відкритих документів. Це ще не 42 незалежні задачі: launch-документи й tech-debt
registries агрегують багато пунктів, а частина відкритого залежить від рішення або
зовнішньої інфраструктури.

## Як читати обсяг надалі

1. Відкрий цей документ для пріоритетів і launch verdict.
2. Відкрий [`open-work.md`](../open-work.md) для повного lifecycle inventory.
3. Бери роботу лише з таблиці «готове зараз» або з tracker-а з явним
   `Agent-ready: yes`.
4. Не відновлюй `Reference`, `Closed`, `Deprecated` або trigger-gated документ
   без нового доказу й конкретного successor tracker-а.
5. Оновлюй цей зріз після зміни launch blocker-а або щомісяця.
