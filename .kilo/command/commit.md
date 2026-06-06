---
description: Create a conventional commit with proper scope and message
argument-hint: "<scope> <type>: <description>"
---

Create a git commit following project conventions (Hard Rule #5).

1. Parse `$ARGUMENTS` for scope and description. Valid scopes: `web`, `server`, `mobile`, `mobile-shell`, `openclaw`, `shared`, `api-client`, `finyk-domain`, `fizruk-domain`, `nutrition-domain`, `routine-domain`, `insights`, `design-tokens`, `config`, `db-schema`, `eslint-plugins`, `openclaw-plugin`, `migrations`, `agents`, `deps`, `docs`, `ci`, `root`.
2. If scope is missing or invalid, ask the user to specify.
3. Stage relevant files: `git add -A` (or specific files if user specifies).
4. Create commit: `git commit -m "$ARGUMENTS"`
5. Show the created commit: `git log -1 --format="%H %s%n%b"`

Do NOT push. Only commit locally.
