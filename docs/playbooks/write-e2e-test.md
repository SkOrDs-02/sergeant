# Playbook: Write or Debug a Playwright E2E Test

> **Last validated:** 2026-06-08 by @claude. **Next review:** 2026-09-06.
> **Status:** Active

**Trigger:** «Напиши E2E-тест на сценарій X» / «smoke-тест на критичний шлях» / «a11y-снапшот для нового екрана» / падає Playwright-спека в CI, а локально зелено, і треба зрозуміти чому.

## Owner surface

- Primary surface: `apps/web/tests/` (`tests/smoke/`, `tests/a11y/`, `tests/utils/`)
- Coupled surface: `apps/web/playwright.config.ts`, `apps/web/src/**` (тестований UI)
- Governing skill: `sergeant-e2e-testing`

---

## Контекст

Playwright-тести в Sergeant ганяються проти **preview-білда** (`vite build && vite preview`), а не проти dev-сервера — саме так працює CI, і тільки так результат відтворюваний. Сюїта живе у `apps/web/tests/` і розбита на `tests/smoke/` (auth + критичні шляхи) і `tests/a11y/` (axe-core снапшоти доступності). Конфіг — `apps/web/playwright.config.ts` (`workers: 1`, `trace: "retain-on-failure"`, спільний preview-сервер на всі спеки).

Перш ніж писати — завантаж skill `sergeant-e2e-testing` і прочитай його **8 золотих правил**. Цей плейбук — порядок виконання; правила-інваріанти живуть у skill і його `references/`.

---

## Decision Tree

**Q1: Це новий тест чи розслідування червоної спеки?**

