# Proposal: secret-references in `kilo.json` MCP config

> **Status:** Draft for kilo-core. **Audience:** kilo-core maintainers. **Author:** @Skords-01.
> **Local mirror:** `E:\.claude\Sergeant\.kilo\proposals\secret-references-in-kilo-config.md`.
> **Issue body:** see "Issue body (paste-ready)" at the bottom.

## Problem

Kilo Code's local MCP config (`kilo.json` / `kilo.jsonc`) stores secrets — most importantly the GitHub MCP PAT — as plain string values under `mcp.<name>.environment.<VAR>`. Example from a real project:

```json
"mcp": {
  "github": {
    "type": "local",
    "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
    "environment": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_••••••••••••••••••••••"
    }
  }
}
```

This conflicts with:

1. **Best practice** — secrets should never live in tracked JSON. Kilo config is per-project and per-user, but global config (`C:\Users\<u>\.config\kilo\kilo.json`) is still on disk in plaintext.
2. **Compliance** — projects that run gitleaks / pre-commit secret scanners (e.g. Sergeant's `pnpm lint:secrets` + `scripts/pre-commit-gitleaks.mjs`) will trip on PATs in `kilo.json` if the file is ever committed by accident or sync'd to a backup.
3. **Multi-environment workflows** — devs using the same config across dev/CI/prod can't swap creds without file edits.
4. **Rotation** — rotating a PAT means editing JSON manually.

## Proposal

Extend the MCP `environment` field to accept **secret references** alongside literal strings. Three resolvers, pluggable:

| Syntax                          | Resolver                                                                  | Use case                               |
| ------------------------------- | ------------------------------------------------------------------------- | -------------------------------------- |
| `"{{env:HOME_VAR}}"`            | process env of Kilo CLI                                                   | CI runners, dev shells                 |
| `"{{keyring:service/account}}"` | OS keyring (Windows Credential Manager / macOS Keychain / Secret Service) | Interactive desktop sessions           |
| `"{{file:/absolute/path}}"`     | read from file                                                            | Docker `/run/secrets/`, vault sidecars |

### Schema sketch

```jsonc
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": {
        // hybrid: literal strings still work for non-secret config
        "GITHUB_API_URL": "https://api.github.com",
        // secret reference: resolved at MCP spawn time
        "GITHUB_PERSONAL_ACCESS_TOKEN": "{{keyring:kilo/mcp/github}}",
      },
    },
  },
}
```

### Resolution rules

1. At MCP server spawn, walk each `environment` value.
2. If it matches `{{...}}` and the inner is a known resolver (`env`, `keyring`, `file`), resolve. Otherwise fail fast with a clear error pointing at the offending key.
3. The **resolved** value is passed to the child process as an env var (same as today). The child process never sees the reference syntax.
4. Resolution errors fail the MCP startup with a non-zero exit; Kilo surfaces "MCP `github` failed to start: `GITHUB_PERSONAL_ACCESS_TOKEN` resolver `keyring:kilo/mcp/github` returned ACCESS_DENIED".
5. Resolved values are **never** logged, **never** written back to `kilo.json`, and **never** appear in `--debug` output. PII redaction policy (Hard Rule #21) extends to this path.
6. A `kilo mcp secret set <name> <keyring-path>` CLI helper writes the secret once, then references it in JSON.

### Backwards compatibility

- Literal strings stay supported. The change is **additive** — existing `kilo.json` files keep working.
- Detection: any value containing `{{` and `}}` is treated as a reference; everything else is literal.
- `kilo.jsonc` (JSONC parser) is already in place, so no parser changes needed.

### Why not just use env vars?

Devs already do this for the CLI itself, but:

- They have to remember to `export GITHUB_PAT=…` before launching Kilo, every shell, every reboot.
- The MCP **definition** in JSON still has to reference the var name — but the var name is just a string today, indistinguishable from any other. No schema-level signal that "this must come from somewhere secret".
- No rotation story.

### Why not just point users at a `.env` file?

`.env` works but has the same on-disk-plaintext problem, plus needs a loader registered per MCP. Secret references are a step up: the secret **never** touches the working tree.

## Alternatives considered

- **A. Force all secrets to come from env vars** — breaks DX, no keychain story, no atomic rotation.
- **B. Encrypt `kilo.json` at rest with a user passphrase** — too heavy; defeats the point of an openable config; tooling can't read it without the user typing a password.
- **C. Move MCP config out of project entirely** — fragments the model: "which MCPs are wired for this project?" loses the local-config story.

## Migration plan

1. Land resolver support behind `--experimental-secret-refs` flag for one release.
2. Add a `kilo mcp migrate-github-pat` command that reads the literal PAT, writes it to keyring (interactive confirm), and rewrites `kilo.json` to a reference.
3. Document the three resolvers in the user guide + link from any `kilo init` output.
4. Add a lint rule: `kilo doctor` warns if any `mcp.*.environment.*` value matches a known PAT regex (`ghp_*`, `sk-*`, `xox[abp]-*`).

## Security notes

- Keyring access is per-OS-user; on Linux requires Secret Service (gnome-keyring / KWallet).
- File resolver should refuse to read paths outside an allowlist by default (e.g. `/run/secrets/`, `~/.config/kilo/secrets/`). World-readable paths in `$HOME` are blocked.
- Resolution must happen in the **parent** Kilo process, not the spawned MCP server, so the child never holds a reference parser — it sees a normal env var.
- Audit log: emit a `mcp.secret.resolved` event (without value) for traceability.

## Out of scope (for follow-up)

- Vault / Doppler / 1Password CLI integrations.
- Per-MCP secret TTLs.
- Org-wide secret distribution (SSO).

## Success criteria

- A user can rotate the GitHub PAT by running `kilo mcp secret rotate github` without editing any JSON.
- `pnpm lint:secrets` (gitleaks) passes on repos whose `kilo.json` only contains references.
- No literal PATs in `kilo.json` files in the wild (telemetry from `kilo doctor`).

---

## Issue body (paste-ready)

````markdown
## Summary

Kilo's local MCP config stores secrets as plain strings. Add support for
`{{env:VAR}}`, `{{keyring:s/a}}`, and `{{file:/path}}` reference syntax in
`mcp.<name>.environment.*` so secrets can live in the OS keyring / env / secret
files instead of plaintext JSON.

## Motivation

Real-world `kilo.json` from one of our projects contains a `ghp_…` PAT. This
conflicts with our gitleaks pre-commit hook, our Hard Rule #20 ("no PATs in
prod"), and basic secret-handling hygiene. The config is per-user, but it's
still on disk in plaintext and would be picked up by any backup / sync tool.

## Proposal

Allow secret references alongside literal strings:

```jsonc
"environment": {
  "GITHUB_API_URL": "https://api.github.com",
  "GITHUB_PERSONAL_ACCESS_TOKEN": "{{keyring:kilo/mcp/github}}"
}
```
````

Resolvers:

- `{{env:VAR}}` — read from parent process env
- `{{keyring:service/account}}` — OS keyring (Windows Credential Manager,
  macOS Keychain, Linux Secret Service)
- `{{file:/abs/path}}` — read from file (for `/run/secrets/` etc.)

Resolution happens at MCP spawn time in the **parent** Kilo process. The child
MCP server receives a normal env var and never sees the reference syntax.
Resolved values are redacted from logs and never written back to `kilo.json`.

Backwards compatible: literal strings keep working; only `{{...}}` values are
treated as references.

Add a `kilo mcp secret set <name>` helper that writes to keyring and updates
`kilo.json` to a reference. Add a `kilo doctor` check that warns on literal
values matching known PAT regexes (`ghp_*`, `sk-*`, `xox[abp]-*`).

## Alternatives

- Force all secrets to env vars → breaks DX, no rotation story.
- Encrypt `kilo.json` at rest → too heavy, defeats the openable-config model.
- Move MCP config out of project → fragments the model.

Full proposal with schema sketch, resolution rules, and migration plan:
[link to docs/proposals/secret-references-in-kilo-config.md or paste here]

## Acceptance criteria

- [ ] Reference syntax parsed at MCP spawn, not at config load.
- [ ] `env`, `keyring`, `file` resolvers implemented and unit-tested.
- [ ] Resolved values never appear in logs / debug output / `--json` dumps.
- [ ] `kilo mcp secret set / rotate / unset` CLI works.
- [ ] `kilo doctor` warns on literal PAT-shaped values.
- [ ] Backwards compatible: existing `kilo.json` files keep working.

```

```
