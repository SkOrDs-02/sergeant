# ADR-0027: політика OpenClaw, Console та MCP

> **Superseded by [ADR-0075](./0075-openclaw-gateway-decommissioned.md) (2026-07-20)** — OpenClaw повністю виведено з експлуатації і прибрано з репо. Принципи політики (allowlist, fail-closed, human approval для write-tools) лишаються корисним історичним контекстом; runtime-поверхні більше немає.

- **Статус:** superseded by ADR-0075
- **Last validated:** 2026-07-21 by @cursoragent. **Next review:** 2026-10-18.
- **Дата:** 2026-04-27
- **Рецензенти:** @Skords-01
- **Замінює:** —
- **Пов'язане:** [ADR-0075](./0075-openclaw-gateway-decommissioned.md) — decommission; [ADR-0055](./0055-openclaw-external-gateway.md) — historical external gateway (також superseded 0075).

---

## Контекст

OpenClaw починався як launch-проза, а **`tools/openclaw`** (видалено) існував як внутрішній адмін-інструмент у Telegram. Пізніше prod проходив через external gateway ([ADR-0055](./0055-openclaw-external-gateway.md)), але **на 2026-07-20 увесь OpenClaw-stack decommissioned** ([ADR-0075](./0075-openclaw-gateway-decommissioned.md)). Без політики кожен AI- або MCP-PR мав наново вирішувати, чи console — це продуктовий surface, які інструменти можуть мутувати дані та як версіонувати зміни промптів.

## Рішення

Phase 1 випускав `tools/openclaw` як внутрішній адмін-інструмент, не як user-facing продукт. Пізніше prod — external gateway (ADR-0055), потім **повний decommission** (ADR-0075).

- Console — allowlist по Telegram user id. У продакшні має fail-closed, якщо `ALLOWED_USER_IDS` порожній.
- Вивід агента вважається untrusted-текстом і екранується перед рендером у Telegram Markdown.
- Read-only інструменти дозволені за замовчуванням — для діагностики і самарі.
- Мутуючі інструменти потребують явного human approval і мають логувати запитану дію, актора, ціль і результат.
- Конфіг MCP стартує з read-only-політики. Write-скоупи — окремі, вузькі та вимкнені, доки оператор не ввімкне їх для конкретного завдання.
- Файли промптів версіонуються в git. Зміни промптів проходять PR-рев'ю та мають містити поведінкову причину зміни.
- MCC або детерміновані правила категорій мають пріоритет над AI-категоризацією. AI-категоризація може заповнити прогалини або запропонувати кандидатів, але не може мовчки перезаписувати детерміновані правила.

## Наслідки

Майбутні PR-и для console та OpenClaw можуть посилатися на одну політику, замість того щоб щоразу відкривати архітектурну дискусію. Розширення до більшої кількості агентів спочатку має додавати тести, audit-логування та вузько обмежені дозволи інструментів.

<!-- AUTO-GENERATED: PR-BACKLINKS-START -->

## Recent PRs

| PR                                                     | Title                                                                | Merged     |
| ------------------------------------------------------ | -------------------------------------------------------------------- | ---------- |
| [#364](https://github.com/Skords-01/Sergeant/pull/364) | docs(adr): sync ADR registry and operator docs with Coolify/ADR-0075 | 2026-07-21 |

_Auto-derived from `docs/04-governance/pr-ledger/index.json`. Top 1 most recent PRs touching this file._
<!-- AUTO-GENERATED: PR-BACKLINKS-END -->
