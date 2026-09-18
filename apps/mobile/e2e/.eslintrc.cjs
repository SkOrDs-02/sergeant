/**
 * ESLint overrides for Detox suites.
 *
 * The mobile lint runner currently scopes to `app/`, `src/`, `scripts/`
 * (see `apps/mobile/package.json`), so this file is a forward-looking
 * safeguard: if a future PR widens the lint glob to include `e2e/`, the
 * Detox-specific globals (`device`, `element`, `by`, `waitFor`) will
 * resolve via the `jest`/`node` environments declared here rather than
 * failing the build.
 */
module.exports = {
  env: {
    jest: true,
    node: true,
  },
  rules: {
    // Detox tests intentionally await side-effects in sequence; the
    // readability of a linear script matters more here than reducing
    // `await` count.
    "no-await-in-loop": "off",
  },
};
