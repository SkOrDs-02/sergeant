#!/usr/bin/env node
// Verify that .agents/skills-lock.json's `computedHash` for every locked skill
// matches the SHA-256 of the SKILL.md currently in the working tree.
//
// Modes:
//   default → fail if any hash drifts; print exactly what regen will look like.
//   --write → recompute and overwrite skills-lock.json (used by `pnpm skills:lock`).
//
// Why this exists:
//   Before this script, `computedHash` in skills-lock.json was always "" — so
//   the lockfile was decorative and could not detect tampering. PR 1.1 of
//   docs/initiatives/archive/_0009-agent-os-hardening.md restores integrity by making
//   the lockfile a real fingerprint of the SKILL.md contents.
//
// CI usage:
//   `pnpm lint:skills` calls this script in check mode after `check-skill-shape.mjs`.
//
// Linked initiative: docs/initiatives/archive/_0009-agent-os-hardening.md (PR 1.1).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const lockPath = path.join(repoRoot, ".agents/skills-lock.json");

function sha256(filePath) {
  const buf = readFileSync(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

function loadLock() {
  return JSON.parse(readFileSync(lockPath, "utf8"));
}

function writeLock(lock) {
  // Match Prettier's default JSON: 2-space indent, trailing newline.
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
}

function computeAll(lock) {
  const out = {};
  for (const [slug] of Object.entries(lock.skills ?? {})) {
    const skillPath = path.join(repoRoot, ".agents/skills", slug, "SKILL.md");
    out[slug] = sha256(skillPath);
  }
  return out;
}

function main() {
  const writeMode = process.argv.includes("--write");
  const lock = loadLock();
  const computed = computeAll(lock);

  if (writeMode) {
    for (const [slug, hash] of Object.entries(computed)) {
      lock.skills[slug].computedHash = hash;
    }
    writeLock(lock);
    console.log(
      `[skills:lock] wrote SHA-256 for ${Object.keys(computed).length} skill(s) to ${path.relative(
        repoRoot,
        lockPath,
      )}.`,
    );
    return;
  }

  const drifted = [];
  for (const [slug, hash] of Object.entries(computed)) {
    const stored = lock.skills[slug].computedHash;
    if (stored !== hash) {
      drifted.push({ slug, stored, computed: hash });
    }
  }
  if (drifted.length > 0) {
    console.error(
      `[lint:skills] ${drifted.length} skill(s) have stale computedHash in skills-lock.json:`,
    );
    for (const d of drifted) {
      const storedShort = d.stored ? d.stored.slice(0, 12) : "(empty)";
      console.error(
        `  ✘ ${d.slug}: stored=${storedShort} computed=${d.computed.slice(0, 12)}…`,
      );
    }
    console.error("");
    console.error(
      "Run `pnpm skills:lock` to regenerate the hashes, then commit the change.",
    );
    process.exit(1);
  }
  console.log(
    `[lint:skills] OK — ${Object.keys(computed).length} skill(s) match SHA-256 in skills-lock.json.`,
  );
}

main();
