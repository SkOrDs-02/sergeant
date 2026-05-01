# Sergeant — Devin context

> **Last validated:** 2026-04-30 by @Skords-01. **Next review:** 2026-07-29.
> **Status:** Active

> Full agent rules, hard rules, anti-patterns, and domain invariants are in **[`AGENTS.md`](./AGENTS.md)**.
> This file adds Devin-specific context on top of it. For Claude Code see [`CLAUDE.md`](./CLAUDE.md).

## Repo snapshot

- **pnpm 9** + **Turborepo** monorepo, Node 20, TypeScript 6.
- **Apps:** `apps/web` (Vite + React 18), `apps/server` (Express + PostgreSQL), `apps/mobile` (Expo 52), `apps/mobile-shell` (Capacitor), `apps/console` (Telegram bot, grammy + Anthropic).
- **Packages:** `@sergeant/shared`, `@sergeant/api-client`, `@sergeant/config`, `@sergeant/design-tokens`, `@sergeant/insights`, `eslint-plugin-sergeant-design`, 4 domain packages (10 total).
- Language: code in English/Ukrainian mixed; prose docs in **Ukrainian** (see `AGENTS.md` § Soft rules).

## Quick commands

```bash
pnpm dev:server          # API on :3000
pnpm dev:web             # Vite on :5173 (proxies /api → :3000)
pnpm lint                # ESLint + imports + plugin tests
pnpm typecheck           # TypeScript
pnpm test                # Vitest all
pnpm check               # lint + typecheck + test + build (full CI)
pnpm db:up               # Start Postgres (Docker)
pnpm db:migrate          # Run migrations
pnpm gen                 # Plop code generators (migration, rq-hook, hubchat-tool, endpoint, adr)
pnpm gen:adr             # New ADR (auto-numbers from docs/adr/)
pnpm format:check        # Prettier (CI uses this exact command)
pnpm docs:check-links    # Scan every .md for broken [text](target) links (CI: --strict-external + docs/external-link-allowlist.json)
pnpm docs:gen-playbook-index       # Regenerate docs/playbooks/INDEX.md
pnpm docs:check-playbook-index     # CI: fail if INDEX.md is stale
pnpm docs:check-playbook-schema    # CI: every playbook has H1 + freshness + Status + Trigger
pnpm docs:freshness-dashboard      # Build dist/freshness-dashboard.html
pnpm lint:ai-legacy                # CI gate: fail on expired/malformed `// AI-LEGACY: expires …` markers
pnpm ai-legacy:dashboard           # Build dist/ai-legacy-dashboard.html
pnpm lint:hard-rules-registry      # CI gate: validates docs/governance/hard-rules.json ↔ AGENTS.md ↔ CONTRIBUTING.md
pnpm hard-rules:generate           # Regenerate docs/governance/hard-rules-matrix.md from hard-rules.json
pnpm hard-rules:check              # CI gate: fail if hard-rules-matrix.md is stale
pnpm hard-rules:list               # Plain-text dump of every Hard Rule (for code-review / triage)
pnpm lint:codeowners               # CI gate: fail if required path is missing from .github/CODEOWNERS
pnpm n8n:export                    # Export n8n workflows from live instance to ops/n8n-workflows/
pnpm n8n:import                    # Import ops/n8n-workflows/ into live n8n instance
pnpm ops:n8n:validate              # CI gate: validates n8n workflow JSON + manifest consistency
pnpm lint:governance-sync          # CI: Hard Rules sync, Status badge coverage, dangling source refs
pnpm lint:governance-sync --strict # Treat dangling refs as errors (for new PRs — no new broken refs)
```

## Before you write code

> Hard Rule #15 in `AGENTS.md` applies to AI agents: complete this pre-flight before implementing.

1. Read the relevant playbook in `docs/playbooks/` — pick by trigger phrase (e.g. "нова API-функціональність" → `add-api-endpoint.md`; "remove dead code" → `cleanup-dead-code.md`). Decision-tree playbooks are marked 🌳 — start at Q1.
2. Check [`AGENTS.md` § Hard rules](AGENTS.md#hard-rules-do-not-break) — especially #1 (bigint→number coercion), #2 (RQ key factories), #4 (sequential migrations + two-phase DROP), #5 (commit scope enum), #8 (Tailwind opacity scale), #9 (`-strong` brand fills behind `text-white`), #11 (no hex in className), #12 (module-accent containment), #14 (focus-visible over focus), #15 (read governance + update docs).
3. Before deleting any file, run `pnpm dead-code:files` (which honours `@scaffolded` markers — Hard Rule #10). Never delete a scaffolded file just because it has zero importers.
4. New HubChat tool? Needs **3 coordinated edits** — see [`docs/playbooks/add-hubchat-tool.md`](docs/playbooks/add-hubchat-tool.md) and the `sergeant-hubchat-tool` skill.
5. New migration? Use `pnpm gen migration --name <desc>` — auto-numbers from last migration. See the `sergeant-sql-migrations` skill.
6. Before opening the PR, update docs alongside code (Hard Rule #15): api-client types, design-system docs, playbooks, freshness headers — see the must-update table in `AGENTS.md` § Hard Rule #15.

## Devin-specific

### Skills (`.agents/skills/`)

Use the in-repo SKILL.md library when relevant. Skills auto-load from [`.agents/skills/`](.agents/skills/) at session start.

**Project-specific skills (prefer these first):**

- `sergeant-design-system` — Tailwind tokens, brand palettes, WCAG-AA rules, module-accent containment (Hard Rules #8, #9, #11, #12, #13, #14)
- `sergeant-api-patterns` — bigint coercion, api-client sync, RQ key factories (Hard Rules #1, #2, #3)
- `sergeant-hubchat-tool` — adding/modifying HubChat AI assistant tools
- `sergeant-sql-migrations` — migration numbering, two-phase DROP (Hard Rule #4)
- `sergeant-postgres` — PostgreSQL patterns with raw `pg` driver

**Community skills:**

- `better-auth-best-practices` — Better Auth integration guide
- `vercel-react-best-practices` — React performance (note: Next.js/RSC sections do not apply, Sergeant uses Vite)
- `vercel-react-native-skills` — React Native / Expo best practices
- `vercel-composition-patterns` — React composition (note: React 19 section does not apply yet)
- `ui-ux-pro-max` — UI/UX design intelligence (use alongside `sergeant-design-system` for project tokens)
- `frontend-design` — distinctive frontend interfaces (use alongside `sergeant-design-system`)
- `browser-use` — browser automation via CLI
- `brainstorming` — design process before implementation
- `find-skills` — discover and install new skills
- `skill-creator` — create and improve skills

### In-repo playbooks vs Devin-webapp macros

Single source of truth is [`docs/playbooks/`](docs/playbooks/). Several Devin-webapp playbooks exist as thin wrappers and **delegate** to the repo files — always defer to the in-repo one if there is any disagreement:

| Devin-webapp macro | In-repo playbook                                                                |
| ------------------ | ------------------------------------------------------------------------------- |
| `!rn_port`         | [`port-web-screen-to-mobile.md`](docs/playbooks/port-web-screen-to-mobile.md)   |
| `!rn_sync`         | [`sync-rn-migration-progress.md`](docs/playbooks/sync-rn-migration-progress.md) |
| `!fix_ci`          | [`fix-failing-ci.md`](docs/playbooks/fix-failing-ci.md)                         |
| `!docs_prettier`   | [`prettier-pass-on-docs.md`](docs/playbooks/prettier-pass-on-docs.md)           |

### Testing HubChat without UI

`apps/server` exposes `/api/chat`. To test a tool-call end-to-end without opening the web app:

```bash
curl -sS -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: $(cat .devin-session-cookie)" \
  -d '{"messages":[{"role":"user","content":"<prompt>"}]}'
