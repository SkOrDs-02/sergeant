# SPEC: Рефакторинг системи документації

> **Last touched:** 2026-09-06 by @Skords-01. **Next review:** 2026-10-06.
> **Status:** Closed

## Проблема

Документація розрослася до 701 tracked-файлу в кількох паралельних tracker-ах.
Частина правил і README суперечить ADR-0081, а активна робота розподілена між
`initiatives`, `planning`, `audits`, `tech-debt` і `superpowers`.

## Мета

Мати однозначну гібридну структуру для людей і агентів: продуктові модулі,
спільна інженерія, operations, design та governance мають власні домівки, а
активна робота ведеться через один каталог спек. Завершена робота зберігається
в Git-історії або ADR без локальних архівів-дублікатів.

## Рішення дизайну

- Цільова таксономія та правила вибору місця зафіксовані в
  [`documentation-architecture.md`](../../start/documentation-architecture.md).
- Основний робочий жанр — спека з перевірними критеріями; дашборди є похідними.
- Стиль — короткий український текст із поясненням причин і посиланням на
  канонічне джерело.
- Технічні твердження проходять повну звірку з кодом і конфігами; продуктові
  рішення не вигадуються під час міграції.
- Завершені аудити, ініціативи та плани прибираються з checkout після перевірки
  inbound-посилань, відповідно до ADR-0081.

## Поверхня змін

- `docs/` — нова карта документації, індекси, правила й міграція каталогів.
- `scripts/docs/` — генератори та перевірки шляхів/жанрів після перенесення.
- `AGENTS.md`, `.agents/skills/` — оновлення canonical links після кожної хвилі.
- Owner-скіл: `sergeant-spec`, `sergeant-tech-debt`, `sergeant-start-here`.

## Поза скоупом v1

- Зміна runtime-коду або продуктового UX.
- Переписування історичних ADR, якщо вони лише описують минулий стан.
- Створення локального `archive/` дубліката Git-історії.

## Верифікація

1. `pnpm lint:specs` — ця спека та всі активні спеки мають несучі секції.
2. `pnpm docs:check-links` — внутрішні посилання після кожної хвилі резолвляться.
3. `pnpm docs:check-open-work` — зведення будується лише з активних джерел.
4. `pnpm lint:governance-sync` і `pnpm docs:check-freshness-single-marker` —
   правила та lifecycle-метадані не розходяться.
5. Повторний запуск усіх генераторів не дає diff.

Фактичний evidence фінальної хвилі 2026-09-06:

- `pnpm docs:check-inventory` — 705 matrix entries, 701 baseline-файл,
  0 target collisions;
- `pnpm docs:check-links` — 11 021 внутрішнє посилання, 0 broken;
- `pnpm docs:check-paths` і `pnpm docs:check-repair-links` — 0 pending rewrite;
- `pnpm lint:specs` — 26 спек і 22 shape-тести пройшли;
- freshness coverage — усі tracked Markdown мають header, 558 файлів мають
  рівно один marker;
- `pnpm docs:check-playbook-schema` — 55 інструкцій; 53 playbook-и синхронні
  між INDEX і каталогом;
- `pnpm lint:archive-move-depth` — локальних archive-дерев немає;
- `pnpm lint:hard-rules-registry` — 17 правил синхронні;
- `pnpm lint:governance-sync` — 0 errors (warnings стосуються aspirational
  future-file references);
- `pnpm lint`, `pnpm format:check` і `pnpm build` — пройшли;
- загальний `pnpm check:typecheck-and-test` дійшов до runtime-тестів і впав на
  успадкованому дрейфі поза скоупом цієї спеки: Windows path assertions у
  server, mobile SQLite snapshots/очікування та strategic-goals migration test.

## Outcome

- Top-level групи фізично перенесені до `docs/start`, `product`,
  `engineering`, `operations`, `governance`, `design` і `work`.
- Активні спеки зведені до `docs/work/specs/`; open-work сканує один lifecycle
  root, а жанрові підкаталоги не є окремими tracker-ами.
- Додані inventory/path generators і перевірки, оновлені похідні dashboard,
  status, today, playbook та Codex-agent артефакти.
- Playbook і runtime runbook зведені до `docs/start/instructions/` з явним
  `Runtime-specific: yes|no`; модульний канон перенесений у
  `docs/product/modules/`.
- 99 локальних archive-файлів прибрано з checkout; усі потрібні inbound links
  переведені на immutable Git permalink. Hard Rule #23 блокує відновлення
  локальних archive-дерев.

## Закриті ризики

- Велика кількість inbound-посилань робить масове переміщення небезпечним;
  кожен move виконується окремою хвилею з link-check.
- Частина старих tracker-ів може містити унікальні докази; перед видаленням
  вони потрапляють у міграційну матрицю.
- Міграційна матриця покриває baseline і перевіряє target collisions;
  генератор показує нуль колізій та зберігає immutable URL для кожного remove.

## Інвентаризація v0

Початковий зріз містить **701 tracked-файл** у `docs/`. Це не є рішенням про
видалення: перед кожним move документ класифікується за жанром і перевіряється
на inbound-посилання.

| Поточний розділ  | Файлів | Перше цільове призначення   | Дія першої хвилі                                                  |
| ---------------- | -----: | --------------------------- | ----------------------------------------------------------------- |
| `start`          |     76 | `docs/start`                | Залишити compatibility-вхід, прибрати дубльовані жанрові правила  |
| `product`        |     43 | `docs/product`              | Згрупувати модульний канон і launch-матеріали                     |
| `engineering`    |     73 | `docs/engineering`          | Зберегти як спільні контракти, прибрати звіти зі статусом tracker |
| `operations`     |     61 | `docs/operations`           | Об’єднати playbook/runbook-каталог за runtime-specific ознакою    |
| `governance`     |    223 | `docs/governance`           | Зберегти ADR і чинні правила, вилучити скасовані дублікати        |
| `design`         |     54 | `docs/design`               | Прибрати твердження про retired AST-візуальні гейти               |
| `work`           |    165 | `docs/work`                 | Звести активні tracker-и до спеки, завершене прибрати з checkout  |
| кореневі індекси |      6 | відповідний цільовий розділ | Залишити лише похідні або навігаційні сторінки                    |

Міграційна матриця генерується командою `pnpm docs:gen-inventory` і зберігається
у [`data/documentation-inventory.json`](./data/documentation-inventory.json).
Перевірка drift — `pnpm docs:check-inventory`. Поле `target_collisions`
залишається fail-safe для майбутніх move; у виконаній міграції колізій немає.
