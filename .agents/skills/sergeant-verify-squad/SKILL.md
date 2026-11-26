---
name: sergeant-verify-squad
description: "Use when a claim about the running app needs independent evidence — spawns oracle-worker agents and one adversarial oracle-verifier; UA: оракул розрахунків, робітник і перевіряльник, незалежна перевірка знахідок."
lang: uk
lang-reason: "Body is Ukrainian per Hard Rule #15 (internal docs in Ukrainian); the `description:` carries an EN trigger phrase plus the `; UA:` clause so tool-routing stays stable across LLM providers whose attention biases toward English. See `sergeant-writing-skills` § Грамар."
---

# Verify squad: робітник і незалежний перевіряльник

Цей skill запускає **робітників** (`oracle-worker`), які добувають докази на живому стенді, і одного **перевіряльника** (`oracle-verifier`), який атакує їхній результат. Знахідка вважається знахідкою лише після вердикту перевіряльника.

Сквад існує через три зриви прогону `full-2026-11-25` (реєстр у `docs/work/specs/audits/verification/findings.json`):

- агент сам перевірив власний висновок і записав дефект, якого не було (`FULL-20261125-SEC-1`: друга сесія на момент зміни пароля не існувала);
- оракул серій Рутини повторив правило з коду, тож збіг доводив лише, що код відповідає сам собі;
- робітник після звіту лишив фоновий таймер і чотири рази надіслав той самий звіт.

## Коли завантажувати

Завантажуй, коли:

- треба довести, що розрахунки модуля сходяться (суми, відсотки, серії, тоннаж) — «оракул розрахунків»;
- заявлено дефект, який дорого записати чи лагодити помилково (втрата даних, синк, гроші);
- прогін верифікації з [`docs/engineering/testing/verification/README.md`](../../../docs/engineering/testing/verification/README.md) вимагає незалежного доказу для картки `CALC-*` чи `DATA-*`.

**Не завантажуй** для звичайних тестів і типів (це `sergeant-qa-squad`), для ревʼю дифу (це `sergeant-review-squad`) і для задачі, де достатньо одного прогону одного лейну.

## Передумови

1. Стенд піднятий і перевірений **до** запуску агентів: API, прод-білд web у `vite preview`, база. Рецепт — [`docs/engineering/testing/verification/local-environment.md`](../../../docs/engineering/testing/verification/local-environment.md). Агенти стенд не піднімають і не перезбирають.
2. Кожному робітнику своя тека для результатів поза деревом репо і свій тестовий акаунт.
3. Відомі пастки стенда вписані в доручення: банер згоди на аналітику, ліміти auth, затримка синку, порожній стан на холодному старті.

## Spawn рецепт

**Крок 1 — робітники паралельно**, по одному на модуль чи потік (Claude Code: `Agent` tool, тип `oracle-worker`):

```
Use the oracle-worker subagent definition, one instance per module
(nutrition, routine, fizruk). Run them in parallel in the background.
Give each: the module, the stand URLs and DB access, the environment
traps, the minimum list of checks, and its own output directory.
```

**Крок 2 — перевіряльник, коли всі робітники відзвітували** (тип `oracle-verifier`):

```
Use the oracle-verifier subagent definition. Give it the output
directories and the list of claimed defects as claims to test,
not as conclusions. Ask it to rule each one CONFIRMED / REFUTED /
NOT VERIFIED.
```

Перевіряльника не запускай паралельно з робітниками: йому потрібні їхні файли.

## Доручення робітнику: що має бути в тексті

- мета і заборони (продуктовий код, коміти, git);
- адреси стенда і спосіб читати базу;
- пастки середовища;
- мінімальний перелік перевірок, включно з межами (тиждень через понеділок, порожній день, редагування і видалення);
- тека і форма результату: `result.json` з `{check, inputs, expected, actual, verdict, note}`;
- вимога розрізняти дефект застосунку і помилку власного сценарію.

Субагент не бачить розмови: чого немає в дорученні, того він не знає.

## Synthesis protocol

1. Чекай звіти **всіх** робітників і вердикти перевіряльника.
2. Таблиця по модулях: збіглося / розбіжності / не піддається перевірці, і чи довіряє перевіряльник результату.
3. Кожна заявлена знахідка з вердиктом перевіряльника. У реєстр знахідок іде лише `CONFIRMED`; `NOT VERIFIED` лишається спостереженням із причиною.
4. Окремо: чого сквад не покрив.

## Завжди покривай

- Очікуване рахується з вхідних даних, а не з коду чи бази застосунку.
- Кожна знахідка відтворена перевіряльником на свіжих даних.
- Правило з канону (`docs/product/modules/*.md`) важить більше за правило з реалізації.
- Явно назване непокрите: «не перевіряли» і «збіглося» не мають виглядати однаково.

## Червоні прапорці

- «Робітник написав pass — значить сходиться» → pass робітника не є доказом; перевір хоча б вибірково.
- «Дам перевіряльнику висновки, щоб було швидше» → він їх підтвердить. Давай матеріали.
- «Оракул узяв формулу з коду» → це порівняння по колу. Формула має йти з канону або з арифметики.
- «Знахідка очевидна, запишу одразу» → саме так з'явилась хибна `FULL-20261125-SEC-1`.
- «Агент відзвітував удруге тим самим текстом» → він зациклився на власній фоновій задачі; зупини його, результат уже у файлах.
- «Запис зник після закриття браузера» → спершу виключ артефакт сценарію: чи встиг push.

## Поза межами цього squad-у

Unit-тести й типи (→ `sergeant-qa-squad`), ревʼю дифу проти Hard Rules (→ `sergeant-review-squad`), виправлення знайденого (→ module-owner або `sergeant-bugfix-and-regression`), запис прогону в реєстр (→ `pnpm verification`, див. README верифікації).

## Playbooks

- [`docs/start/instructions/run-squad-verify.md`](../../../docs/start/instructions/run-squad-verify.md) — покроковий рецепт
- [`docs/start/agents/orchestration-guide.md`](../../../docs/start/agents/orchestration-guide.md) — коли який режим оркестрації брати
- [`docs/start/agents/agent-skills-catalog.md`](../../../docs/start/agents/agent-skills-catalog.md) — каталог всіх skills
