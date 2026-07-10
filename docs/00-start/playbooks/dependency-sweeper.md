# Playbook: Dependency Sweeper (періодичний тріаж залежностей)

> **Last touched:** 2026-07-10 by @claude. **Next review:** 2026-10-08.
> **Status:** Active

**Trigger:** запланований періодичний прогін (`/schedule`, cadence 6h–1d) або ручний запит «що застаріло / які CVE / що безпечно бампнути». Це **не** заміна Renovate — див. § «Чим це відрізняється від Renovate».

## Owner surface

- Primary surface: `package.json` (root + per-workspace), `pnpm-lock.yaml`, `renovate.json`.
- Coupled surface: [`audit-exceptions.md`](../../04-governance/security/audit-exceptions.md) (ledger waived-CVE), `scripts/generate-licenses.mjs` (license-політика).
- Governing skill: `sergeant-bugfix-and-regression` (для власне бампів — `bump-dep-safely.md`).
- Engine: [`scripts/dependency-sweeper-report.mjs`](../../../scripts/dependency-sweeper-report.mjs) — read-only движок звіту L1.

---

## Чим це відрізняється від Renovate

Renovate у цьому репо вже відкриває PR-и на бампи (щопонеділка до 6:00, `vulnerabilityAlerts` — будь-коли), групує `@types/*` та ESLint, automerge для частини. **Dependency Sweeper його не дублює й не замінює.** Sweeper — це шар **звітності + тріажу + ескалації** поверх наших примітивів:

- зводить `pnpm outdated` + `pnpm audit` + `pnpm licenses:check` в **один людино-читаний дайджест** з ризик-класифікацією;
- звіряє CVE з ledger-ом [`audit-exceptions.md`](../../04-governance/security/audit-exceptions.md), щоб **не нагадувати про вже-waived** вразливості;
- підсвічує те, що **провалилось крізь Renovate** (згруповані major-и, що висять; CVE без запису в ledger; license-дрейф);
- на L2 — **батчить safe-патчі**, які Renovate не заавтомерджив, окремим bump-PR.

Якщо Renovate покриває конкретний апдейт — Sweeper лише репортить його статус, а не відкриває конкурентний PR.

---

## Фази патерна

| Фаза | Що робить | Наш примітив |
| --- | --- | --- |
| **scan** | знайти застаріле + відомі CVE + license-дрейф | `pnpm -r outdated --format json`, `pnpm audit --json`, `pnpm licenses:check` |
| **triage-risk** | класифікувати кожен апдейт: safe vs risky | движок: major/unknown → risky; patch/minor → safe |
| **patch-safe** *(L2+)* | безпечні застосувати в **ізольованому** worktree, окремим bump-PR | `/wt <topic>` → `pnpm up <pkg>@<v>` → commit `chore(deps): …` |
| **verify-worktree** *(L2+)* | у тому ж worktree прогнати гейт | `pnpm check` (мін. `--filter` typecheck+test зачепленого) |
| **escalate-risky** | major / high-CVE / denylist → людині | `mcp__ccd_session__spawn_task` чіп |

**safe** = patch/minor bump у devDep або добре покритому пакеті. **risky** = major bump, high-sev CVE, denylist-пакет, unknown-range.

---

## Safety-модель (фазовий rollout — СТАРТ З L1)

| Рівень | Поведінка | Комітить? | Дозвіл |
| --- | --- | --- | --- |
| **L1** *(DEFAULT, тиждень 1)* | report-only: пише звіт «що застаріло / CVE / що безпечно бампнути» | ❌ ні | стартовий, безпечний |
| **L2** | застосовує лише **safe**-патчі в ізольованому worktree з верифікацією; ризиковане ескалує | ⚠️ так, окремим bump-PR | явний дозвіл власника |
| **L3** | unattended для **allowlisted** (напр. лише `@types/*` patch) | ⚠️ так, автомерж allowlisted | окремий явний дозвіл; **не вмикати** без нього |

L1 безпечно ганяти unattended саме тому, що движок [`dependency-sweeper-report.mjs`](../../../scripts/dependency-sweeper-report.mjs) **фізично не може** змінити стан — лише читає й друкує Markdown.

## Human-gates (завжди ескалувати, ніколи не автофіксити)

- major version bumps;
- high/critical CVE;
- denylist-пакети;
- license-порушення;
- перевищення max-спроб верифікації.

---

## L1: готова до запуску `/schedule`-рутина (report-only)

**Активація власником** (L1 — свідомо gated; движок треба закомітити, щоб хмарна рутина його бачила):

1. Закомітити 2 файли: `scripts/dependency-sweeper-report.mjs` + цей playbook (`chore(agents): add dependency-sweeper L1`).
2. Створити рутину через `/schedule` з cron `0 6 * * *` (щодня 06:00 Europe/Kyiv) і таким **self-contained** промптом:

```text
Dependency Sweeper — L1 report-only. Не комітити, не бампити, не відкривати PR.
Кроки:
1. pnpm install --frozen-lockfile   (ephemeral checkout без node_modules)
2. node scripts/dependency-sweeper-report.mjs
3. Віддати згенерований Markdown-звіт як фінальне повідомлення рутини.
Якщо в звіті є high/critical CVE або major bump — у підсумку окремим рядком
познач «⚠️ HUMAN-GATE: ескалювати», але НІЧОГО не фіксити.
```

Cadence на старті — 1 день; після кількох надійних циклів можна ущільнити до 6–12h.
Звіт L1 доставляється як **completion-повідомлення** рутини — нікуди не комітиться.

**Ручний dry-run** (той самий движок, локально):

```bash
pnpm install --frozen-lockfile        # якщо ephemeral worktree
node scripts/dependency-sweeper-report.mjs
```

---

## Verification

- [ ] `node scripts/dependency-sweeper-report.mjs` друкує Markdown-звіт і виходить з кодом 0.
- [ ] У worktree після прогону **немає** змін (`git status` чистий) — L1 нічого не пише.
- [ ] CVE з `audit-exceptions.md` позначені як waived і не потрапляють у actionable-список.
- [ ] major-бампи опиняються в секції «Risky», patch/minor — у «Safe-кандидати».

## Як власнику підняти L1 → L2

Коли L1-звіти кілька циклів виглядають надійно (safe-класифікація не дає хибних спрацювань, CVE-звірка з ledger коректна):

1. Дай явний дозвіл на L2 (окремим повідомленням).
2. Рутина отримує додатковий крок після звіту: для **safe**-рядків — `/wt deps-sweep-<date>` → `pnpm up <pkg>@<latest>` (тільки safe) → `pnpm check` у тому ж worktree → якщо green, окремий bump-PR `chore(deps): sweep safe patch/minor (<date>)`.
3. Усе risky (major / high-CVE / denylist) лишається **тільки ескалацією чіпом** — L2 їх не чіпає.
4. L3 (unattended automerge allowlisted, напр. `@types/*` patch) вмикається **лише** окремим явним дозволом.

## Коли цей playbook НЕ використовувати

- Тобі треба разово підняти конкретну залежність → `bump-dep-safely.md`.
- Активний security-інцидент через CVE → `declare-incident.md` + `audit-exceptions.md`.

## Споріднені playbook-и та skills

- [bump-dep-safely.md](./bump-dep-safely.md) — власне механіка одного бампа.
- [audit-exceptions.md](../../04-governance/security/audit-exceptions.md) — ledger waived-CVE.
- [renovate-usage.md](../../02-engineering/integrations/renovate-usage.md) — як працює Renovate тут.
