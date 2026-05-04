// scripts/__tests__/check-playbook-language.test.mjs
//
// Unit tests for scripts/check-playbook-language.mjs.
//
// Strategy: drive the pure helpers (parseFrontmatter, stripNoise,
// countAlphabets, analyseFile) on small inline fixtures, then exercise
// the CLI on a temp directory tree to confirm exit codes and modes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  parseFrontmatter,
  stripNoise,
  countAlphabets,
  analyseFile,
  isSkippablePlaybook,
  MIN_CYRILLIC_RATIO,
  collectPlaybooks,
  collectSkills,
} from "../check-playbook-language.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_PATH = resolve(__dirname, "..", "check-playbook-language.mjs");

test("parseFrontmatter returns empty when no frontmatter is present", () => {
  const { frontmatter, body } = parseFrontmatter("# Heading\n\nbody text");
  assert.deepEqual(frontmatter, {});
  assert.equal(body, "# Heading\n\nbody text");
});

test("parseFrontmatter parses simple key: value pairs", () => {
  const src = `---\nname: my-skill\nlang: en\n---\n# Body\n`;
  const { frontmatter, body } = parseFrontmatter(src);
  assert.deepEqual(frontmatter, { name: "my-skill", lang: "en" });
  assert.equal(body, "# Body\n");
});

test("parseFrontmatter strips surrounding quotes", () => {
  const src = `---\nname: "quoted-name"\ndescription: 'single quoted'\n---\n`;
  const { frontmatter } = parseFrontmatter(src);
  assert.deepEqual(frontmatter, {
    name: "quoted-name",
    description: "single quoted",
  });
});

test("parseFrontmatter ignores unterminated frontmatter blocks", () => {
  const src = `---\nname: oops\nno-closing-marker\n# Heading\n`;
  const { frontmatter, body } = parseFrontmatter(src);
  assert.deepEqual(frontmatter, {});
  assert.equal(body, src);
});

test("stripNoise removes fenced code blocks", () => {
  const src = "Текст\n```ts\nconst x = 1;\n```\nТекст 2";
  assert.match(stripNoise(src), /Текст/);
  assert.doesNotMatch(stripNoise(src), /const/);
});

test("stripNoise removes inline code", () => {
  assert.doesNotMatch(stripNoise("використай `Number(x)` тут"), /Number/);
});

test("stripNoise removes the freshness header line entirely", () => {
  const src =
    "> **Last validated:** 2026-04-30 by @some-handle. **Next review:** 2026-07-29.\nТекст";
  // The freshness line carries an English handle; counting it would skew
  // the ratio of every Ukrainian playbook downward.
  assert.doesNotMatch(stripNoise(src), /handle/);
  assert.match(stripNoise(src), /Текст/);
});

test("stripNoise keeps markdown link text but drops URLs", () => {
  const src = "Дивись [документ](https://example.com/path) тут.";
  const out = stripNoise(src);
  assert.match(out, /документ/);
  assert.doesNotMatch(out, /example/);
  assert.doesNotMatch(out, /https/);
});

test("stripNoise removes bare URLs", () => {
  assert.doesNotMatch(
    stripNoise("Ось https://github.com/Skords-01/Sergeant"),
    /github/,
  );
});

