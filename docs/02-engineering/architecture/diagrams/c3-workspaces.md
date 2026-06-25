# C3 — Workspace dependency graph

> **Last validated:** 2026-06-25 by @Skords-01. **Next review:** 2026-09-23.
> **Status:** Active

<!-- AUTO-GENERATED FILE. Do not edit by hand. Regenerate via `pnpm docs:gen-architecture-diagrams`. -->

Workspace-level dependency view of `@sergeant/*` import edges. Derived from [`docs/04-governance/governance/symbol-index.json`](../../../04-governance/governance/symbol-index.json) (Phase 2 symbol catalog). Each edge `A → B` means workspace **A** imports at least one symbol from workspace **B** via static ESM `import` / `export from` statements.

**Limitations:** does not include dynamic `await import()`, runtime `require()`, or `peerDependencies` declared in `package.json`. For runtime deployment topology see [`c2-containers.md`](./c2-containers.md); for feature-level flows see `c3-cloudsync.md` / `c3-chat-tool-use.md`; for the rationale on what is and isn't auto-generated see [ADR-0060](../../../04-governance/adr/0060-architecture-diagrams-automation-scope.md).

## Graph

```mermaid
flowchart LR
    subgraph apps["apps"]
        apps_mobile["@sergeant/mobile"]
        apps_mobile_shell["@sergeant/mobile-shell"]
        apps_server["@sergeant/server"]
        apps_web["@sergeant/web"]
    end
    subgraph packages["packages"]
        packages_api_client["@sergeant/api-client"]
        packages_config["@sergeant/config"]
        packages_db_schema["@sergeant/db-schema"]
        packages_design_tokens["@sergeant/design-tokens"]
        packages_eslint_plugin_sergeant_design["eslint-plugin-sergeant-design"]
        packages_finyk_domain["@sergeant/finyk-domain"]
        packages_fizruk_domain["@sergeant/fizruk-domain"]
        packages_insights["@sergeant/insights"]
        packages_nutrition_domain["@sergeant/nutrition-domain"]
        packages_openclaw_plugin["@sergeant/openclaw-plugin"]
        packages_routine_domain["@sergeant/routine-domain"]
        packages_shared["@sergeant/shared"]
    end
    apps_mobile --> packages_api_client
    apps_mobile --> packages_design_tokens
    apps_mobile --> packages_finyk_domain
    apps_mobile --> packages_fizruk_domain
    apps_mobile --> packages_insights
    apps_mobile --> packages_nutrition_domain
    apps_mobile --> packages_routine_domain
    apps_mobile --> packages_shared
    apps_mobile_shell --> packages_shared
    apps_server --> packages_shared
    apps_web --> packages_api_client
    apps_web --> packages_design_tokens
    apps_web --> packages_finyk_domain
    apps_web --> packages_fizruk_domain
    apps_web --> packages_insights
    apps_web --> packages_nutrition_domain
    apps_web --> packages_routine_domain
    apps_web --> packages_shared
    packages_api_client --> packages_shared
    packages_finyk_domain --> packages_shared
    packages_fizruk_domain --> packages_shared
    packages_insights --> packages_design_tokens
    packages_insights --> packages_shared
    packages_nutrition_domain --> packages_shared
    packages_shared --> packages_design_tokens

    classDef app fill:#1d4ed8,stroke:#1e40af,color:#fff
    classDef tool fill:#b45309,stroke:#7c2d12,color:#fff
    classDef package fill:#15803d,stroke:#166534,color:#fff
    class apps_mobile,apps_mobile_shell,apps_server,apps_web app
    class packages_api_client,packages_config,packages_db_schema,packages_design_tokens,packages_eslint_plugin_sergeant_design,packages_finyk_domain,packages_fizruk_domain,packages_insights,packages_nutrition_domain,packages_openclaw_plugin,packages_routine_domain,packages_shared package
```

## Stats

- **16** workspaces total — 4 apps, 12 packages, 0 tools.
- **25** cross-workspace import edges.

## Top imported workspaces

The packages most other workspaces depend on. `Importers` = unique file count across all workspaces; `Exports` = symbols declared at the workspace entry.

| Rank | Workspace                    | Importers | Exports |
| ---- | ---------------------------- | --------- | ------- |
| 1    | `@sergeant/shared`           | 358       | 1       |
| 2    | `@sergeant/nutrition-domain` | 90        | 1       |
| 3    | `@sergeant/fizruk-domain`    | 82        | 1       |
| 4    | `@sergeant/routine-domain`   | 63        | 1       |
| 5    | `@sergeant/api-client`       | 39        | 200     |

## Drift detection

If a new workspace lands (or an existing one starts importing a new `@sergeant/*`) and this file is not regenerated, `pnpm docs:check-architecture-diagrams` fails in CI. To refresh:

```bash
pnpm docs:gen-symbols                  # refresh symbol-index.json (Phase 2)
pnpm docs:gen-architecture-diagrams    # regenerate this diagram
```

Both must succeed before commit.
