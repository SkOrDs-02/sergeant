// Sergeant root ESLint flat-config (v9+).
//
// PR-31 phase 2 — the surface-specific blocks that used to live inline here
// were extracted into per-surface modules so this root file stays a thin
// composition manifest. The shared baseline (ignores + recommended configs +
// the global plugin/settings/rules block) lives in `./eslint.baseline.js`;
// each `eslint.<surface>.js` exports an array of that surface's `files:`-
// scoped blocks. They are spread back in below.
//
// ESLint flat-config merges `rules` by array order (later wins for a given
// file+rule). The composition order preserves the original resolution: the
// baseline first, then the surface blocks, then `eslintConfigPrettier` last
// to disable formatting rules. `pnpm lint:eslint-config-diff` snapshots the
// fully-resolved `eslint --print-config` output per surface and fails on any
// drift — this extraction is a behavioural no-op verified against it. See
// `docs/02-engineering/development/eslint-config.md` for the split rationale and roadmap.
import eslintConfigPrettier from "eslint-config-prettier";
import { baseline } from "./eslint.baseline.js";
import { webBlocks } from "./eslint.web.js";
import { serverBlocks } from "./eslint.server.js";
import { mobileBlocks } from "./eslint.mobile.js";
import { shellBlocks } from "./eslint.shell.js";
import { openclawBlocks } from "./eslint.openclaw.js";
import { packageBlocks } from "./eslint.packages.js";
import { crossSurfaceBlocks } from "./eslint.cross-surface.js";

export default [
  ...baseline,
  ...webBlocks,
  ...serverBlocks,
  ...mobileBlocks,
  ...shellBlocks,
  ...openclawBlocks,
  ...packageBlocks,
  ...crossSurfaceBlocks,
  eslintConfigPrettier,
];
