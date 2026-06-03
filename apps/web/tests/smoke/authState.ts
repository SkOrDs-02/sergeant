import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Side-effect-free home for the saved authed-browser-state path.
 *
 * Kept separate from `auth.setup.ts` on purpose: `playwright.smoke.config.ts`
 * needs this constant for each project's `storageState`, but the config must
 * NOT import a module that registers a test (`setup(...)`) — Playwright throws
 * "Playwright Test did not expect test() to be called here" when the config
 * (or anything it imports) calls `test()` at module load. So the path lives
 * here, and both the config and `auth.setup.ts` import it from this module.
 */
const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Where the setup project saves cookies + localStorage for reuse. */
export const HUB_USER_AUTH_STATE = join(moduleDir, ".auth/hub-user.json");