test("stripNoise drops heading markers but keeps heading text", () => {
  const src = "# Заголовок\n## Підзаголовок\nтекст";
  const out = stripNoise(src);
  assert.match(out, /Заголовок/);
  assert.match(out, /Підзаголовок/);
  assert.doesNotMatch(out, /^#/m);
});

test("countAlphabets sees Ukrainian-only text as cyrillic", () => {
  const { cyrillic, latin } = countAlphabets("Привіт, світе");
  assert.ok(cyrillic > 0, `expected cyrillic > 0, got ${cyrillic}`);
  assert.equal(latin, 0);
});

test("countAlphabets sees English-only text as latin", () => {
  const { cyrillic, latin } = countAlphabets("Hello, world");
  assert.equal(cyrillic, 0);
  assert.ok(latin > 0);
});

test("countAlphabets counts the Ukrainian apostrophe (ʼ U+02BC) as cyrillic", () => {
  const { cyrillic } = countAlphabets("ім'я"); // ASCII apostrophe
  const { cyrillic: c2 } = countAlphabets("імʼя"); // U+02BC
  assert.ok(cyrillic > 0);
  assert.ok(c2 >= cyrillic);
});

test("isSkippablePlaybook skips INDEX, README, _TEMPLATE-*, playbook-catalog, and underscore-prefixed", () => {
  assert.equal(isSkippablePlaybook("docs/playbooks/INDEX.md"), true);
  assert.equal(isSkippablePlaybook("docs/playbooks/README.md"), true);
  assert.equal(
    isSkippablePlaybook("docs/playbooks/_TEMPLATE-decision-tree.md"),
    true,
  );
  assert.equal(isSkippablePlaybook("docs/playbooks/playbook-catalog.md"), true);
  assert.equal(isSkippablePlaybook("docs/playbooks/_internal-notes.md"), true);
  assert.equal(
    isSkippablePlaybook("docs/playbooks/add-api-endpoint.md"),
    false,
  );
});

test("analyseFile flags an English-dominant playbook", () => {
  const r = analyseFile(
    "/repo/docs/playbooks/foo.md",
    "# Playbook: Foo\n\nThis is an English playbook with a lot of English text.\n",
  );
  assert.equal(r.flagged, true);
  assert.ok(r.ratio < MIN_CYRILLIC_RATIO);
  assert.equal(r.langOptOut, false);
});

test("analyseFile does NOT flag an English file with `lang: en` frontmatter", () => {
  const r = analyseFile(
    "/repo/docs/playbooks/foo.md",
    "---\nlang: en\n---\n# Playbook: Foo\n\nIntentionally English for on-call shadowing.\n",
  );
  assert.equal(r.flagged, false);
  assert.equal(r.langOptOut, true);
});

test("analyseFile does NOT flag a Ukrainian-dominant playbook", () => {
  const ua =
    "# Playbook: Як зробити X\n\nЦей плейбук пояснює, як зробити X. Викликай скрипт `pnpm foo`.\n";
  const r = analyseFile("/repo/docs/playbooks/x.md", ua);
  assert.equal(r.flagged, false);
  assert.ok(r.ratio >= MIN_CYRILLIC_RATIO);
});

test("analyseFile is not fooled by code blocks full of English", () => {
  // The body is mostly Ukrainian once code blocks are stripped, even though
  // raw text would look English-heavy.
  const src =
    "# Playbook: Тест\n\n" +
    "Запусти команду:\n\n" +
    "```bash\nnode scripts/foo.mjs --very-long-english-flag --another-english-flag\n```\n\n" +
    "Перевір результат у логах.\n";
  const r = analyseFile("/repo/docs/playbooks/test.md", src);
  assert.equal(r.flagged, false, JSON.stringify(r));
});

test("analyseFile ignores the freshness header English handle", () => {
  // Without stripNoise, this English handle would tip a borderline file.
  const src =
    "# Playbook: Огляд\n\n" +
    "> **Last validated:** 2026-04-30 by @longest-english-username-imaginable. **Next review:** 2026-07-29.\n\n" +
    "Цей файл коротко описує, що ми робимо у такому випадку.\n";
  const r = analyseFile("/repo/docs/playbooks/oversight.md", src);
  assert.equal(r.flagged, false, JSON.stringify(r));
});

// --- CLI smoke tests ---

function makeFixtureDirs() {
  const root = mkdtempSync(join(tmpdir(), "playbook-language-test-"));
  const playbookDir = join(root, "docs/playbooks");
  const skillsDir = join(root, ".agents/skills/example-skill");
  mkdirSync(playbookDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  return { root, playbookDir, skillsDir };
}

test("collectPlaybooks lists real playbooks and skips the special files", () => {
  const { root, playbookDir } = makeFixtureDirs();
  try {
    writeFileSync(join(playbookDir, "real-one.md"), "# Playbook: One\n");
    writeFileSync(join(playbookDir, "INDEX.md"), "skip me");
    writeFileSync(join(playbookDir, "_TEMPLATE-foo.md"), "skip me");
    writeFileSync(join(playbookDir, "playbook-catalog.md"), "skip me");
    const found = collectPlaybooks(playbookDir);
    assert.equal(found.length, 1);
    assert.match(found[0], /real-one\.md$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("collectSkills picks up SKILL.md in each subdirectory", () => {
  const { root } = makeFixtureDirs();
  const skillsRoot = join(root, ".agents/skills");
  try {
    mkdirSync(join(skillsRoot, "alpha"), { recursive: true });
    mkdirSync(join(skillsRoot, "beta"), { recursive: true });
    writeFileSync(join(skillsRoot, "alpha", "SKILL.md"), "alpha");
    writeFileSync(join(skillsRoot, "beta", "SKILL.md"), "beta");
    const found = collectSkills(skillsRoot);
    assert.equal(found.length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI exits 0 in --warn-only mode even with violations", () => {
  // We invoke the script with the real repo, which is known to contain
  // English-only playbooks today (initiative 0009 PR 1.2a is the gate-on
  // step). The --warn-only flag must keep CI green.
  const result = spawnSync(process.execPath, [SCRIPT_PATH, "--warn-only"], {
    cwd: resolve(__dirname, "..", ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
});

test("CLI exits 0 with a clean fixture", () => {
  const { root, playbookDir, skillsDir } = makeFixtureDirs();
  try {
    writeFileSync(
      join(playbookDir, "ua.md"),
      "# Playbook: Привіт\n\nЦе файл українською мовою з достатньою кількістю тексту.\n",
    );
    writeFileSync(
      join(skillsDir, "SKILL.md"),
      "---\nname: example-skill\ndescription: Український опис того, коли застосовувати цей скіл.\n---\n# Skill: Приклад\n\nКорисний контент українською.\n",
    );
    // Minimal driver to invoke `lint()` against our temp paths via a small
    // Node program — easier than threading paths through the CLI.
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `import("${SCRIPT_PATH}").then((m) => { const r = m.lint({ playbookDir: "${playbookDir.replace(/"/g, '\\"')}", skillsDir: "${dirname(skillsDir).replace(/"/g, '\\"')}" }); process.stdout.write(JSON.stringify(r)); process.exit(r.violations.length === 0 ? 0 : 1); });`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.violations.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI exits 1 in default (gate-on) mode against an EN-only fixture", () => {
  const { root, playbookDir, skillsDir } = makeFixtureDirs();
  try {
    writeFileSync(
      join(playbookDir, "english-only.md"),
      "# Playbook: English\n\nThis file is entirely written in English with no Ukrainian at all.\n",
    );
    writeFileSync(
      join(skillsDir, "SKILL.md"),
      "---\nname: example-skill\ndescription: Український опис.\n---\n# Skill\n\nУкраїнський контент.\n",
    );
    const result = spawnSync(
      process.execPath,
      [
        "-e",
        `import("${SCRIPT_PATH}").then((m) => { const r = m.lint({ playbookDir: "${playbookDir.replace(/"/g, '\\"')}", skillsDir: "${dirname(skillsDir).replace(/"/g, '\\"')}" }); process.exit(r.violations.length === 0 ? 0 : 1); });`,
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr || result.stdout);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
