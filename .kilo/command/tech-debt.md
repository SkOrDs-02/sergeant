---
description: Find and fix tech debt — dead code, lint baseline, Knip unused
---

Scan for and optionally fix technical debt.

1. **Dead code (Knip):** `pnpm exec knip --no-exit-code` — list unused files, exports, dependencies.
2. **ESLint baseline:** `pnpm lint 2>&1 | Select-String "error"` — count current errors vs baseline.
3. **TypeScript strictness:** Check for `noUncheckedIndexedAccess` violations in changed files.
4. **AI-legacy markers:** `pnpm lint:ai-legacy` — find expired `AI-LEGACY` comments.
5. **Module size:** Find files >600 lines in `apps/web` and `apps/server` (Hard Rule #18).
6. Produce report:

   ## Tech Debt Scan
   - **Unused code (Knip):** N items (list top 5)
   - **ESLint errors:** N (vs baseline)
   - **AI-legacy expired:** N markers
   - **Oversized modules:** N files >600 lines
   - **Recommendation:** <prioritized list of 2-3 items to tackle>

If user says "fix", address items one at a time starting with highest impact. Run `pnpm check` after each fix.
