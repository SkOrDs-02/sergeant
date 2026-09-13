#!/usr/bin/env node

/** Rewrite legacy documentation path prefixes after a directory migration. */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const check = process.argv.includes("--check");
const verbose = process.argv.includes("--verbose");
const prefixes = [
  ["docs/operations/runbooks", "docs/start/instructions"],
  ["docs/start/playbooks", "docs/start/instructions"],
  ["docs/product/model/finyk.md", "docs/product/modules/finyk.md"],
  ["docs/product/model/fizruk.md", "docs/product/modules/fizruk.md"],
  ["docs/product/model/hub-coach.md", "docs/product/modules/hub-coach.md"],
  ["docs/product/model/nutrition.md", "docs/product/modules/nutrition.md"],
  ["docs/product/model/routine.md", "docs/product/modules/routine.md"],
  ["docs/product/launch", "docs/work/specs/launch"],
  ["docs/governance/security/hardening", "docs/work/specs/security-hardening"],
  ["docs/work/initiatives", "docs/work/specs/initiatives"],
  ["docs/work/planning", "docs/work/specs/planning"],
  ["docs/work/audits", "docs/work/specs/audits"],
  ["docs/work/tech-debt", "docs/work/specs/tech-debt"],
  ["docs/work/superpowers", "docs/work/specs/superpowers"],
  ["docs/work/beta-launch", "docs/work/specs/beta-launch"],
  ["planning/specs", "specs"],
  ["00-start", "start"],
  ["01-product", "product"],
  ["02-engineering", "engineering"],
  ["03-operations", "operations"],
  ["04-governance", "governance"],
  ["05-design", "design"],
  ["90-work", "work"],
];
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/u)
  .filter(Boolean)
  .filter(
    (file) =>
      /\.(md|mjs|js|ts|tsx|json|yml|yaml|env|example|css|hbs|alloy)$/u.test(
        file,
      ) || /(^|[\\/])Dockerfile(?:\.|$)/u.test(file),
  );
function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}
const docsFiles = walk(resolve(root, "docs")).map((file) =>
  file.slice(root.length + 1).replaceAll("\\", "/"),
);
const files = [...new Set([...trackedFiles, ...docsFiles])];
const intentionalLegacyPathFiles = new Set([
  "scripts/docs/externalize-archive-links.mjs",
  "scripts/docs/generate-documentation-inventory.mjs",
]);

let changed = 0;
const changedFiles = [];
for (const file of files) {
  const normalizedFile = file.replaceAll("\\", "/");
  if (normalizedFile === "scripts/docs/rewrite-documentation-paths.mjs") {
    continue;
  }
  if (intentionalLegacyPathFiles.has(normalizedFile)) {
    continue;
  }
  if (normalizedFile === "docs/work/specs/data/documentation-inventory.json") {
    continue;
  }
  const path = resolve(root, file);
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  const updated = source
    .split("\n")
    .map((line) => {
      const urls = [];
      let next = line.replace(/https?:\/\/\S+/gu, (url) => {
        const token = `__DOC_PATH_URL_${urls.length}__`;
        urls.push(url);
        return token;
      });
      for (const [from, to] of prefixes) {
        if (from.startsWith("docs/")) {
          next = next.replaceAll(from, to);
          continue;
        }
        const escaped = from.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        next = next.replace(
          new RegExp(`(^|/)${escaped}(?=/)`, "gu"),
          `$1${to}`,
        );
      }
      return next.replace(
        /__DOC_PATH_URL_(\d+)__/gu,
        (_match, index) => urls[index],
      );
    })
    .join("\n");
  if (updated === source) continue;
  changed += 1;
  changedFiles.push(file.replaceAll("\\", "/"));
  if (verbose) {
    const beforeLines = source.split("\n");
    const afterLines = updated.split("\n");
    const index = beforeLines.findIndex(
      (line, lineIndex) => line !== afterLines[lineIndex],
    );
    console.log(`${file}:${index + 1}`);
    console.log(`- ${beforeLines[index]}`);
    console.log(`+ ${afterLines[index]}`);
  }
  if (!check) {
    try {
      writeFileSync(path, updated);
    } catch (error) {
      console.warn(
        `Skipped locked file ${file}: ${error.code ?? error.message}`,
      );
    }
  }
}

console.log(
  `${check ? "Would rewrite" : "Rewrote"} documentation paths in ${changed} files.`,
);
if (check && changedFiles.length > 0) {
  console.log(changedFiles.join("\n"));
}
if (check && changed > 0) process.exitCode = 1;
