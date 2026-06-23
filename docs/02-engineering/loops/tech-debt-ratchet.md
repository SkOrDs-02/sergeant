# Tech-debt ratchet — вкладені цикли (nested loops)

> **Last touched:** 2026-06-23 by @claude. **Next review:** 2026-09-21.
> **Status:** Active

Runbook для зниження технічного боргу в пакеті як **ланцюг однозадачних
циклів** (nested loops). Кожна петля зрізає свій метрик-baseline і тримає
`pnpm check` зеленим — «зрізання» в одному пакеті не протікає регресом у
сусідній. Концепт «loop engineering» (Кермо → Двигун → Датчик → Гальмо) —
див. розмову-першоджерело; тут — виконавчий шар під реальні команди Sergeant.

Governing skill: [`.agents/skills/sergeant-tech-debt`](../../../.agents/skills/sergeant-tech-debt/SKILL.md).

## Чому ланцюг, а не один великий `/goal`

Одна петля = одна вузька мета + свій **дешевий** датчик. Якщо все робити
одним `/goal pnpm check`, агент розмазує увагу й ловить goal drift на 40-му
кроці. Розбивши на вкладені петлі, кожна шестерня крутиться лише до свого
гейта (Loop 3 навіть не запускає web-тести), а вихід однієї = вхід наступної.

```
Loop 1: dead code ──► Loop 2: eslint baseline ──► Loop 3: strict-флаг ──► Loop 4: фінал-gate
```

Між шестернями обовʼязково стоїть **окремий checker** (`qa-*` / review-агент),
не той агент, що писав — автор завжди занадто добрий до власної роботи.

## Інвентар боргу — інструменти, не інтуїція

| Метрика            | Команда                            | Що ловить                                        |
| ------------------ | ---------------------------------- | ------------------------------------------------ |
| Мертвий код        | `pnpm knip`                        | unused файли/депи (експорти `exclude` у конфізі) |
| ESLint suppression | `eslint.baseline.js` + `pnpm lint` | правила, заглушені до ввімкнення                 |
| Strict-флаги       | `pnpm strict:coverage`             | пакети без `noUncheckedIndexedAccess` тощо       |
| Фінальний гейт     | `pnpm check`                       | format + lint + typecheck + test + build         |

## Знімок реального боргу (2026-06-23)

> Запускай датчик, а не вгадуй ціль. Станом на зріз:

- **`pnpm knip` по всьому monorepo — 0 знахідок.** Loop 1 зараз без цілі →
  цінний як повторюваний вартовий, не разовий прохід.
- **`eslint.baseline.js` — 9 заглушених записів**, усі `react-hooks` v7 /
  `react/prop-types`, тобто жива ціль Loop 2 = **`apps/web`** (не api-client).
- **`pnpm strict:coverage` — `noUncheckedIndexedAccess` 100% (13/13).**
  Первісна ціль Loop 3 уже закрита скрізь. Лишився борг: **`apps/mobile`** без
  `exactOptionalPropertyTypes` і `noPropertyAccessFromIndexSignature`.
- **`@sergeant/api-client` — повністю чистий** (knip 0, усі strict-флаги on,
  жодного baseline-запису). Ratchet саме на ньому = no-op; це теж валідний
  результат — петля стартує з вимірювання й одразу проходить усі датчики.

Мораль: перш ніж запускати ланцюг, зніми власний знімок — борг рухається.

## STATE.md — спина ланцюга

Скопіюй блок у `STATE.md` в корені репо (або `.claude/`) перед запуском.
Агент дописує його після кожної петлі; завтрашній прогін **продовжує**, а не
стартує з нуля.

```markdown
# Tech-debt ratchet · <пакет>

> Status: Active

## Goal (весь ланцюг)

Зрізати борг у пакеті, НЕ зламавши `pnpm check`. Кожна петля має числовий датчик.

## Старт-метрики (заповнити ПЕРЕД Loop 1)

- knip dead files/deps: <N>
- eslint.baseline.js записів, що бʼють по пакету: <N>
- strict:coverage — флаги, яких бракує: <список>

## Done loops: —

## In progress: —

## Lessons (писати сюди, не в чат): —
```

## Драйвер ланцюга

Петлі запускати **послідовно**, кожну з checker'ом. Між ними — апдейт `STATE.md`.

### Loop 1 · Мертвий код — `sergeant-tech-debt`

```
/goal pnpm knip не показує dead files/deps у <пакеті>
       AND pnpm --filter <пакет> lint && typecheck && test зелені
```

- **Двигун:** `pnpm knip` → для кожної знахідки застосувати lifecycle-guard зі
  скіла (`@scaffolded` → не чіпати; <90 днів → `@deprecated` + `@removeBy`;
  інакше `grep -rn "<symbol>"` по всьому monorepo, тоді видалити).
- **Датчик:** `pnpm dead-code:files` (поважає `@scaffolded`) **AND** пакетні
  `lint`/`typecheck`/`test`.
- **Гальмо:** knip-clean по пакету **АБО** 5 ітерацій без прогресу → ескалація.

### Loop 2 · ESLint suppression ↓

```
/goal на 1 запис менше в eslint.baseline.js (що бʼє по <пакету>)
       AND pnpm lint зелений
```

- **Двигун:** вибрати один disabled/warning-запис → виправити порушення в коді
  → прибрати саме цей запис із `eslint.baseline.js`. **Ніколи** не прибирати
  запис без фіксу — це тихо вмикає порушення деінде.
- **Датчик:** `pnpm lint` зелений + diff показує −1 запис, не +1.
- **Гальмо:** 1 запис закрито (ratchet робить по одному) або 5 ітерацій.

### Loop 3 · Strict-флаг

```
1. pnpm strict:coverage   → взяти пакет X, якому бракує флага
2. /goal pnpm --filter X typecheck зелений із <флагом>:true у tsconfig
```

- **Двигун:** додати флаг у `tsconfig.json` пакета → додати guard'и (напр.
  `arr[i]` → перевірка на `undefined` для `noUncheckedIndexedAccess`).
- **Датчик:** `pnpm --filter X typecheck` зелений.
- **Гальмо:** 5 ітерацій → якщо лишилось <5 помилок, вони часто потребують
  думки → ескалація людині.

### Loop 4 · Фінал — checker (`contract-reviewer` для triplet-пакетів)

```
/goal pnpm check зелений AND жоден baseline/тест не виріс
```

- **Датчик:** повний `pnpm check` + (для api-client/server) `contract-reviewer`
  підтверджує цілість triplet: server shape ↔ `api-client` типи ↔ contract-тест
  ([Hard Rule #3](../../04-governance/governance/rules/03-api-contract-server-client-test.md)).
- **Гальмо:** червоно → діагноз людині, не нескінченний фікс.

## Чому це безпечно

На кожній петлі датчик містить `AND <пакетний lint/typecheck/test>`, а
фінальна — повний `pnpm check`. Регрес у сусідньому пакеті не пройде непоміченим.
