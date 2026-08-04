# ADR-0081: Спрощення repository automation та історії

- **Status:** Accepted
- **Last validated:** 2026-07-29 by @Skords-01. **Next review:** 2026-10-27.
- **Date:** 2026-07-29
- **Reviewers:** @SkOrDs-02
- **Supersedes:** ADR-0058, ADR-0059, ADR-0060, ADR-0066, ADR-0070
- **Related:**
  - [`AGENTS.md`](../../../AGENTS.md) — актуальна routing та governance-політика.
  - [`docs/00-start/agents/onboarding.md`](../../00-start/agents/onboarding.md) — короткий маршрут discovery.
  - [`scripts/dualwrite-residue.ts`](../../../scripts/dualwrite-residue.ts) — єдиний спеціалізований entropy-check, який лишається.

## Контекст

Репозиторій паралельно підтримував committed codebase graph, symbol catalog, retrieval index, compressed graph database, C3 workspace diagram та власний MCP/CLI retrieval. Після підключення зовнішнього codebase-memory MCP ці артефакти дублювали discovery-шар, вимагали каскадної регенерації й додавали великі бінарні зміни до Git.

Окремо `tools/entropy-janitors` обгортав уже наявні Knip, docs link checker та ESLint у власний scheduler, а ESLint-плагін кодував десятки суб’єктивних візуальних рішень. Локальні `docs/90-work/*/archive` дублювали незмінну історію Git і створювали постійний борг посилань.

## Рішення

1. Для code discovery пріоритет має codebase-memory MCP. Якщо він недоступний або не проіндексований, fallback — TypeScript/LSP, Knip та `rg`; committed graph/symbol/retrieval artifacts не зберігаємо.
2. Завершені audits, initiatives і planning-документи не тримаємо у локальних archive-деревах. Історичні посилання фіксуємо permalink-ами на Git commit.
3. Загальний entropy-wrapper і його weekly workflow прибираємо. Використовуємо прямі перевірки: Knip для dead code, docs checker для links/drift, `import/no-cycle` для dependency cycles. Специфічний dual-write residue checker лишається standalone-скриптом.
4. `eslint-plugin-sergeant-design` перевіряє runtime-, security-, storage-, API- та domain-інваріанти. Візуальний смак лишається у design tokens, Storybook, accessibility tooling і review, а не в локальних AST-евристиках.
5. Малий landing не використовує client router для двох pathname-гілок. Нові локальні ID використовують `crypto.randomUUID()` замість комбінацій timestamp + `Math.random()`.

## Наслідки

- Clone і звичайні PR більше не тягнуть graph DB та каскад generated-index diffs.
- Discovery залежить від можливостей активного harness; fallback явно задокументований і не потребує repo-specific індексу.
- Історія завершеної роботи лишається доступною через GitHub permalink та Git history, але не бере участі у freshness/link gates.
- Візуальні регресії ловляться ближче до результату — Storybook, browser/a11y checks і людське review; ESLint лишається сфокусованим на інваріантах із чітким false-positive budget.
- Retired Hard Rules зберігають номери в історії, але вилучаються з активного registry; номери не перевикористовуються.

## Відхилені альтернативи

- **Лишити всі committed індекси як fallback.** Відхилено: саме їхня регенерація й drift становили основну вартість.
- **Лишити archive-дерева, але виключити з lint.** Відхилено: дублювання Git history та навігаційний шум залишилися б.
- **Перенести всі visual rules у warning.** Відхилено: warning-и продовжили б підтримувати складний AST-код без надійного сигналу якості.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                             | Merged     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ---------- |
| [#606](https://github.com/Skords-01/Sergeant/pull/606) | docs(docs): звірка документації з репо — статуси, дрейф, каталогізація, дублікати | 2026-08-04 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
