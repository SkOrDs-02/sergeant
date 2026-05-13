# CodeQL — SAST taint-flow analysis для TypeScript

> **Last validated:** 2026-05-13 by @Skords-01. **Next review:** 2026-08-11.
> **Status:** Active

## Огляд

Workflow [`.github/workflows/codeql.yml`](../../.github/workflows/codeql.yml)
запускає [CodeQL](https://codeql.github.com/) — статичний taint-flow
analyzer від GitHub — на повному TypeScript codebase (`apps/web`,
`apps/server`, `tools/openclaw`, `apps/mobile`, `packages/**`). Закриває
[`hardening/I1-codeql-workflow.md`](./hardening/I1-codeql-workflow.md)
і завершує SAST/SCA trio:

| Інструмент      | Шар                                                                                    | Тригер                                                                   |
| --------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **CodeQL**      | TypeScript source taint-flow (SQLi, XSS, SSRF, prototype pollution, path traversal, …) | PR + push to `main` + понеділок 06:00 UTC                                |
| **Trivy**       | Hub API container image (alpine OS + runtime npm tree)                                 | PR (Dockerfile / lockfile / server) + push to `main` + щоденно 04:00 UTC |
| **OSV-Scanner** | Lockfile залежностей (SCA по всьому npm tree)                                          | nightly 03:00 UTC ([`nightly-audit.md`](./nightly-audit.md))             |

Це доповнює `eslint-plugin-security` (див.
[`hardening/M11-eslint-plugin-security.md`](./hardening/M11-eslint-plugin-security.md))
— ESLint ловить очевидні locally-syntactic патерни за O(file), CodeQL
ходить cross-procedure / cross-module taint-flow за O(repo).

## Тригери

| Подія               | Коли запускається                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `push` to `main`    | Кожен merge на main — ловимо merge-and-push patch-и, які пройшли lint, але вносять регресію.                          |
| `pull_request`      | Кожен PR — нові введення taint-flow видно у вкладці "Security" PR-а до merge.                                         |
| `schedule`          | Щотижня **понеділок 06:00 UTC** — CodeQL queries оновлюються upstream; той самий source-tree може дати нову знахідку. |
| `workflow_dispatch` | Ручний запуск через Actions UI.                                                                                       |

## Конфігурація

- **Languages:** `javascript-typescript` (єдина `language` enum-mатриця;
  покриває JSX, TSX, Node, browser).
- **Query suites:** `security-extended,security-and-quality`.
  - `security-extended` — базовий security set + додаткові CWE-варіанти
    (CWE-918 SSRF, CWE-79 XSS variants, CWE-352 CSRF heuristics).
  - `security-and-quality` — додає maintainability / correctness rules
    (unused-imports, dead-code), які часто корелюють з security regressions.
- **Permissions:** `security-events: write` (upload SARIF до code-scanning),
  `actions: read` (incremental analysis), `contents: read` (checkout).
- **Runner:** `ubuntu-latest`, `timeout-minutes: 60` (CodeQL TS-analysis на
  ~9 apps/packages зазвичай завершується за 8–15 хвилин).
- **Concurrency:** `codeql-${{ github.ref }}`, `cancel-in-progress: true` —
  серія швидких force-push на тому ж PR не накопичує черги.

Усі actions SHA-pinned згідно з repo convention (див.
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) і
[`.github/workflows/container-scan.yml`](../../.github/workflows/container-scan.yml)):

| Action                         | SHA                                        | Версія  |
| ------------------------------ | ------------------------------------------ | ------- |
| `actions/checkout`             | `de0fac2e4500dabe0009e67214ff5f5447ce83dd` | v6.0.2  |
| `github/codeql-action/init`    | `e46ed2cbd01164d986452f91f178727624ae40d7` | v4.35.2 |
| `github/codeql-action/analyze` | `e46ed2cbd01164d986452f91f178727624ae40d7` | v4.35.2 |

## Результат

- **GitHub Code Scanning UI** — Settings → Security → "Code scanning" →
  фільтр `Tool: CodeQL`. Алерти доступні у вкладці "Security" як на репо-,
  так і на PR-рівні.
- **PR-блокування:** CodeQL alert НЕ автоматично fail-ить PR (defaults).
  Severity gate визначається через repo-level "Code scanning default setup"
  — наразі поставлено на manual review (alert видно reviewer-у, рішення
  людське). Promotion до hard-fail на `Critical` / `High` — окремий step,
  трекається у follow-up issue.
- **SARIF upload:** автоматичний через `github/codeql-action/analyze`
  (вбудовано). Тренди видно у `Security > Code Scanning > CodeQL`.

## Триаж знахідок

1. CodeQL alert з'являється у вкладці "Security" → "Code scanning alerts".
2. False-positive → закрий через GitHub UI з reason
   ("False positive" / "Used in tests" / "Won't fix") і **продублюй запис**
   у [`audit-exceptions.md`](./audit-exceptions.md) у секції `## CodeQL alert exceptions`
   щоб decision був git-tracked, не тільки в GitHub-state.
3. Real finding → відкрий issue з `security:medium`/`security:high`
   за [`vulnerability-sla.md`](./vulnerability-sla.md), фікс merge-ається
   в окремому PR, alert закривається автоматично після resolve.
4. Baseline ≤ 5 алертів (audit verification): якщо перший scheduled run
   видає більше — кожен додатковий триаж робиться у в окремому PR в межах
   sprint-у згідно з [`hardening/I1-codeql-workflow.md`](./hardening/I1-codeql-workflow.md).

## Зв'язок з іншими інструментами

- [`hardening/M11-eslint-plugin-security.md`](./hardening/M11-eslint-plugin-security.md)
  — ESLint per-PR review-time signal (швидко, syntactic, on every save).
- [`container-scan.md`](./container-scan.md) — Trivy для container CVE.
- [`nightly-audit.md`](./nightly-audit.md) — OSV-Scanner для lockfile CVE.
- [`vulnerability-sla.md`](./vulnerability-sla.md) — SLA на response для
  знахідок усіх трьох інструментів.
