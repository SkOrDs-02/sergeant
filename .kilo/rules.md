# Sergeant — Kilo Code Rules

## Stack

- **Monorepo:** pnpm 9.15.1 + Turborepo, Node 22.x, TypeScript 6
- **Apps:** `apps/web` (React + Vite + Tailwind), `apps/server` (Node.js), `apps/mobile` (Expo/RN), `apps/mobile-shell`
- **Packages:** `@sergeant/*` shared packages + 4 domain packages
- **DB:** PostgreSQL via Drizzle ORM, migrations in `db-schema/migrations/`
- **Auth:** Better Auth (opaque string user IDs, not UUIDs)
- **Time:** Europe/Kyiv for all day boundaries
- **Money:** kopiykas as `number` (minor units), never raw `bigint` from DB

## Code Style

- Write concise, technical TypeScript. Use functional patterns, avoid classes.
- Prefer interfaces over types. Use `function` keyword for pure functions.
- Descriptive variable names with auxiliary verbs: `isLoading`, `hasError`, `canSubmit`.
- Path aliases (`@shared/*`, `@finyk/*`) over relative `../../../`.
- No enums — use `const` maps or string literal unions.
- No comments unless non-obvious WHY. Never reference the current task in comments.
- No backwards-compat shims for unshipped code — delete unused stuff cleanly.

## React / Web (`apps/web`)

- Tailwind CSS for styling. No arbitrary hex in `className` — use design tokens.
- `focus-visible:` for visible focus indicators, never bare `focus:`.
- Touch targets ≥44×44 on coarse pointers.
- RQ keys only via `apps/web/src/shared/lib/api/queryKeys.ts` factories.
- Semantic HTML, ARIA labels, keyboard navigation.

## Server (`apps/server`)

- Coerce `bigint` to `number` in all serializers before sending to clients.
- Pino redaction policy enforced — no secrets in logs.
- No OpenClaw PATs in production code.

## Mobile (`apps/mobile`, `apps/mobile-shell`)

- Expo managed workflow. Expo Router for navigation.
- `SafeAreaProvider` + `SafeAreaView` for safe areas.
- `expo-image` for optimized images. WebP where supported.

## DB / Migrations

- Sequential migration numbering, no gaps.
- Two-phase for DROP (deprecate → remove in next migration).
- Never edit a published migration.

## Git & Commits

- Conventional Commits with explicit scope: `web`, `server`, `mobile`, `shared`, `api-client`, `db-schema`, `migrations`, `deps`, `docs`, `ci`, `root`, etc.
- Branch naming: `devin/<unix-ts>-<short-area>-<desc>`.
- No force push to main/master. No `--no-verify`.

## Verification

- `pnpm check` = `pnpm format:check && pnpm lint && pnpm check:typecheck-and-test && pnpm build`
- Run before every PR. When changing UI, attach screenshot.
- When bumping deps: `pnpm licenses:check` + `pnpm --filter @sergeant/web size`.

## Kilo-Specific

- Use `task` tool with named `subagent_type` for parallel/independent work.
- Use `agent_manager` for isolated worktrees on parallel branches.
- Use `kilo_local_recall` before re-deriving context from past sessions.
- Use `background_process` for dev servers — never `&` or `Start-Process`.
- Use `skill` tool to load skills — never read SKILL.md directly.