- Новий happy-path / критичний шлях → [§1](#1-обрати-сюїту-і-стан) → [§5](#5-прогнати-локально-проти-preview)
- Новий a11y-снапшот → [§4](#4-a11y-снапшот-axe-core)
- Спека флапає (1 з N) у CI, локально зелено → **STOP** → [`stabilize-flaky-test.md`](./stabilize-flaky-test.md)
- Спека стабільно червона → [§6](#6-розслідувати-червону-спеку-через-trace)

**Q2: Як довести тест до потрібного стану застосунку?**

- Потрібен залогінений юзер / певна фаза онбордингу → seed через `seedFTUX` ([§2](#2-засіяти-стан-через-seedftux)). **Ніколи** не ганяй UI логіну/реєстрації в `beforeEach`.
- Потрібен детермінований API-відгук → мокай мережу ([§3](#3-детермінувати-мережу)), див. `references/network-mocking.md`.

---

## Steps

### 1. Обрати сюїту і стан

- Критичний шлях (auth, дашборд, навігація, онбординг) → `apps/web/tests/smoke/`.
- Перевірка доступності екрана → `apps/web/tests/a11y/`.
- Назву файлу тримай у форматі `<feature>.spec.ts`; дивись на сусідні спеки (`dashboard-health.spec.ts`, `onboarding-happy-path.spec.ts`) як на канон.
- Для auth-залежних тестів використовуй наявний storage-state (`tests/auth.setup.ts` + `tests/authState.ts`), а не власний логін.

### 2. Засіяти стан через `seedFTUX`

Стан застосунку сій у `localStorage` **до** навігації через `apps/web/tests/utils/seedFTUX.ts`. Доступні пресети: `"cold"`, `"pre-ftux"`, `"post-ftux"`, `"module-first-run"`. Це швидше за прохід UI і прибирає цілий клас флапів.

```ts
import { test, expect } from "@playwright/test";
import { seedFTUX } from "../utils/seedFTUX";

test("@critical дашборд показує баланс після онбордингу", async ({ page }) => {
  await seedFTUX(page, "post-ftux");
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
});
```

Правила селекторів (повний розбір — `references/selectors.md`):

- Спершу роль: `page.getByRole("button", { name: "..." })`.
- Запасний варіант — `getByTestId` лише коли ARIA-ролі недостатньо.
- **Ніколи** CSS-клас або `nth-child` — вони ламаються на рефакторі дизайн-системи.

### 3. Детермінувати мережу

Якщо тест залежить від API-відгуку — зроби його детермінованим. Коли мокати, а коли бити в реальний бекенд, і як інтегрувати MSW — у `references/network-mocking.md`. За замовчуванням критичні smoke-тести читають реальний preview-білд; мокай лише нестабільні зовнішні залежності.

### 4. a11y-снапшот (axe-core)

Для нового екрана додай спеку в `tests/a11y/`, яка проганяє axe-core. Єдиний дозволений візуальний baseline — `tests/a11y/ds-visual-qa.spec.ts`; для решти не коміть golden-скріншоти (конфіг тримає `screenshot: "only-on-failure"`).

### 5. Прогнати локально проти preview

Тести зобовʼязані бігти проти `vite preview`, не `vite dev`:

```bash
cd apps/web
pnpm build && pnpm preview &        # підняти preview-сервер (обовʼязково)
pnpm playwright test tests/smoke/   # smoke-сюїта
pnpm playwright test tests/a11y/    # a11y-сюїта
pnpm playwright test --ui           # інтерактивний режим для локального дебагу
```

Познач критичні (auth, онбординг) тести префіксом `@critical` в описі — CI вміє фільтрувати швидкий smoke через `--grep @critical`.

### 6. Розслідувати червону спеку через trace

Активний конфіг тримає `trace: "retain-on-failure"`. **Не** перемикай на `"on"` — це роздуває CI-артефакти. Для локального дебагу форсуй trace вручну:

```bash
pnpm playwright test path/to.spec.ts --trace on
pnpm playwright show-trace test-results/.../trace.zip
```

Як витягти trace-артефакт із CI, як читати timeline і де шукати Playwright Inspector — `references/traces-and-debugging.md`. Якщо причина червоного — таймінг (`waitForTimeout`, гонитва за елементом), заміни на web-first assertion (`await expect(locator).toBeVisible()`), яка авто-ретраїться.

---

## Verification

- [ ] Тест використовує web-first assertions (`await expect(locator)...`), а не `page.waitForSelector` / `page.waitForTimeout`.
- [ ] Стан засіяний через `seedFTUX`, а не проходом UI логіну/онбордингу в `beforeEach`.
- [ ] Селектори рольові (`getByRole`) або `getByTestId`; жодних CSS-клас/`nth-child`.
- [ ] Спека зелена локально проти `vite preview` (не `vite dev`).
- [ ] Критичні шляхи позначені `@critical`.
- [ ] Не змінено `workers` / `fullyParallel` без власного сервера на спеку; trace лишився `retain-on-failure`.
- [ ] Не закомічено golden-скріншоти поза `ds-visual-qa.spec.ts`.

## Notes

- `workers: 1` стоїть тому, що всі спеки ділять один preview-сервер. `fullyParallel: true` без власного сервера на кожну спеку = гонки і флап.
- Якщо спека флапає саме в CI — це окремий сценарій: йди в [`stabilize-flaky-test.md`](./stabilize-flaky-test.md), не «полагодь і забудь».
- Auth-fixture з `seedFTUX` + кукі Better Auth розписані в `references/auth-flow.md`; зміну самої auth-поведінки веде [`change-auth-flow.md`](./change-auth-flow.md).

## See also

- [stabilize-flaky-test.md](./stabilize-flaky-test.md) — коли спека червона лише в CI
- [add-new-page-route.md](./add-new-page-route.md) — новий екран, який цей тест покриває
- [change-auth-flow.md](./change-auth-flow.md) — якщо тест ламається через зміну логіну/сесії
- [AGENTS.md](../../AGENTS.md) — Pre-existing flaky tests, verification before PR
- `.agents/skills/sergeant-e2e-testing/SKILL.md` — 8 золотих правил + `references/`
