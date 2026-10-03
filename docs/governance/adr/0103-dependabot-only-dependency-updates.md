# ADR-0103: Dependabot — єдиний інструмент оновлення залежностей

- **Status:** Proposed
- **Date:** 2026-10-03
- **Last validated:** 2026-10-03
- **Next review:** 2027-01-03
- **Deciders:** @SkOrDs-02
- **Supersedes:** [ADR-0044](./0044-renovate-vs-dependabot.md)
- **Related:**
  - [ADR-0044](./0044-renovate-vs-dependabot.md) (Renovate primary, Dependabot security-only; замінено цим ADR)
  - [ADR-0101](./0101-github-primary-host-ci-returns.md) (GitHub знову основний хост)
  - [ADR-0082](./0082-private-storage-repo-posture.md) (воркфлоу авто-мерджу прибрано)
  - [ADR-0050](./0050-typescript-major-version-policy.md) (пін `@types/node`)
  - [ADR-0094](./0094-mobile-web-first-freeze.md) (мобільний контур на паузі)
  - [`.github/dependabot.yml`](../../../.github/dependabot.yml)
  - [`docs/engineering/integrations/dependabot-usage.md`](../../engineering/integrations/dependabot-usage.md)

---

## Context and Problem Statement

ADR-0044 (2026-05-04) поділив ролі так: Renovate (застосунок Mend) веде звичайні оновлення версій за `renovate.json`, Dependabot лише піднімає security-оновлення. Після повернення коду на GitHub ([ADR-0101](./0101-github-primary-host-ci-returns.md), репо `SkOrDs-02/sergeant`) застосунок Renovate на репо не встановлено: станом на 2026-10-03 немає жодного PR від `renovate[bot]` і немає issue `Dependency Dashboard`. `renovate.json` лежав у корені, але ніщо його не виконувало.

