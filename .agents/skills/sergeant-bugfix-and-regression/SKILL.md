---
name: sergeant-bugfix-and-regression
description: Use when fixing a Sergeant bug, regression, flaky test, broken deploy, or production issue — even if the fix seems obvious, always reproduce first; UA: фіксиш баг, регресію, флакі-тест, зламаний деплой.
lang: uk
lang-reason: Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар.
---

# Bugfix і регресії в Sergeant

Не патч баг наосліп. Спершу root cause, потім failing-перевірка, що демонструє причину, потім мінімальний фікс саме в корені.

## Залізне правило

Жоден фікс не виливається без зафіксованого root cause і failing-перевірки, що показує саме цю причину. Симптом-фікс — це провал, навіть якщо тести зелені.

## Чотири фази

Виконуй послідовно. Не перестрибуй фазу, навіть коли баг здається очевидним.

### Фаза 1 — Root cause investigation

1. Уважно читай помилки: stack trace повністю, file path, lineno, error code. Часто там же і відповідь.
2. Відтвори стабільно: точні кроки, кожен раз, на чистому стані. Якщо не відтворюється — збирай більше даних, а не вгадуй.
3. Звір recent changes: `git log`, `git diff` від останньої робочої точки, нові залежності, env-зміни.
4. Multi-component issue (server → `packages/api-client` → web; mobile → MMKV → server; HubChat tool → executor → prompt cache) — додай diagnostic-логи на кожній межі, прокатай раз, аналізуй evidence. Не починай гіпотези доки не знаєш, на якому шарі ламається.
5. Трасуй data flow назад до джерела поганого значення. Фікс — у джерелі, не на симптомі. Якщо bigint впав у `number` без coercion — корінь у серіалізаторі, не на UI.

### Фаза 2 — Pattern analysis

1. Знайди working example поруч: інший роут у тому ж `apps/server/src/routes/`, інший hook на `finykKeys`, інша міграція в `apps/server/src/migrations/`. Що в ньому відрізняється?
2. Якщо реалізуєш канонічний патерн (RQ keys factory, серіалізатор з bigint-coercion, двофазна міграція з DROP, Pino-redaction policy) — прочитай canonical reference повністю, не сканом. Деталь, яку «можна пропустити», — типовий корінь.
3. Перерахуй усі відмінності між working і broken, навіть «несуттєві». Заздалегідь не вирішуй, що щось не може мати значення.

### Фаза 3 — Гіпотеза і перевірка

1. Сформулюй одну гіпотезу письмово: «Думаю причина — X, бо Y».
2. Мінімальна зміна, що перевіряє саме цю гіпотезу. Одна змінна за раз.
3. Не спрацювало → нова гіпотеза. Не нашаровуй фікси, не «спробуй ще одне для надійності».
4. Не розумієш частину системи — скажи це прямо і досліджуй (`grep`, читай сусідній код, питай у власника шляху з `AGENTS.md`), а не імпровізуй.

### Фаза 4 — Implementation

1. Failing-перевірка перш ніж змінювати поведінку: Vitest/Jest, contract-тест для API-форми, вивід команди міграції, `curl`-відтворення для server- або HubChat-flows, або repro-нотатки для браузера/мобільного, якщо автоматизованого покриття ще немає.
2. Визнач поверхню-власника і завантаж її Sergeant-skill перш ніж писати фікс.
3. Імплементуй найменший фікс, що знімає корінь, без зайвих правок поруч.
4. Перепрогон оригінального failure + однієї сусідньої regression-перевірки, щоб переконатися, що фікс не зламав суміжний інваріант.

## Червоні прапорці

- «Баг очевидний, швидко запатчу»
- «Додам тести після фіксу»
- «Не можу відтворити, але знаю, який рядок»
- «Зроблю два фікси одразу — там і там, щоб не повертатися»
- «Закоментую assert або skip-ну тест, поки розберуся»
- «Просто зловлю exception і залогую — пройде»
- «Поверну зміну Х, бо після неї почалося» (без розуміння, що саме в Х було коренем)

Якщо чуєш такі думки — стоп, повертайся у Фазу 1.

## Куди роутити далі

- флакі або зламана UI-state → `sergeant-web-ui`
- регресія серіалізатора чи роута → `sergeant-server-api`
- schema- або deploy-крах → `sergeant-data-and-migrations`
- mobile-only поведінка → `sergeant-mobile-expo`
- chat-tool fail → `sergeant-module-ai`

## Verification gate

Перед claim «fixed» або «done» — канонічний гейт [`sergeant-verify-before-done`](../sergeant-verify-before-done/SKILL.md). Без свіжого evidence (command + вивід + exit code) completion claim заборонений.

Для багфіксу вирішальний рядок його таблиці — **«Bug fixed» доводиться повторним запуском початкового симптому**, а не тим, що код змінився; а **«Regression covered» — переходом red→green**: тест має падати ДО фіксу і проходити ПІСЛЯ. Зелений тест, який ніколи не бачили червоним, нічого не доводить.

Коли фікс іде в PR — додатково `sergeant-review-and-merge` § Verification gate (merge-state, evidence у PR-коментарі).

## Playbooks

- `docs/00-start/playbooks/hotfix-prod-regression.md` — triage і фікс production-регресій.
- `docs/00-start/playbooks/declare-incident.md` — коли баг доростає до рівня інциденту.
- `docs/00-start/playbooks/write-postmortem.md` — postmortem постфактум.
- Каталог: `docs/00-start/agents/agent-skills-catalog.md`.
