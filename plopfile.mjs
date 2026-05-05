import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Returns the next zero-padded 3-digit migration number. */
function nextMigrationNumber() {
  const migDir = resolve(__dirname, "apps/server/src/migrations");
  const files = readdirSync(migDir);
  const nums = files
    .map((f) => parseInt(f.slice(0, 3), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(3, "0");
}

/** Returns YYYY-MM-DD `n` days from `from`. */
function shiftDate(from, days) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Append `slug` to `.agents/skills-lock.json` with a freshly computed SHA-256
 * over the new SKILL.md. Idempotent: if the slug already exists, recomputes
 * the hash and rewrites in place. Keys are emitted in alphabetical order to
 * match the rest of the lockfile.
 */
function appendSkillToLock(slug) {
  const lockPath = resolve(__dirname, ".agents/skills-lock.json");
  const skillPath = resolve(__dirname, ".agents/skills", slug, "SKILL.md");
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const hash = createHash("sha256")
    .update(readFileSync(skillPath))
    .digest("hex");
  lock.skills = lock.skills ?? {};
  lock.skills[slug] = {
    source: "local",
    sourceType: "local",
    computedHash: hash,
  };
  const sorted = Object.keys(lock.skills)
    .sort()
    .reduce((acc, k) => {
      acc[k] = lock.skills[k];
      return acc;
    }, {});
  lock.skills = sorted;
  writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
  return `appended ${slug} to .agents/skills-lock.json (hash ${hash.slice(0, 12)}…)`;
}

/**
 * Append `/packages/<slug>/  @<owner>` to `.github/CODEOWNERS` keeping the
 * `/packages/...` block sorted alphabetically. Idempotent: skips the write if
 * the path is already covered. Without this, `pnpm lint:codeowners` would fail
 * the next push because every workspace path under `/packages/` must have a
 * codeowner entry.
 */
function appendPackageCodeowner(slug, owner) {
  const coPath = resolve(__dirname, ".github/CODEOWNERS");
  const raw = readFileSync(coPath, "utf8");
  const lines = raw.split("\n");
  const newRule = `/packages/${slug}/`;
  if (lines.some((l) => l.trimStart().startsWith(newRule))) {
    return `CODEOWNERS already covers ${newRule} (skipped)`;
  }
  // Find the contiguous run of `/packages/<x>/` lines and re-emit it sorted.
  const blockStart = lines.findIndex((l) => /^\/packages\//.test(l));
  if (blockStart === -1) {
    appendFileSync(coPath, `${newRule.padEnd(40)} @${owner}\n`);
    return `appended ${newRule} to CODEOWNERS (no existing /packages/ block found)`;
  }
  let blockEnd = blockStart;
  while (blockEnd < lines.length && /^\/packages\//.test(lines[blockEnd])) {
    blockEnd++;
  }
  const block = lines.slice(blockStart, blockEnd);
  block.push(`${newRule.padEnd(40)} @${owner}`);
  block.sort();
  const out = [
    ...lines.slice(0, blockStart),
    ...block,
    ...lines.slice(blockEnd),
  ].join("\n");
  writeFileSync(coPath, out);
  return `inserted ${newRule} into CODEOWNERS /packages/ block (sorted)`;
}

/** Returns the next zero-padded 4-digit ADR number. */
function nextAdrNumber() {
  const adrDir = resolve(__dirname, "docs/adr");
  const files = readdirSync(adrDir);
  const nums = files
    .filter((f) => /^\d{4}-.+\.md$/.test(f))
    .map((f) => parseInt(f.slice(0, 4), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return String(max + 1).padStart(4, "0");
}

export default function (plop) {
  plop.setHelper("timestamp", () => new Date().toISOString().slice(0, 10));
  plop.setHelper("eq", (a, b) => a === b);

  // Custom action: persist a freshly hashed entry for a new skill into
  // .agents/skills-lock.json so `pnpm lint:skills` passes immediately after
  // generation. Without this, every `pnpm gen new-skill` run leaves the
  // lockfile out of sync and CI fails on the very next push.
  plop.setActionType("appendSkillToLock", (answers) => {
    return appendSkillToLock(answers.slug);
  });

  // Custom action: insert a /packages/<slug>/ entry into .github/CODEOWNERS
  // (alphabetically within the existing /packages/ block) so that
  // `pnpm lint:codeowners` passes immediately after `pnpm gen new-package`.
  plop.setActionType("appendPackageCodeowner", (answers) => {
    return appendPackageCodeowner(answers.slug, answers.owner);
  });

  // ── migration ──────────────────────────────────────────────────────────────
  plop.setGenerator("migration", {
    description: "New SQL migration (auto-numbered up + down)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Migration name (snake_case, e.g. add_user_settings):",
        validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || "snake_case only",
      },
    ],
    actions: (data) => {
      const num = nextMigrationNumber();
      const base = `apps/server/src/migrations/${num}_${data.name}`;
      return [
        {
          type: "add",
          path: `${base}.sql`,
          templateFile: "plop-templates/migration/up.sql.hbs",
        },
        {
          type: "add",
          path: `${base}.down.sql`,
          templateFile: "plop-templates/migration/down.sql.hbs",
        },
      ];
    },
  });

  // ── rq-hook ────────────────────────────────────────────────────────────────
  plop.setGenerator("rq-hook", {
    description: "New React Query hook (useXxx pattern)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Hook name without 'use' prefix (e.g. UserProfile):",
        validate: (v) =>
          /^[A-Z][A-Za-z0-9]+$/.test(v) || "PascalCase only, no 'use' prefix",
      },
      {
        type: "list",
        name: "module",
        message: "Target module:",
        choices: ["finyk", "fizruk", "nutrition", "routine", "core", "shared"],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/web/src/modules/{{module}}/hooks/use{{name}}.ts",
        templateFile: "plop-templates/rq-hook/hook.ts.hbs",
      },
    ],
  });

  // ── hubchat-tool ───────────────────────────────────────────────────────────
  plop.setGenerator("hubchat-tool", {
    description:
      "New HubChat tool (server tooldef stub + client action handler stub)",
    prompts: [
      {
        type: "input",
        name: "toolName",
        message: "Tool name (snake_case, e.g. log_water):",
        validate: (v) => /^[a-z][a-z0-9_]*$/.test(v) || "snake_case only",
      },
      {
        type: "list",
        name: "domain",
        message: "Domain file (server toolDefs):",
        choices: [
          "finyk",
          "fizruk",
          "nutrition",
          "routine",
          "crossModule",
          "utility",
          "memory",
        ],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/server/src/modules/chat/toolDefs/{{camelCase toolName}}.stub.ts",
        templateFile: "plop-templates/hubchat-tool/tooldef.ts.hbs",
      },
      {
        type: "add",
        path: "apps/web/src/core/lib/chatActions/{{camelCase toolName}}Action.stub.ts",
        templateFile: "plop-templates/hubchat-tool/executor.ts.hbs",
      },
    ],
  });

  // ── endpoint ───────────────────────────────────────────────────────────────
  plop.setGenerator("endpoint", {
    description: "New Express API endpoint (handler + test + api-client stub)",
    prompts: [
      {
        type: "input",
        name: "name",
        message: "Endpoint name (camelCase, e.g. getUserProfile):",
        validate: (v) => /^[a-z][A-Za-z0-9]+$/.test(v) || "camelCase only",
      },
      {
        type: "list",
        name: "module",
        message: "Server module:",
        choices: [
          "finyk",
          "fizruk",
          "nutrition",
          "routine",
          "chat",
          "auth",
          "shared",
        ],
      },
      {
        type: "list",
        name: "method",
        message: "HTTP method:",
        choices: ["GET", "POST", "PATCH", "DELETE"],
      },
    ],
    actions: [
      {
        type: "add",
        path: "apps/server/src/modules/{{module}}/{{name}}.ts",
        templateFile: "plop-templates/endpoint/handler.ts.hbs",
      },
      {
        type: "add",
        path: "apps/server/src/modules/{{module}}/{{name}}.test.ts",
        templateFile: "plop-templates/endpoint/handler.test.ts.hbs",
      },
      {
        type: "add",
        path: "apps/web/src/modules/{{module}}/api/{{name}}.ts",
        templateFile: "plop-templates/endpoint/api-client.ts.hbs",
      },
    ],
  });

  // ── new-skill ──────────────────────────────────────────────────────────────
  plop.setGenerator("new-skill", {
    description:
      "New agent skill (.agents/skills/<slug>/SKILL.md + skills-lock.json entry)",
    prompts: [
      {
        type: "input",
        name: "slug",
        message: "Skill slug (kebab-case, e.g. sergeant-monorepo-boundaries):",
        validate: (v) => {
          if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(v)) {
            return "kebab-case only (lowercase letters, digits, hyphens)";
          }
          const lockPath = resolve(__dirname, ".agents/skills-lock.json");
          const lock = JSON.parse(readFileSync(lockPath, "utf8"));
          if (lock.skills && lock.skills[v]) {
            return `${v} is already registered in .agents/skills-lock.json`;
          }
          return true;
        },
      },
      {
        type: "input",
        name: "humanTitle",
        message:
          "Human-readable title (for the H1 heading, e.g. Sergeant Monorepo Boundaries):",
        validate: (v) => v.trim().length > 0 || "required",
      },
      {
        type: "input",
        name: "description",
        message:
          "One-line description (≤220 chars; shown in catalog/discovery):",
        validate: (v) => {
          if (!v.trim()) return "required";
          if (v.length > 220)
            return `description is ${v.length} chars (max 220)`;
          return true;
        },
      },
      {
        type: "list",
        name: "lang",
        message: "Skill body language:",
        choices: [
          { name: "Ukrainian (default for internal skills)", value: "uk" },
          {
            name: "English (only when user-facing or external — adds `lang: en` frontmatter)",
            value: "en",
          },
        ],
        default: "uk",
      },
      {
        type: "input",
        name: "playbook",
        message:
          "Linked playbook (path under docs/playbooks/* OR docs/agents/agent-skills-catalog.md):",
        default: "docs/agents/agent-skills-catalog.md",
        validate: (v) =>
          /^(docs\/playbooks\/[\w./-]+|docs\/agents\/agent-skills-catalog\.md)$/.test(
            v.trim(),
          ) ||
          "must be a docs/playbooks/<file>.md path or docs/agents/agent-skills-catalog.md",
      },
    ],
    actions: [
      {
        type: "add",
        path: ".agents/skills/{{slug}}/SKILL.md",
        templateFile: "plop-templates/new-skill/SKILL.md.hbs",
      },
      {
        type: "appendSkillToLock",
      },
      () =>
        "Next steps: (1) flesh out the SKILL.md sections, " +
        "(2) add an entry to docs/agents/agent-skills-catalog.md, " +
        "(3) run `pnpm lint:skills` to verify shape + lock integrity.",
    ],
  });

  // ── new-playbook ───────────────────────────────────────────────────────────
  plop.setGenerator("new-playbook", {
    description:
      "New playbook (docs/playbooks/<slug>.md with required schema + freshness header)",
    prompts: [
      {
        type: "input",
        name: "slug",
        message:
          "Playbook slug (kebab-case; becomes docs/playbooks/<slug>.md):",
        validate: (v) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(v) ||
          "kebab-case only (lowercase letters, digits, hyphens)",
      },
      {
        type: "input",
        name: "humanTitle",
        message:
          "Human-readable title (e.g. 'Cleanup Dead Code', 'Add Hard Rule'):",
        validate: (v) => v.trim().length > 0 || "required",
      },
      {
        type: "input",
        name: "trigger",
        message:
          "Trigger sentence (≤240 chars; appears after the **Trigger:** marker):",
        validate: (v) => {
          if (!v.trim()) return "required";
          if (v.length > 240) return `trigger is ${v.length} chars (max 240)`;
          return true;
        },
      },
      {
        type: "input",
        name: "owner",
        message: "Owner GitHub handle (without @):",
        default: "Skords-01",
        validate: (v) => /^[A-Za-z0-9-]+$/.test(v) || "GitHub handle only",
      },
      {
        type: "input",
        name: "governingSkill",
        message:
          "Governing skill slug (must be an existing .agents/skills/<slug>/ directory):",
        validate: (v) => {
          const skillsDir = resolve(__dirname, ".agents/skills");
          const slugs = readdirSync(skillsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);
          if (!slugs.includes(v)) {
            return (
              `unknown skill ${v}; existing skills: ` +
              slugs.slice(0, 8).join(", ") +
              (slugs.length > 8 ? "…" : "")
            );
          }
          return true;
        },
      },
      {
        type: "list",
        name: "lang",
        message: "Playbook body language:",
        choices: [
          { name: "Ukrainian (default for internal playbooks)", value: "uk" },
          {
            name: "English (only when user-facing or external — adds `lang: en` frontmatter)",
            value: "en",
          },
        ],
        default: "uk",
      },
    ],
    actions: (data) => {
      data.nextReview = shiftDate(new Date(), 90);
      return [
        {
          type: "add",
          path: "docs/playbooks/{{slug}}.md",
          templateFile: "plop-templates/new-playbook/playbook.md.hbs",
        },
        () =>
          "Next steps: (1) flesh out the Steps and Verification sections, " +
          "(2) run `pnpm docs:gen-playbook-index` to refresh docs/playbooks/INDEX.md, " +
          "(3) run `pnpm lint` to verify schema + freshness + language gates.",
      ];
    },
  });

  // ── new-package ────────────────────────────────────────────────────────────
  plop.setGenerator("new-package", {
    description:
      "New workspace package (packages/<slug>/{src,package.json,tsconfig.json,vitest.config.ts,README.md}) with CODEOWNERS entry",
    prompts: [
      {
        type: "input",
        name: "slug",
        message:
          "Package slug (kebab-case; becomes packages/<slug> and @sergeant/<slug>):",
        validate: (v) => {
          if (!/^[a-z][a-z0-9-]*[a-z0-9]$/.test(v)) {
            return "kebab-case only (lowercase letters, digits, hyphens)";
          }
          const pkgPath = resolve(__dirname, "packages", v);
          if (existsSync(pkgPath)) {
            return `packages/${v} already exists — pick another slug or remove the dir first`;
          }
          return true;
        },
      },
      {
        type: "input",
        name: "description",
        message:
          "One-line description (≤200 chars; lands in src/index.ts and README.md):",
        validate: (v) => {
          if (!v.trim()) return "required";
          if (v.length > 200)
            return `description is ${v.length} chars (max 200)`;
          return true;
        },
      },
      {
        type: "list",
        name: "kind",
        message: "Package kind:",
        choices: [
          {
            name: "lib (Node-only TS library — most domain/util packages)",
            value: "lib",
          },
          {
            name: "react (uses JSX/DOM — extends @sergeant/config/tsconfig.react.json)",
            value: "react",
          },
        ],
        default: "lib",
      },
      {
        type: "input",
        name: "owner",
        message: "Owner GitHub handle for CODEOWNERS (without @):",
        default: "Skords-01",
        validate: (v) => /^[A-Za-z0-9-]+$/.test(v) || "GitHub handle only",
      },
    ],
    actions: () => {
      const base = "packages/{{slug}}";
      return [
        {
          type: "add",
          path: `${base}/package.json`,
          templateFile: "plop-templates/new-package/package.json.hbs",
        },
        {
          type: "add",
          path: `${base}/tsconfig.json`,
          templateFile: "plop-templates/new-package/tsconfig.json.hbs",
        },
        {
          type: "add",
          path: `${base}/vitest.config.ts`,
          templateFile: "plop-templates/new-package/vitest.config.ts.hbs",
        },
        {
          type: "add",
          path: `${base}/src/index.ts`,
          templateFile: "plop-templates/new-package/index.ts.hbs",
        },
        {
          type: "add",
          path: `${base}/src/index.test.ts`,
          templateFile: "plop-templates/new-package/index.test.ts.hbs",
        },
        {
          type: "add",
          path: `${base}/README.md`,
          templateFile: "plop-templates/new-package/README.md.hbs",
        },
        { type: "appendPackageCodeowner" },
        (answers) =>
          `Next steps: (1) \`pnpm install\` (registers the new workspace package), ` +
          `(2) replace the stub export in src/index.ts with real surface, ` +
          `(3) \`pnpm --filter @sergeant/${answers.slug} typecheck && pnpm --filter @sergeant/${answers.slug} test\` to verify, ` +
          `(4) \`pnpm lint:codeowners\` to confirm the CODEOWNERS entry was inserted correctly.`,
      ];
    },
  });

  // ── adr ────────────────────────────────────────────────────────────────────
  plop.setGenerator("adr", {
    description:
      "New Architecture Decision Record (auto-numbered from docs/adr/)",
    prompts: [
      {
        type: "input",
        name: "title",
        message:
          "ADR title (kebab-case, e.g. rq-keys-factory or event-sourcing-queue):",
        validate: (v) =>
          /^[a-z][a-z0-9-]*[a-z0-9]$/.test(v) ||
          "kebab-case only (lowercase letters, digits, hyphens)",
      },
      {
        type: "input",
        name: "humanTitle",
        message:
          "Human-readable title (for the H1 heading, e.g. RQ keys factory):",
        validate: (v) => v.trim().length > 0 || "required",
      },
      {
        type: "input",
        name: "deciders",
        message: "Deciders (GitHub handles, comma-separated):",
        default: "@Skords-01",
      },
    ],
    actions: (data) => {
      const num = nextAdrNumber();
      data.num = num;
      return [
        {
          type: "add",
          path: `docs/adr/${num}-${data.title}.md`,
          templateFile: "plop-templates/adr/adr.md.hbs",
        },
      ];
    },
  });
}
