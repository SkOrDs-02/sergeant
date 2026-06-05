# Submit at: https://github.com/Kilo-Org/kilocode/issues/new

(After Hard Rule #20 + SECURITY note in AGENTS.md, never paste the GitHub PAT into tracked files. The body below contains NO secrets — it is the public issue text.)

---

Title: **Support secret-references in `kilo.json` MCP env to avoid plaintext PATs**

## Summary

Kilo's local MCP config stores secrets as plain strings. Add support for `{{env:VAR}}`, `{{keyring:s/a}}`, and `{{file:/path}}` reference syntax in `mcp.<name>.environment.*` so secrets can live in the OS keyring / env / secret files instead of plaintext JSON.

## Motivation

Real-world `kilo.json` from one of our projects contains a `ghp_…` PAT. This conflicts with:

- our **gitleaks pre-commit hook** (Hard Rule #7 — secrets must not be in tracked files),
- the project's own **Hard Rule #20** ("no PATs in prod"),
- basic secret-handling hygiene. The config is per-user, but it's still on disk in plaintext and would be picked up by any backup / sync tool.

Even though `kilo.json` is gitignored, the _global_ `~/.config/kilo/kilo.json` is sync-able (dotfile repos, iCloud, OneDrive), and the **principle of least surprise** says secrets shouldn't live next to non-secret config.

## Proposal

Allow **secret references** alongside literal strings in `mcp.<name>.environment.*`:

```jsonc
{
  "mcp": {
    "github": {
      "type": "local",
      "command": ["npx", "-y", "@modelcontextprotocol/server-github"],
      "environment": {
        "GITHUB_API_URL": "https://api.github.com",
        "GITHUB_PERSONAL_ACCESS_TOKEN": "{{keyring:kilo/mcp/github}}",
      },
    },
  },
}
```

### Resolvers

| Syntax                        | Resolver                                                                        | Use case                               |
| ----------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| `{{env:VAR}}`                 | process env of the Kilo CLI                                                     | CI runners, dev shells                 |
| `{{keyring:service/account}}` | OS keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service) | Interactive desktop sessions           |
| `{{file:/abs/path}}`          | read from file                                                                  | Docker `/run/secrets/`, vault sidecars |

### Resolution rules

1. At MCP server spawn, walk each `environment` value.
2. If it matches `{{...}}` and the inner is a known resolver, resolve. Otherwise fail fast with a clear error pointing at the offending key.
3. The **resolved** value is passed to the child process as an env var (same as today). The child process never sees the reference syntax.
4. Resolution errors fail the MCP startup with a non-zero exit; Kilo surfaces: `MCP github failed to start: GITHUB_PERSONAL_ACCESS_TOKEN resolver keyring:kilo/mcp/github returned ACCESS_DENIED`.
5. Resolved values are **never** logged, **never** written back to `kilo.json`, and **never** appear in `--debug` output. PII redaction policy extends to this path.
6. A `kilo mcp secret set <name> <keyring-path>` CLI helper writes the secret once, then rewrites `kilo.json` to a reference.

### Backwards compatibility

- Literal strings stay supported. The change is **additive** — existing `kilo.json` files keep working.
- Detection: any value containing `{{` and `}}` is treated as a reference; everything else is literal.
- `kilo.jsonc` parser is already in place, no parser changes needed.

## Why not just use env vars?

Devs already do this for the CLI itself, but:

- They have to remember to `export GITHUB_PAT=…` before launching Kilo, every shell, every reboot.
- The MCP **definition** in JSON still has to reference the var name — but the var name is just a string today, indistinguishable from any other. No schema-level signal that "this must come from somewhere secret".
- No rotation story.

## Why not just point users at a `.env` file?

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

## Acceptance criteria

- [ ] Reference syntax parsed at MCP spawn, not at config load.
- [ ] `env`, `keyring`, `file` resolvers implemented and unit-tested.
- [ ] Resolved values never appear in logs / debug output / `--json` dumps.
- [ ] `kilo mcp secret set / rotate / unset` CLI works.
- [ ] `kilo doctor` warns on literal PAT-shaped values.
- [ ] Backwards compatible: existing `kilo.json` files keep working.
- [ ] Docs: a "Secret references" page in `kilo.ai/docs` with copy-pasteable examples for each resolver.

## Out of scope (for follow-up)

- Vault / Doppler / 1Password CLI integrations.
- Per-MCP secret TTLs.
- Org-wide secret distribution (SSO).
