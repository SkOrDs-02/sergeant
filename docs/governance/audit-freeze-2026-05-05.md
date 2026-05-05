# Audit-freeze 2026-05-05 → 2026-06-02

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-06-02.
> **Status:** Active (4 weeks)

> **Що це.** Тимчасова заморозка створення нових audit/initiative/governance документів. Працює як **process-level rate-limiter** на час, поки `main` повертає в баланс **product velocity ↔ docs velocity**.

> **Контекст.** На 2026-05-05 в репо: 12 активних `docs/initiatives/`, 12 audit-документів у `docs/audits/`, 334 markdown-файли в `docs/`. AGENTS.md — 839 рядків. За попередні 2 тижні створено 5 нових audit-доків і 2 нові ініціативи (`0011-foundation-adoption`, `0012-perfect-strictness`). Водночас з 15 P0/P1 пунктів FTUX-roast (2026-05-03) частина все ще **open у коді**. Розрив між «закрите в плані» і «закрите для користувача».

> **Мета freeze-у.** Дати product-cycle 4 тижні майже-без-нової-документації, щоб PR-flow зосередився на shippable code. Через 4 тижні — review: чи дійсно стало тісно (extend), чи навпаки темп пришвидшився (release).

---

## Період

- **Старт:** 2026-05-05
- **Кінець:** 2026-06-02 (4 тижні)
- **Review:** 2026-06-02 (опційне продовження або release)

---

## Що ЗАБОРОНЕНО під час freeze

1. **Нові аудит-документи** в `docs/audits/*.md` (топ-рівень).
2. **Нові ініціативи** в `docs/initiatives/00NN-*.md`.
3. **Нові playbook-и** в `docs/playbooks/*.md` без передумови — playbook народжується з хоча б 2 завершених PR-ів, що руками показали recipe (а не теоретичне «треба зробити»).
4. **Нові ADR-и** без активного code-PR-у, що потребує decision.
5. **Розширення AGENTS.md** новими правилами без обов'язкового lint-enforcement (нові rules → `docs/governance/hard-rules.json` + ESLint plugin або CI-gate; pure-text rules відкладаються до post-freeze).

---

## Що ДОЗВОЛЕНО під час freeze

1. **Edit existing audit-doc-ів** з оновленнями статусів (`Last validated:` bump, status table refresh, нові P-items в існуючих P0/P1/P2 секціях).
2. **Errata-блоки** як inline-коментарі в існуючих audit-доках (з посиланням на нову інформацію).
3. **Status registry update-и** в master tracker-ах:
   - [`docs/launch/ftux-master-tracker.md`](../launch/ftux-master-tracker.md) — FTUX SSOT.
   - Інші master-tracker-и якщо з'являться post-freeze.