```

See [`CONTRIBUTING.md` § Working with HubChat locally](CONTRIBUTING.md) for the full curl recipe and how to inspect `tool_use` blocks in the response.

### Browser automation via CDP

A persistent Chrome runs at `http://localhost:29229` with CDP exposed. Attach Playwright with `p.chromium.connect_over_cdp("http://localhost:29229")` for SSO/OAuth flows or systematic data entry. Use `--user-data-dir=/home/ubuntu/.browser_data_dir` if you ever relaunch Chrome so the profile persists.

### Test users

Primary test user (staging dev DB): `I3BUW5atld8oOHM7lpFEJBIInpW1hzv7` — 6 Monobank accounts, ~2 246 ₴ on UAH cards. Do not destructively mutate this user's data.

## Verification before PR

```bash
pnpm format:check                                   # Prettier
pnpm lint                                           # ESLint
pnpm typecheck                                      # TypeScript
pnpm --filter <package> exec vitest run <path>      # affected tests
pnpm --filter @sergeant/web exec size-limit         # bundle budget (when touching apps/web)
pnpm licenses:check                                 # when bumping deps
```

## Branch & commit

- Feature branches: `devin/<unix-ts>-<area>-<desc>`.
- Commits: Conventional Commits with explicit scope from [`AGENTS.md` rule #5](AGENTS.md#5-conventional-commits-explicit-scope-enum). **Do not invent** scopes (e.g. `mobile/core`, `app`, `monorepo` — commitlint rejects).
- Never `--no-verify`, never `--amend`, never force-push shared branches (`AGENTS.md` rules #6, #7).

## Deployment

- **Frontend:** Vercel — auto-deploys on push to `main` (preview on every PR).
- **Backend:** Railway via `Dockerfile.api` — pre-deploy runs `pnpm db:migrate`. Health: `/health`. Migrations need `MIGRATE_DATABASE_URL` (public DB URL).
- **Local DB:** `pnpm db:up` → PostgreSQL on `:5432` (`postgresql://hub:hub@localhost:5432/hub`).

## Secrets needed for full local dev

```
ANTHROPIC_API_KEY=       # Claude API
BETTER_AUTH_SECRET=      # 32+ chars, any string
AI_QUOTA_DISABLED=1      # skip quota checks locally
DATABASE_URL=postgresql://hub:hub@localhost:5432/hub
```

See `.env.example` for the full list.