Фактично всю роботу робить Dependabot за [`.github/dependabot.yml`](../../../.github/dependabot.yml): npm щодня (і security-, і звичайні оновлення версій), GitHub Actions і Docker-образи щотижня. Конфіг почищено 2026-10-03: ігнор мажорів Expo, React Native і Capacitor (мобільний контур на паузі, [ADR-0094](./0094-mobile-web-first-freeze.md); PR #878, #882, #1085 закрито), ігнор мажору образу `node` (PR #1177 закрито), прибрано мітки, яких у репо немає. Доки й коментарі при цьому описували Renovate як чинний інструмент, тож агенти й люди шукали його PR, групи й Dependency Dashboard, яких немає.

Власник вирішив 2026-10-03: Renovate не встановлюємо, лишаємо тільки Dependabot, документацію приводимо у відповідність.

## Considered Options

1. **Тільки Dependabot.** Видалити `renovate.json`, переписати доки під Dependabot, явно записати, що з можливостей Renovate втрачається.
2. **Встановити Renovate і повернутись до ADR-0044.** Повертає групи, автомердж і lockfile maintenance, але додає сторонній застосунок з правом запису в репо і другу конфігурацію. Власник цей варіант відхилив.
3. **Нічого не міняти.** ADR і доки далі описують інструмент, якого немає. Відхилено: це й було проблемою.

## Decision

Обрано варіант 1.

- Dependabot — єдиний інструмент оновлення залежностей. Конфіг: [`.github/dependabot.yml`](../../../.github/dependabot.yml) (npm щодня, `github-actions` і `docker` у `/` щотижня, `docker` у `/ops/grafana-alloy` щотижня).
- `renovate.json` видалено. На нього не спирались ні скрипти, ні лінти, ні воркфлоу.
- Гід контриб'ютора `docs/engineering/integrations/renovate-usage.md` замінено на [`dependabot-usage.md`](../../engineering/integrations/dependabot-usage.md). Runbook мейнтейнера `docs/operations/ops/renovate.md` видалено: те, що в ньому стосувалось Dependabot (обробка security-PR, MTTR), перенесено в `dependabot-usage.md`.
- Автомерджу немає: усі PR Dependabot мерджить людина після зеленого CI (воркфлоу `dependabot-automerge.yml` прибрано раніше, ADR-0082).

### Що втрачаємо від Renovate і чим це покрито

| Можливість Renovate (`renovate.json`)                                                  | Стан після рішення                                                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Групи (`eslint`, `vitest`, `vite`, `sentry`, `opentelemetry`, `anthropic`, `tanstack`) | **Немає.** У `dependabot.yml` є лише група `security-updates`; звичайні оновлення приходять окремим PR на кожен пакет. Пакети, які мусять іти разом (`@sentry/*`, `@opentelemetry/*`), рев'юер підтягує вручну в тому ж PR або робить окремий бамп за [`bump-dep-safely.md`](../../start/instructions/bump-dep-safely.md). |
| Автомердж dev-patch після 3 днів (`minimumReleaseAge`)                                 | **Немає.** Кожен PR мерджить людина. Вікно на відкликання скомпрометованого релізу тепер забезпечує ручне рев'ю, а не таймер.                                                                                                                                                                                              |
| `lockFileMaintenance` (щотижневе оновлення транзитивних залежностей у lockfile)        | **Немає.** Транзитивні advisory закриваються вручну: `pnpm audit` і `pnpm.overrides` (як у #1379), періодичний тріаж за [`dependency-sweeper.md`](../../start/instructions/dependency-sweeper.md).                                                                                                                         |
| `pinDigests` для GitHub Actions                                                        | **Частково.** Dependabot оновлює дії, вже закріплені на SHA, але не закріплює нові: дію, додану з тегом (`@v4`), треба одразу пінити на SHA вручну.                                                                                                                                                                        |
| `pinDigests` для `pgvector/pgvector` (щомісячний PR з новим digest)                    | **Немає.** Екосистема `docker` у Dependabot читає Dockerfile (`Dockerfile.api`), а не `docker-compose.yml` і не `services:` у воркфлоу. Digest піднімається вручну за [`local-postgres-setup.md`](../../engineering/development/local-postgres-setup.md#bumping-the-sha).                                                  |
| `allowedVersions: "<23"` для `@types/node`                                             | Пін тримає `pnpm.overrides` (`@types/node: ^20.19.41`) і ADR-0050; правила в `dependabot.yml` для нього немає. Якщо Dependabot відкриє мажор `@types/node`, PR закривається, а в `ignore` додається правило за зразком образу `node`.                                                                                      |
| `rangeStrategy: pin` і групи для Expo / React Native / Capacitor                       | Замінено ігнором мажорів у `dependabot.yml` (2026-10-03). Оновлення в межах мажору й security-оновлення приходять як звичайні PR.                                                                                                                                                                                          |
| Dependency Dashboard (issue з переліком очікуваних оновлень)                           | **Немає.** Замінники: вкладка Security → Dependabot alerts на GitHub, `pnpm outdated`, звіт `dependency-sweeper`.                                                                                                                                                                                                          |
| `vulnerabilityAlerts` поза розкладом                                                   | Dependabot security updates (група `security-updates`). Працюють лише тоді, коли в Settings → Code security увімкнено Dependabot security updates; цей стан агент з репо не бачить, його звіряє власник.                                                                                                                   |

Dependabot має власні механізми групування (`groups` для version updates) і затримки (`cooldown`), але в `dependabot.yml` вони не налаштовані. Вмикати їх — окремим PR, якщо шум від окремих PR стане проблемою.

## Rationale

- Renovate фактично не працює з моменту переїзду на GitHub, а Dependabot уже веде всі оновлення. Рішення фіксує реальний стан, а не вводить новий процес.
- Один інструмент — одна конфігурація: правила ігнору живуть в одному файлі, і немає дубль-PR між двома ботами, через які з'явився ADR-0044.
- Dependabot вбудований у GitHub і не потребує стороннього застосунку з правом запису в репо.
- Втрачені можливості перелічено вище з конкретним ручним шляхом. Жодну з них не підміняємо автоматизацією, якої в репо немає.

## Consequences

### Positive

- Доки, коментарі в конфігах і скіли описують інструмент, який справді працює.
- `renovate.json` більше не вводить в оману агентів і рев'юерів.
- Усі правила оновлень (ігнор мажорів, синхрон із `pnpm.overrides`) в одному файлі.

### Negative

- Більше PR: по одному на пакет, без груп. Ліміт відкритих PR (`open-pull-requests-limit`) стримує потік: 10 для npm, 5 для дій, 5 для Docker у корені, 3 для `ops/grafana-alloy`.
- Без автомерджу кожен dev-patch потребує людини.
- Lockfile не оновлюється періодично; транзитивні залежності старіють, доки їх не зачепить advisory або ручний бамп.
- Digest `pgvector` і нові GitHub Actions пінуються вручну.

### Neutral

- CI без змін: PR Dependabot проходять ті самі required-чеки, що й будь-які інші.
- Префікси комітів Dependabot (`chore(deps)`, `ci(deps)`) відповідають scope-enum Hard Rule #5.
- Команди `@dependabot rebase` / `recreate` через MCP-проксі агента не працюють. Гілку PR оновлюють кнопкою Update branch на GitHub, через `update_pull_request_branch` (GitHub MCP) або власним PR із бампом.

## Compliance

- [`.github/dependabot.yml`](../../../.github/dependabot.yml) — єдиний конфіг оновлень; у корені немає `renovate.json`.
- `git grep -n -i renovate` поза історичними ADR, аудитами, специфікаціями й журналами не повертає згадок про Renovate як чинний інструмент.
- [`docs/engineering/integrations/dependabot-usage.md`](../../engineering/integrations/dependabot-usage.md) — гід для роботи з PR Dependabot.
- Ігнор у `dependabot.yml` тримається в синхроні з `package.json` → `pnpm.overrides` (коментар у самому конфігу).

## Links

- [`renovate.json` на момент видалення](https://github.com/SkOrDs-02/sergeant/blob/b47c5ac146b0b0a3e9285fe5e58985a7eaa81ca2/renovate.json)
- [`renovate-usage.md` на момент заміни](https://github.com/SkOrDs-02/sergeant/blob/b47c5ac146b0b0a3e9285fe5e58985a7eaa81ca2/docs/engineering/integrations/renovate-usage.md)
- [`docs/operations/ops/renovate.md` на момент видалення](https://github.com/SkOrDs-02/sergeant/blob/b47c5ac146b0b0a3e9285fe5e58985a7eaa81ca2/docs/operations/ops/renovate.md)
