# Dependabot — як працювати з PR-ами

> **Last touched:** 2026-10-03 by @claude (замінює `renovate-usage.md`: Renovate не встановлено, лишився тільки Dependabot, ADR-0103). **Next review:** 2027-04-01.
> **Status:** Active
>
> Dependabot — єдиний інструмент оновлення залежностей ([ADR-0103](../../governance/adr/0103-dependabot-only-dependency-updates.md), замінив ADR-0044). Конфіг: [`.github/dependabot.yml`](../../../.github/dependabot.yml). Renovate на репо не встановлено, `renovate.json` видалено.

## Коротко

1. PR від `dependabot[bot]` приходять самі, за розкладом нижче. Автомерджу немає: кожен PR мерджить людина.
2. CI зелений, у diff лише маніфести й lockfile, у release notes немає breaking changes → squash-merge.
3. Мажор або червоний CI → рев'ю за [`bump-dep-safely.md`](../../start/instructions/bump-dep-safely.md) або закрити PR.
4. Security-PR — першими, у строки з [`vulnerability-sla.md`](../../governance/security/vulnerability-sla.md).

## Що приходить

| Екосистема       | Каталог                | Розклад (Europe/Kyiv) | Префікс коміту | Ліміт відкритих PR |
| ---------------- | ---------------------- | --------------------- | -------------- | ------------------ |
| `npm`            | `/`                    | щодня, 06:00          | `chore(deps)`  | 10                 |
| `github-actions` | `/`                    | понеділок, 06:00      | `ci(deps)`     | 5                  |
| `docker`         | `/` (`Dockerfile.api`) | понеділок, 06:00      | `chore(deps)`  | 5                  |
| `docker`         | `/ops/grafana-alloy`   | понеділок, 06:00      | `chore(deps)`  | 3                  |

- **npm, security-оновлення** зібрані в одну групу `security-updates`: один PR на всі доступні фікси.
- **npm, звичайні оновлення версій** — окремий PR на кожен пакет. Груп для них немає.
- **Мітки** Dependabot ставить свої дефолтні й сам їх створює; власного `labels:` у конфігу немає навмисно.
- Тайтл: `chore(deps): bump <pkg> from <old> to <new>`. Префікси відповідають scope-enum Hard Rule #5.

## Що ігнорується і чому

Правила живуть у `ignore:` відповідної екосистеми в `dependabot.yml`.

