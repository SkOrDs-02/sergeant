// Standalone per-package ESLint flat-config — див. `eslint.per-package.js`
// у корені. Re-export кореневого маніфесту з re-anchor-ом repo-relative
// глобів; правила редагуються тільки в корені.
import { packageConfig } from "../../eslint.per-package.js";

export default packageConfig("../..");
