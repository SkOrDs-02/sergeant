---
description: Audit dependencies — outdated, unused, bundle size impact
---

Audit project dependencies for health and size.

1. **Outdated packages:** `pnpm outdated --format json 2>$null | ConvertFrom-Json | Get-Member -MemberType NoteProperty | Select-Object Name` — list packages with newer versions available.
2. **Unused packages (Knip):** `pnpm exec knip --no-exit-code 2>$null` — list unused exports/files/deps.
3. **Bundle size:** `pnpm --filter @sergeant/web size 2>$null` — report current bundle vs budget (JS ≤ 1.1 MB brotli, CSS ≤ 36 kB brotli).
4. **License check:** `pnpm licenses:check 2>$null` — flag any non-allowed licenses.
5. Produce report:

   ## Dependency Audit
   - **Outdated:** N packages (list top 5 by semver distance)
   - **Unused (Knip):** N items (list top 5)
   - **Bundle size:** JS: X / 1100 kB • CSS: Y / 36 kB
   - **Licenses:** ✅ clean / ❌ N issues
   - **Recommendation:** <e.g. "bump react-query", "remove unused lodash">

Do NOT auto-bump. Report findings and let the user decide.
