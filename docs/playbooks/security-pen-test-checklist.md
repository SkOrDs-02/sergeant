# Playbook: Security pen-test checklist for closed hardening cards

> **Last validated:** 2026-05-13 by @andrijvigrav. **Next review:** 2026-08-11.
> **Status:** Active

**Trigger:** треба підтвердити, що hardening-карта зі статусом `Closed` дійсно закриває описану атаку — наприклад, перед launch readiness gate, перед external pen-test engagement, або як квартальна репетиція pen-test reproduction-у.

## Owner surface

- Primary surface: `docs/security/hardening/**` + `docs/security/pen-tests/**`
- Coupled surface: `apps/server/src/{auth,http,modules}/**` (cards шипляться там)
- Governing skill: `sergeant-deploy-and-observability`

## Required context

- Перечитай [docs/security/hardening/README.md](../security/hardening/README.md), щоб бачити поточний backlog і severity-розподіл.
- Спочатку завантаж `sergeant-start-here`, потім `sergeant-deploy-and-observability` (operational setup) або `sergeant-server-api` (якщо doping код самого server).
- Майте під рукою staging Postgres (`STAGING_DATABASE_URL`) і staging `BETTER_AUTH_SECRET` — playbook вимагає production-like конфігу без таргета production trafic-у.

## Steps

### 1. Обери карти для sweep-у

- Відсортуй `docs/security/hardening/*.md` за `Status: Closed` + `Severity: High|Critical`.
- Вибери щонайменше всі **High** карти, що ще не мають transcript-у в `docs/security/pen-tests/` за поточний квартал.
- Перевір, що для кожної карти є PR-посилання у `Affected files` блоці — без referенс-PR sweep буде «писати з пам'яті», а це не репродукція.

### 2. Підніми production-like API локально

- `NODE_ENV=production`, `RAILWAY_ENVIRONMENT=production`, `DATABASE_URL=$STAGING_DATABASE_URL`, `BETTER_AUTH_SECRET=$STAGING_BETTER_AUTH_SECRET`.
- НЕ підкидай реальний Stripe/Anthropic/Groq ключ — використовуй staging-credentials або mocks.
- Перед стартом перевір startup-guards: налаштуй `AI_QUOTA_DISABLED=true` і впевнись, що сервер падає; потім зніми флаг.

### 3. Виконай атаку для кожної карти

- Для кожної H-карти (High severity, hardening): запиши **(а)** команду атаки, **(б)** очікуваний результат, **(в)** реально-спостережений результат, **(г)** залишковий ризик.
- Шаблон transcript-у бери з [`docs/security/pen-tests/2026-05-hardening-sweep.md`](../security/pen-tests/2026-05-hardening-sweep.md) — кожна H-карта в окремій секції з cURL-командами.
- Якщо атака **проходить** — це **STOP-condition**: відкривай інцидент через [`declare-incident.md`](./declare-incident.md), severity згідно з `incident-severity-policy.md`.

### 4. Перевір dev-side parity

- Карти, що мають дев-only-allowance (наприклад, H5 з `exp://`), мають бути перевірені окремо в dev-режимі: атака **проходить** — це OK; атака **блокується** — це може бути регресія в dev-experience і треба з'ясувати чому.
- Запиши обидва результати (prod-rejection + dev-acceptance) у transcript.

### 5. Оформи transcript

- Створи / онови `docs/security/pen-tests/YYYY-MM-<sweep-name>.md` із результатами.
- Додай рядок у `## Verification checklist` для кожної атаки + експліцитний `Observed (YYYY-MM-DD)` маркер.
- Якщо знайдено follow-up gap (наприклад, нема automated CI асерту) — заведи `Follow-ups` секцію + open GH issue + закидай у `docs/tech-debt/<surface>.md` якщо це довготривалий борг.

### 6. Маршрутизуй фоллов-ап

- Mock-test-only coverage → відкривай PR із real-Postgres / real-fixture e2e (як PR 3.2 / PR 3.3 ініціативи [0011](../initiatives/0011-foundation-adoption-and-process-discipline.md)).
- Залишковий ризик у самій карті → онови `Status` від `Closed` до `Closed (partial)` + перерахуй у §Deferred карти + лінкуй на новий tracker.
- Готовність до external pen-test → передай transcript у [`docs/launch/business/04-launch-readiness.md`](../launch/business/04-launch-readiness.md) як evidence-документ.

## Verification

- [ ] Для кожної обраної H-карти existуэ свіжий `Observed (YYYY-MM-DD)` рядок у transcript-і
- [ ] Production-like і dev-режим перевірені окремо для карт із dev-allowance
- [ ] Для кожної знайденої регресії або residual-gap-у відкрито follow-up issue / PR
- [ ] Transcript додано в `docs/security/pen-tests/` і залінкований з owning-картами

## When not to use this playbook

- Якщо карта ще не має `Status: Closed` — sweep буде лише спекуляцією; спершу шипи fix і unit-coverage.
- Якщо триває live security incident — використовуй [`declare-incident.md`](./declare-incident.md) і [`hotfix-prod-regression.md`](./hotfix-prod-regression.md).
- Якщо потрібна повноцінна third-party penetration test з contractual rules of engagement — playbook не покриває комерційний engagement; використовуй його як попередній sweep, що передує external контракту.

## Related playbooks and skills

- [`docs/security/pen-tests/2026-05-hardening-sweep.md`](../security/pen-tests/2026-05-hardening-sweep.md) — приклад transcript-у (H5/H6/H8/H9)
- [`declare-incident.md`](./declare-incident.md) — escalation-path коли атака проходить
- [`hotfix-prod-regression.md`](./hotfix-prod-regression.md) — швидке закриття регресії
- [`run-access-review.md`](./run-access-review.md) — перевірка privileged access перед sweep-ом
- Skill: `sergeant-deploy-and-observability`
