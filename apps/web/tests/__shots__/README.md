# Знімальний сценарій інвентарю дизайну

> **Last touched:** 2026-11-25 by @claude (кадри сторінок модулів і «Звʼязків» у `landing.spec.ts`). **Next review:** 2027-04-22.
> **Status:** Scaffolded

Кадри 30 маршрутів і аркуша Sergeant web (390 × 844, світла й темна, 60 кадрів; `/fizruk/plan` прибрано у v3.2, бо такої сторінки немає і адреса рендерила Огляд) для порівняння «до / після» редизайну. Цим сценарієм знято інвентар [`2026-10-18-design-v3-1-inventory.md`](../../../../docs/work/specs/audits/2026-10-18-design-v3-1-inventory.md) і фінал спеки [`redesign-v3-1.md`](../../../../docs/work/specs/planning/redesign-v3-1.md). Це не тест і не гейт: асертів немає, golden-кадрів у репо немає, кадри лягають поза git.

## Запуск

```bash
# 1. prod-білд із сід-сценаріями (без них `applyScenario` не має чого засіяти)
VITE_E2E_SEED=true pnpm --filter @sergeant/web exec vite build
# 2. preview на вільному порту
pnpm --filter @sergeant/web exec vite preview --port 4173 --strictPort --host 127.0.0.1
# 3. знімання (інший термінал)
SHOTS_OUT=/шлях/до/кадрів pnpm --filter @sergeant/web shots
```

- `PW_BASE_URL` - адреса preview, якщо порт не 4173.
- `SHOTS_OUT` - тека кадрів, за замовчуванням `apps/web/test-results/shots` (gitignored).
- `SHOTS_ONLY=hub,hub-settings` - лише названі маршрути.

## Межі

- Конфіг [`playwright.shots.config.ts`](../../playwright.shots.config.ts) має власний `testDir`; інші Playwright-конфіги дивляться в `tests/a11y`, `tests/smoke`, `tests/mobile` тощо, Vitest - лише в `src/**`, тож сюди не заходить жоден лейн.
- Світи (`finyk-month`, `nutrition-day`, `routine-streaks`, `fizruk-active-session`, `empty`) беруться з `tests/fixtures/worlds` через `tests/utils/scenario.ts`.
- Паузи в сценарії навмисні: знімальний прогін не має асерту, на який можна чекати.

## Сценарій «зараз / пропоную» (v3.2)

[`proposals.spec.ts`](./proposals.spec.ts) знімає для позицій 01-18 інвентарю [`2026-10-23-redesign-v3-2-review.md`](../../../../docs/work/specs/audits/2026-10-23-redesign-v3-2-review.md) пару кадрів: `*-before.png` (живий екран) і `*-after.png` (той самий екран після DOM-правок, що імітують погоджену пропозицію зі спеки [`redesign-v3-2.md`](../../../../docs/work/specs/planning/redesign-v3-2.md)). Запуск той самий, що вище, крок 3:

```bash
PROP_OUT=test-results/proposals pnpm --filter @sergeant/web exec playwright test --config playwright.shots.config.ts proposals.spec.ts
```

- `PROP_ONLY=04-choice-borders,16-hub-now` - лише названі позиції.
- `PROP_FAST=1` - коротша пауза після сіду, щоб зловити тост віхи серії (позиція 14).
- Коли позицію закрито в коді, її `mutate` стає no-op, і кадри «до / після» збігаються: так сценарій служить приймальним.

## Кадри лендінгу (v3.2)

[`landing.spec.ts`](./landing.spec.ts) знімає кадри лендінгу і пише їх як webp (quality 82, 780 × 1688, тобто 390 × 844 при DPR 2) у `apps/landing/public/screens/`. Файли комітяться: лендінг збирається без Playwright.

| Кадр                | Сторінка лендінгу | Світ              | Що на кадрі                                                                                  |
| ------------------- | ----------------- | ----------------- | -------------------------------------------------------------------------------------------- |
| `hero-finyk.webp`   | головна, hero     | `landing-world`   | Огляд Фініка із заданим планом місяця (60 000 / 45 000)                                      |
| `hero-routine.webp` | головна, hero     | `landing-world`   | Огляд Рутини, пʼять звичок виконано                                                          |
| `finyk.webp`        | `/hroshi`         | `landing-world`   | той самий Огляд Фініка з планом: «сьогодні ще можна», капітал, операції за день              |
| `nutrition.webp`    | `/yizha`          | `nutrition-day`   | Огляд Їжі: прийоми за день, БЖВ, тиждень ккал, вода                                          |
| `routine.webp`      | `/zvychky`        | `routine-streaks` | Денний звіт за вчора: три виконані звички і пропуск «Розтяжки» з причиною, що не ламає серію |
| `fizruk.webp`       | `/trenuvannia`    | `landing-world`   | підсумок завершеного тренування `e2e-workout-full` (`/fizruk/workout/<id>`)                  |
| `zvyazky.webp`      | `/zvyazky`        | `landing-world`   | вкладка «Звʼязки» (`/?tab=reports`): картка звʼязку Фінік × Рутина і закономірність          |

Коли змінюється вигляд одного з цих екранів, кадри перезнімають тим самим білдом і запуском, що вище (кроки 1 і 2), далі:

```bash
pnpm --filter @sergeant/web exec playwright test --config playwright.shots.config.ts landing.spec.ts
```

- `LANDING_OUT` - тека запису, за замовчуванням `../landing/public/screens`.
- `LANDING_ONLY=routine,zvyazky` - лише названі кадри.
- Світ анонімний і без бекенду, тож сценарій прибирає з кадру банер «Дані лише на цьому пристрої» і кнопку черги синхронізації; решта екрана без правок.
- Годинник браузера стоїть на `Europe/Kyiv`. На UTC-хості біля півночі Фінік (київська доба) і Рутина (доба пристрою) розходились на день, і картка звʼязку зникала.
- Числа на кадрах залежать від дати прогону (день місяця, вікно 60 днів), тож після перезнімання звір `alt` на сторінках лендінгу з кадром.
- `landing-world` бере лише цей сценарій; `routine-streaks` і `nutrition-day` спільні з [`shots.spec.ts`](./shots.spec.ts), їх не правимо під лендінг.