4. **Post-mortem-и** завершених PR-серій у `docs/launch/sprint-retros/` (1 page max).
5. **Decisions log** — нові entries у §7 master tracker-у.
6. **Consolidation-PR-и** — об'єднання 2+ існуючих доків в 1 (як [PR #1934 — FTUX consolidation](https://github.com/Skords-01/Sergeant/pull/1934)).
7. **Архівація** stale audit-tracker-ів з `docs/audits/` → `docs/audits/archive/`.
8. **Documentation для shipped code** (CHANGELOG, release notes, in-product whats-new — обов'язкові для PR-ів, які міняють user-visible behavior).
9. **PR-template / CODEOWNERS / CI-config** оновлення — це process-tooling, не audit-content.

---

## Гард на freeze (CI warning)

Cuộc CI-job, що warn-ить (не block-ить), якщо PR створює новий файл під заборонений path:

```
docs/audits/[^/]+\.md         (top-level only, archive/ allowed)
docs/initiatives/00\d{2}-*.md (any new initiative number)
docs/playbooks/*.md           (any new playbook)
docs/adr/00\d{2}-*.md         (any new ADR)
```

CI-warning виводиться як comment на PR з:

- Список файлів, що тригернули warning
- Лінк на цей файл (`docs/governance/audit-freeze-2026-05-05.md`)
- Інструкція як override: додати `[skip-freeze]` у PR title (або `[freeze-exception]`).

> **Важливо:** це **warning, не block.** Override легкий — щоб не блокувати legitimate exceptions (наприклад, security-incident retro). Але кожен override залишає audit-trail у CI-history.

CI-job: `.github/workflows/audit-freeze.yml` (додається у цьому PR).

---

## Override path

Якщо потрібно створити новий audit/initiative/playbook/ADR під час freeze:

1. **Додати у PR title маркер:** `[skip-freeze]` або `[freeze-exception]`.
2. **Додати у PR-description секцію `## Audit-freeze exception`** з:
   - Чому це exception?
   - Чому не може почекати до 2026-06-02?
   - Куди буде інтегровано після freeze (master-tracker, archive, тощо)?
3. **Reviewer:** review-checklist додає 1 чек-пункт «freeze-exception обґрунтовано».

Override — не sin, це signaling механізм. Якщо за 4 тижні буде >5 override-ів — це сигнал, що freeze не працює і треба переглянути правила.

---

## Огляд успіху (2026-06-02)

**Метрики, які review-имо:**

1. Кількість нових файлів за заборонений pathspec (target: ≤ 2, з justified override-ами).
2. Кількість edit-ів у master tracker-ах (target: ≥ 8, оскільки PR-плани оновлюються з кожним shipped PR).
3. Кількість shipped product-PR-ів (target: ≥ 25 за 4 тижні, що співпадає з 5-8 PR/тиждень з PR-плану).
4. Subjective: чи відчувається, що cycle-time від ідеї до shipped стало коротшим?

**Можливі результати огляду:**

- **Release** (freeze знімається): pace відновився; product-PR-и переважають audit-PR-и; немає накопичення «треба написати документацію».
- **Extend** (ще 4 тижні): freeze допомагає, але баланс ще не стабільний.
- **Refine** (нові правила, не extend): з'явилися edge-cases, треба refine override-path або pathspec.

---

## Зв'язок з іншими governance-rules

- **Hard Rule #10** (lifecycle markers) — не міняється: всі існуючі доки далі мають freshness-маркери.
- **Hard Rule #15** (Ukrainian internal docs) — не міняється: всі ініціативи (як post-freeze, так і override-и) — українською.
- **Hard Rule #18** (active-initiative `module-decomposition`) — не міняється: lazy-load модулів продовжується паралельно з freeze.
- **`docs/governance/policy-review.md`** — каденс не міняється; freeze це point-in-time event, не permanent rule.

---

## Зв'язок з PR-планом 2026-05-05

Цей файл — **PR-01** з 22-PR плану ([master tracker §3](../launch/ftux-master-tracker.md#3-pr-план)). Freeze-period (4 тижні) перетинається з Хвилями 1-2 з PR-плану:

- **Week 1:** 8 PR (PR-00 ... PR-08).
- **Week 2-3:** 6 PR (PR-09 ... PR-14).
- **Week 3-4:** 4 PR (PR-15 ... PR-18).

Жоден з цих 18 PR-ів **не створює** нових файлів за заборонений pathspec, окрім:

- **PR-19 (paywall sketch doc)** — `docs/launch/paywall-ux-placement.md` — це **launch-doc**, не audit/initiative/playbook/ADR, тому freeze-clean.
- **PR-22 (agents quick-reference)** — `docs/agents/quick-reference.md` — agents-folder, теж freeze-clean.

---

## Як scope було обрано

**Pathspec обрано як «продукт-докі без mandatory CI-gate»**:

- `docs/audits/`, `docs/initiatives/`, `docs/playbooks/`, `docs/adr/` — це місця, куди легко додати «ще один аудит» / «ще одна ініціатива», і де темп зростання випередив темп viability.
- `docs/launch/`, `docs/observability/`, `docs/integrations/`, `docs/architecture/`, `docs/design/`, `docs/agents/`, **не** заморожуються — це функціональна документація, що часто синкається з shipped code.
- `docs/diagnostics/` теж не заморожується — diagnostics створюються per-incident, не за роадмапом.
- `AGENTS.md` під обмеженням «розширення без enforcement» — це найбільший read-tax файл.

---

## Зв'язок з мега-прожаркою 2026-05-05

**Найголовніший finding мега-прожарки:**

> Sergeant repo застрягло у "audit hyperloop" — 334 markdown-файли в `docs/`, 12 ініціатив, 12 audit-доків. Documentation-velocity > product-velocity. 13 з 15 P0/P1 проблем з FTUX-roast (2026-05-03) досі open у коді.

Цей freeze — **direct mitigation**. Через 4 тижні очікуємо:

- Всі (або майже всі) P0 з FTUX-roast будуть **shipped** (PR-04, PR-05, PR-09, PR-12, PR-15).
- Master tracker матиме оновлений status (всі ✅ замість ⏳).
- 0 нових audit-документів — replaced consolidations через master tracker-и.

---

## Питання й коментарі

Під час freeze:

- Питання щодо freeze-rule → review-comment у PR-1 (цей PR) або у [`docs/launch/ftux-master-tracker.md`](../launch/ftux-master-tracker.md) §1 TL;DR.
- Override-сценарії → див. секцію [Override path](#override-path).
- Бачив новий audit-файл, що пробився без override? → tag @Skords-01 у PR (або в issue).

> Кінець. Цей файл — **active until 2026-06-02**. Після цієї дати — оновлюємо `Status:` на `Closed` і додаємо результати огляду.
