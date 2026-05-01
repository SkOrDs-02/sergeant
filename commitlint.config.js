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
  "console",
  "shared",
  "api-client",
  "finyk-domain",
  "fizruk-domain",
  "nutrition-domain",
  "routine-domain",
  "insights",
  "design-tokens",
  "config",
  "eslint-plugins",
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