| Що                                                                                                                  | Чому                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-server-dom-webpack`, `tar`, `@xmldom/xmldom`, `serialize-javascript`, `postcss`, `uuid`, `@tootallnate/once` | Закріплені через `pnpm.overrides` у кореневому `package.json`; оновлення від Dependabot воювало б з override. Список тримай у синхроні з overrides.                                                         |
| Мажори `expo`, `expo-*`, `@expo/*`, `react-native`, `react-test-renderer`, `@capacitor/*`, `@capacitor-mlkit/*`     | Ставляться разом із SDK (`expo install`), а не поодинці; мобільний контур на паузі ([ADR-0094](../../governance/adr/0094-mobile-web-first-freeze.md)). Оновлення в межах мажору й security-фікси проходять. |
| Мажор Docker-образу `node`                                                                                          | Проєкт на Node 22 LTS (Volta 22.19.0, distroless `nodejs22`); інший мажор — окреме рішення.                                                                                                                 |

**Чого Dependabot не покриває взагалі** (робиться вручну):

- **Digest `pgvector/pgvector`** у `docker-compose.yml` і в `services:` воркфлоу. Екосистема `docker` читає лише Dockerfile. Рецепт: [`local-postgres-setup.md` § Bumping the SHA](../development/local-postgres-setup.md#bumping-the-sha).
- **SHA-пін нових GitHub Actions.** Dependabot оновлює дії, вже закріплені на SHA, але тег (`@v4`) на SHA не переводить. Нову дію пінуй одразу.
- **Мажор `@types/node`.** Тримається `pnpm.overrides` (`^20.19.41`) і [ADR-0050](../../governance/adr/0050-typescript-major-version-policy.md). Прийде такий PR — закрий і додай правило в `ignore` за зразком образу `node`.
- **Оновлення транзитивних залежностей у lockfile** без advisory: `pnpm update`, тріаж за [`dependency-sweeper.md`](../../start/instructions/dependency-sweeper.md).

## Як рев'юїти

1. **Files changed:** лише `package.json` (кореневий або воркспейсу) + `pnpm-lock.yaml`, або один воркфлоу, або один Dockerfile. Щось інше — це вже не звичайний бамп, дивись уважно.
2. **Release notes** у тілі PR: є breaking changes чи deprecated API — тестуй локально за [`bump-dep-safely.md`](../../start/instructions/bump-dep-safely.md) або відклади.
3. **Пакети, що мусять іти разом** (`@sentry/*`, `@opentelemetry/*`, `@anthropic-ai/*`, `vitest` + `@vitest/*`, `@playwright/test` + `playwright`): Dependabot піднімає їх по одному. Підтягни решту в тому ж PR або закрий його й зроби один бамп власним PR.
4. **CI:** чекай зелених required-чеків.
5. **Merge:** squash, як завжди.

### Коли червоний CI

- Breaking change у залежності або посилені типи знайшли реальну проблему. Читай лог CI.
- Не дописуй виправлення в гілку Dependabot: бот може перестворити гілку і стерти твої коміти. Закрий PR і зроби власний (`<harness>/chore-bump-<pkg>`) за [`bump-dep-safely.md`](../../start/instructions/bump-dep-safely.md).
- Закритий PR Dependabot не відкриватиме знову для **тієї самої** версії, але прийде з наступною. Щоб пакет не пропонувався зовсім, додай правило в `ignore:` окремим PR із поясненням у коментарі.

## Як оновити гілку PR

- Dependabot сам ребейзить свій PR, коли той конфліктує з `main`, доки в гілку ніхто інший не пушив.
- Команди в коментарях (`@dependabot rebase`, `@dependabot recreate`, `@dependabot ignore …`) **через MCP-проксі агента не працюють**. Агент оновлює гілку кнопкою Update branch на GitHub або через `update_pull_request_branch` (GitHub MCP). Після такого злиття в гілці з'являється чужий коміт, і Dependabot може перестати ребейзити її сам.
- Якщо гілку простіше не рятувати — закрий PR і зроби бамп власним PR.

## Security-PR

1. Приходять у групі `security-updates`. Працюють лише тоді, коли в Settings → Code security увімкнено Dependabot security updates; цей стан звіряє власник.
2. **Patch у прямій production-залежності** → merge після зеленого CI.
3. **Minor / major** → читай advisory (посилання `GHSA-…` у тілі PR), оцінюй breaking-ризик, далі merge.
4. **Транзитивна залежність** → перевір, що `pnpm.overrides` не блокує фікс; якщо Dependabot фікс не піднімає, закрий advisory власним override (як у #1379).
5. Строки — за [`vulnerability-sla.md`](../../governance/security/vulnerability-sla.md); винятки без доступного фіксу — у [`audit-exceptions.md`](../../governance/security/audit-exceptions.md).

## Зв'язки

- [ADR-0103](../../governance/adr/0103-dependabot-only-dependency-updates.md) — рішення і перелік того, що втрачено разом із Renovate.
- [`.github/dependabot.yml`](../../../.github/dependabot.yml) — конфіг.
- [`bump-dep-safely.md`](../../start/instructions/bump-dep-safely.md) — механіка одного бампа.
- [`dependency-sweeper.md`](../../start/instructions/dependency-sweeper.md) — періодичний тріаж поверх Dependabot.
- [`nightly-audit.md`](../../governance/security/nightly-audit.md) — реактивна частина (`pnpm audit` + OSV-Scanner).
