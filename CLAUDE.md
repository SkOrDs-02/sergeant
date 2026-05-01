# Sergeant — Claude Code context

> **Last validated:** 2026-04-30 by @Skords-01. **Next review:** 2026-07-29.
> **Status:** Active

> Full agent rules, hard rules, anti-patterns, and domain invariants are in **[`AGENTS.md`](./AGENTS.md)**.
> This file adds Claude Code–specific context on top of it.

## Repo snapshot

- **pnpm 9** + **Turborepo** monorepo, Node 20, TypeScript 6.
- **Apps:** `apps/web` (Vite + React 18), `apps/server` (Express + PostgreSQL), `apps/mobile` (Expo 52), `apps/mobile-shell` (Capacitor), `apps/console` (Telegram bot, grammy + Anthropic).
- **Packages:** `@sergeant/shared`, `@sergeant/api-client`, `@sergeant/config`, `@sergeant/design-tokens`, `@sergeant/insights`, 4 domain packages.
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

1. Read the relevant playbook in `docs/playbooks/` — pick by trigger phrase (e.g. "нова API-функціональність" → `add-api-endpoint.md`; "remove dead code" → `cleanup-dead-code.md`).
2. Check `AGENTS.md` § Hard rules — especially bigint coercion (#1), RQ keys (#2), migration numbering (#4), Tailwind opacity scale (#8), `-strong` brand fills (#9), lifecycle markers (#10), no hex in className (#11), module-accent containment (#12), focus-visible over focus (#14), governance + docs discipline (#15).
3. Before deleting any file, run `pnpm dead-code:files` (which honours `@scaffolded` markers — Hard Rule #10). Never delete a scaffolded file just because it has zero importers.
4. New HubChat tool? Needs **3 coordinated edits** — see `docs/playbooks/add-hubchat-tool.md` and `sergeant-hubchat`.
5. New migration? Use `pnpm gen migration --name <desc>` — auto-numbers from last migration (`021`). See `sergeant-data-and-migrations`.
6. Before opening the PR, update docs alongside code (Hard Rule #15): api-client types, design-system docs, playbooks, freshness headers — see the must-update table in `AGENTS.md` § Hard Rule #15.

## Testing HubChat without UI

`apps/server` exposes `/api/chat`. To test a tool-call end-to-end without opening the web app:

```bash
curl -sS -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Cookie: <session-cookie>" \
  -d '{"messages":[{"role":"user","content":"<prompt>"}]}'
```

See [`CONTRIBUTING.md` § Working with HubChat locally](CONTRIBUTING.md) for the full curl recipe and how to inspect `tool_use` blocks in the response.

## Test users

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

- Feature branches: `devin/<unix-ts>-<area>-<desc>` or `claude/<desc>`.
- Commits: Conventional Commits with explicit scope from [`AGENTS.md` rule #5](AGENTS.md#5-conventional-commits-explicit-scope-enum). **Do not invent** scopes (e.g. `mobile/core`, `app`, `monorepo` — commitlint rejects).
- Never `--no-verify`, never `--amend`, never force-push shared branches (`AGENTS.md` rules #6, #7).

## Deployment

- **Frontend:** Vercel — auto-deploys on push to `main`.
- **Backend:** Railway via `Dockerfile.api` — pre-deploy runs `pnpm db:migrate`.
- **Local DB:** `pnpm db:up` → PostgreSQL on `:5432` (`postgresql://hub:hub@localhost:5432/hub`).

## Secrets needed for full local dev

```
ANTHROPIC_API_KEY=       # Claude API
BETTER_AUTH_SECRET=      # 32+ chars, any string
AI_QUOTA_DISABLED=1      # skip quota checks locally
DATABASE_URL=postgresql://hub:hub@localhost:5432/hub
```

See `.env.example` for the full list.

## Skills (`.agents/skills/`)

The repo ships in-repo skills that provide domain-specific guidance. Refer to these when working on the matching area:

Start with `sergeant-start-here`, then load one matching specialist skill from `docs/superpowers/agent-skills-catalog.md`.

**Primary Sergeant skills:**

- `sergeant-feature-delivery`
- `sergeant-bugfix-and-regression`
- `sergeant-review-and-merge`
- `sergeant-web-ui`
- `sergeant-server-api`
- `sergeant-data-and-migrations`
- `sergeant-mobile-expo`
- `sergeant-hubchat`
- `sergeant-monorepo-boundaries`
- `sergeant-deploy-and-observability`
- `better-auth-best-practices`
