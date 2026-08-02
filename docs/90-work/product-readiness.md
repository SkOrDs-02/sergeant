# Готовність продукту й залишок робіт

> **Last touched:** 2026-08-01 by @claude (звірка з `origin/main` + прогін docs-гейтів + CI run 30710062786). **Next review:** 2026-09-01.
> **Status:** Active

Це ручний portfolio-зріз поверх автоматичного [`open-work.md`](../open-work.md).
Автоматичний файл відповідає на питання «які trackers мають відкритий lifecycle»,
а цей документ — «що реально можна робити зараз і що блокує готовність продукту».
Перейменований з `product-readiness-2026-07-18.md` — дата в імені гнила швидше за зміст.

## Вердикт (2026-08-01)

Продукт стоїть на порозі **закритої бети**, не публічного запуску. Код бети майже
готовий: спеки текстів, форм, груп і безпеки закриті на 2026-08-01, два блокери
web-QA виправлені міграціями 094/095, security-спека F1–F4 реалізована. Реліз
блокують три контури — у порядку близькості:

1. **`main` червоний.** Останній прогін ([30710062786](https://github.com/Skords-01/Sergeant/actions/runs/30710062786), 2026-08-01) валить
   `check`, `Test coverage`, `Critical-flow E2E` і `Secret scan`. Корінь як мінімум
   одного — міграція `094_routine_pk_text.sql` (uuid→text) без оновленого
   міграційного тесту. Без зеленого `main` бету відкривати не можна.
2. **Мультидевайсний sync не має acceptance-доказу.** Фази 1–2 у коді, але
   Testcontainers + два профілі E2E не проходили; Phase 3 (SSE) — design-only.
3. **Платіжний контур не має жодного живого платежу.** Код є, UA-провайдер
   (LiqPay/Plata), legal/ФОП і перший `subscriptions.plan = 'pro'` — ні.

Функціональна ширина висока, operational confidence — середня. Нові великі фічі
не пріоритет, доки ці три контури відкриті.

## Готове до виконання зараз

Черга = порядок. Кожен рядок самодостатній для агента: є поверхня, є доказ.

| #   | Задача                                                                      | Поверхня      | Skill                               | Доказ виконання                                                                                     |
| --- | --------------------------------------------------------------------------- | ------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | ✅ Міграційні тести під `094`/`095` (`uuid` → `text`)                       | `apps/server` | `sergeant-data-and-migrations`      | зроблено 2026-08-01: 050 + 035 зелені локально (14/14 на Testcontainers)                            |
| 2   | ⚠️ `Critical-flow E2E`: причину знайдено й полагоджено, тест іще не зелений | `apps/web`    | `sergeant-e2e-testing`              | зроблено 2026-08-02: аркуш редагування відкривається; лишився хвіст assertion-у — див. нижче        |
| 3   | ✅ `Secret scan (gitleaks)` — два false positive у web-QA доці              | крос          | `sergeant-security-audit`           | зроблено 2026-08-01: fingerprint-и в `.gitleaksignore` з поясненням                                 |
| 4   | Trivy: CRITICAL/HIGH у базовому образі `Dockerfile.api`                     | ops           | `sergeant-deploy-and-observability` | `Container image scan` зелений                                                                      |
| 5   | Deps-PR `react-router` 7 → 8 (мажор, блокує `pnpm check`)                   | `apps/web`    | `sergeant-tech-debt`                | `pnpm check` зелений + регресійний прогін роутингу                                                  |
| 6   | Sync acceptance: Testcontainers + dual-device E2E                           | крос          | `sergeant-e2e-testing`              | Транскрипт прогону в [`sync-client-wiring.md`](./planning/sync-client-wiring.md)                    |
| 7   | Офлайн-індикатор «чекає синхронізації» + Playwright `@extended`             | `apps/web`    | `sergeant-web-ui`                   | § «Відкрито» у [`beta-input-boundaries.md`](./planning/specs/beta-input-boundaries.md) закривається |
| 8   | Серверні межі в `nutrition` / `sync` endpoint-ах (примітиви вже є)          | `apps/server` | `sergeant-server-api`               | Той самий § «Відкрито»                                                                              |
| 9   | Durable-write правило для СТАРТ-блоку + E2E приймання                       | `apps/web`    | `sergeant-web-ui`                   | [`anonymous-local-first-persistence.md`](./planning/specs/anonymous-local-first-persistence.md)     |
| 10  | Попередження про локальність даних поза Фініком (знахідка №4 web-QA)        | `apps/web`    | `sergeant-web-ui`                   | § «Рекомендований порядок до бети» п.3                                                              |
| 11  | Червоний `@critical` №8 з web-QA                                            | `apps/web`    | `sergeant-e2e-testing`              | Той самий § п.4                                                                                     |
| 12  | S10-R2: рішення по custom-i18n + EN-locale contract; S10-R1 `/app` routing  | `apps/web`    | `sergeant-web-ui`                   | Parity-гейт; launch-екрани без hard-coded UA copy                                                   |
| 13  | Зниження baseline eslint-warnings (302 на `main`)                           | `apps/web`    | `sergeant-tech-debt`                | Менше warnings, нуль нових `eslint-disable`                                                         |

Рядки 1–4 — це і є «стабілізація release signal»: без них не можна ані злити
реліз-кандидат, ані чесно сказати тестерам, що збірка перевірена.

### Рядок 2 — причина знайдена, фікс у гілці, хвіст лишається

**Причина (доведено в Chromium 2026-08-02).**
[`useHistoryDismiss`](../../apps/web/src/shared/hooks/useHistoryDismiss.ts)
приїхав у `738fde6a9` (спека `beta-input-boundaries`, фаза 3) і давав кожному
`Sheet` власний запис в історії, а в cleanup-і робив `history.back()`. При
передачі аркуш→аркуш (`HabitDetailSheet` рендериться з `open={!editOpen}`, а
діалог редагування — з `open={editOpen}`, обидва в одному React-коміті)
cleanup першого стріляв `back()` **асинхронно** — уже після того, як другий
поклав свій запис. Трейс із живого прогону: `back → push → popstate`. popstate
прилітав новому аркушу, і той миттєво зачинявся. Вражало **всі** переходи
аркуш→аркуш, не лише Рутину.

**Фікс.** Один запис історії на весь шар діалогів + `queueMicrotask` у
cleanup-і: React синхронно проганяє всі cleanup-и й усі ефекти одним батчем,
тож на момент мікротаски вже видно, чи хтось перейняв шар. Якщо перейняв —
`back()` не викликається взагалі. Обґрунтування — в `AI-DANGER`-блоці файлу.

**Доказ.** Baseline (старий хук) падає на рядку 306 — діалог не зʼявляється.
З фіксом рядок 306 проходить, аркуш «Редагувати звичку» відкривається. Юніт:
26/26 у `useHistoryDismiss.test.tsx` + `Sheet.test.tsx` + `Modal.test.tsx`.

**Що лишилось.** Тест падає далі, на рядку 313: після збереження застосунок
повертає користувача в **аркуш деталей** (`open={!editOpen}`), той робить фон
`inert`, і кнопка списку `Деталі: …` стає невидимою для `getByRole`. На
скриншоті провалу видно аркуш деталей із уже **оновленою** назвою — тобто
перейменування спрацювало. Відкрите питання: assertion застарів (чекає на
список) чи разом із хуком приїхала друга зміна поведінки. Не визначено —
потребує окремого проходу. Юніт-тест хука навмисно несе позначку, що jsdom
віддає popstate синхронно й браузерний тайминг не відтворює.

## Потребує людини, не агента

| Робота                                                                                                                                               | Чому                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| F5 — зняти CSP `Report-Only` після 7 днів нуля violations                                                                                            | Доступ до продової телеметрії                                                                                             |
| F7 — IDOR-transcript на двох живих акаунтах                                                                                                          | Потрібен стенд і два акаунти; статику вже підтверджено                                                                    |
| F8 — перевірити `PUSH_INTERNAL_ALLOWED_IPS` і `API_SECRET`                                                                                           | Конфіг продакшену, не репозиторій                                                                                         |
| Ручна перевірка a11y на пристроях (VoiceOver / NVDA)                                                                                                 | [`accessibility-low-vision-beta.md`](./planning/specs/accessibility-low-vision-beta.md) — база готова, лишилась перевірка |
| Повний цикл пушів у Chrome desktop + реальний iPhone                                                                                                 | Профіль браузера мав `denied`; симуляція UA не рахується                                                                  |
| Чек-лист «Ресурси» з [`beta-testing-group.md`](./planning/specs/beta-testing-group.md) + прогін [`run-beta-wave.md`](./beta-launch/run-beta-wave.md) | Telegram, Tally, Drive, broadcast — операційні дії власника                                                               |

## Заблоковано рішенням або зовнішньою стороною

| Робота                                                                                         | Гейт                                                                                                        |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`receipt-scan.md`](./planning/specs/receipt-scan.md)                                          | Токен публічної частини ДПС                                                                                 |
| [`silpo-mcp-integration.md`](./planning/specs/silpo-mcp-integration.md)                        | Оферта Сільпо + формулювання приватності                                                                    |
| [`telegram-waitlist.md`](./planning/specs/telegram-waitlist.md)                                | Спека є, реалізації немає; черга — після старту бети                                                        |
| [`0022-import-from-external-trackers.md`](./initiatives/0022-import-from-external-trackers.md) | Founder-рішення по скоупу Фази 1, dedup і валютній нормалізації                                             |
| [`0010-revenue-first-launch.md`](./initiatives/0010-revenue-first-launch.md)                   | UA payment provider, legal/ФОП, перший живий платіж                                                         |
| Хвиля 2 беклогу (mobile-паритет подій, серверний `advice_id`)                                  | 2–4 тижні baseline у проді після #455 → найраніше ~2026-08-08                                               |
| Хвиля 3 беклогу (4 рядки)                                                                      | Рішення власника Р-1…Р-5 у § «На роздум власнику»                                                           |
| Хвиля 5: `F-MCC6011` «Готівка на руках»                                                        | Фіча за [ADR-0076](../04-governance/adr/0076-cash-on-hand-entity.md); баг подвійного обліку живий до релізу |
| Нативний mobile launch                                                                         | Web-first до traction — рішення власника 2026-07-30                                                         |

## Стан docs-гейтів (перевірено 2026-08-01)

Усі гейти зелені: `open-work`, `initiative-followups`, `today`, `status`,
`trust-badge`, `wip-limits`, `playbook-index`, `initiative-status-sync`,
`initiative-agent-ready`, `tech-debt-freshness`, `archive-move-depth`,
`check-freshness` (479 доків), `check-adr-index` (79 ADR), `discoverability`,
`check-links` (5001 внутрішнє посилання). `freshness-dashboard.html` був
розсинхронізований — перегенеровано в цій же гілці, це і валило `Docs automation`.

Два зовнішні посилання в [`finyk-analytics-research.md`](./audits/finyk-analytics-research.md)
не відповідають (`kualto.com`, `moneypatrol.com`) — non-fatal, документ у статусі
`Reference`, не чіпаємо.

## Як читати обсяг надалі

1. Відкрий цей документ для пріоритетів і launch-вердикту.
2. Відкрий [`open-work.md`](../open-work.md) для повного lifecycle inventory.
3. Бери роботу лише з таблиці «готове зараз» або з tracker-а з явним `Agent-ready: yes`.
4. Не відновлюй `Reference`, `Closed`, `Deprecated` або trigger-gated документ
   без нового доказу й конкретного successor tracker-а.
5. Оновлюй цей зріз після зміни launch blocker-а або щомісяця.
