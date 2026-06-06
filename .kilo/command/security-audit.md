---
description: Run security audit — deps, secrets, OWASP checks
---

Run a comprehensive security audit on the current working tree.

1. **Dependency audit:** `pnpm audit --audit-level=high` — report any HIGH/CRITICAL CVEs.
2. **Secret scan:** Search for common secret patterns in staged and unstaged files:
   - `ghp_`, `gho_`, `sk-`, `AKIA`, `-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----`
   - Use `git diff --cached` and `git diff` to scan only changed lines.
3. **OpenClaw PAT check:** Verify no PAT tokens in production code (Hard Rule #20).
4. **Pino redaction check:** Verify sensitive fields (password, token, secret, authorization) are in `redact` paths in server logger config.
5. Produce a report:

   ## Security Audit
   - **Dependencies:** ✅ clean / ❌ N vulnerabilities (list)
   - **Secrets in diff:** ✅ none / ❌ found in <file:line>
   - **OpenClaw PATs:** ✅ none / ❌ found in <file:line>
   - **Pino redaction:** ✅ configured / ⚠️ missing for <field>
   - **Recommendation:** <one-line next step>

Do NOT auto-fix. Report findings and let the user decide.
