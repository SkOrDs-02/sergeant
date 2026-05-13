// @ts-check

/**
 * Scope enum mirrors AGENTS.md hard rule #5.
 * Keep this list in sync with the table there.
 */
const SCOPES = [
  "web",
  "server",
  "mobile",
  "mobile-shell",
  // PR-47 — `console` deprecated alias kept for back-compat with existing
  // open PRs. New commits SHOULD use `openclaw`. Removed in PR-47 phase 2
  // once Dockerfile.console / railway.console.toml are also renamed.
  "console",
  "openclaw",
  "shared",
  "api-client",
  "finyk-domain",
  "fizruk-domain",
  "nutrition-domain",
  "routine-domain",
  "insights",
  "design-tokens",
  "config",
  "db-schema",
  "eslint-plugins",
  "openclaw-plugin",
  "migrations",
  "agents",
  "deps",
  "docs",
  "ci",
  "root",
];

/** @type {import('@commitlint/types').UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "scope-enum": [2, "always", SCOPES],
    "scope-empty": [2, "never"],
  },
};
