// scripts/__tests__/ci-coverage-credentials.test.mjs
//
// Shape-regression test для джоби `coverage` у `.github/workflows/ci.yml`.
//
// Аудит безпеки 2026-08-04, §1.0 п.5: `coverage` мала `contents: write`, а
// `actions/checkout` ішов із дефолтним `persist-credentials: true`. Чекаут
// тоді кладе GITHUB_TOKEN у `.git/config` (http.extraheader), і наступний
// крок `pnpm install` виконує postinstall-скрипти залежностей. Отруєний
// devDependency читає `.git/config` і забирає токен із правом запису в
// репо. Токен потрібен лише останньому git-кроку («Push coverage-ratchet
// baseline bump»), тож він має приходити туди явно, через `env:` кроку.
//
// Перевіряється саме та властивість, втрата якої повертає діру:
//
//   1. happy path — чекаут джоби не персистить креденшели;
//   2. регрес — push-крок бере токен зі свого `env:` і передає його git-у
//      явно (`-c http...extraheader`), а не покладається на `.git/config`;
//   3. edge case — жоден крок ДО push-кроку (install, тести, ратчет) не
//      отримує токен;
//   4. найменші права — `contents: write` джоба тримає лише тоді, коли
//      push-крок узагалі може виконатись. Push-крок вимагає `pull_request`,
//      а джоба з 2026-09-30 біжить тільки за розкладом і вручну, тож
//      дозвіл на запис нікому не потрібен і лише розширює поверхню для
//      postinstall-скриптів (рев'ю 2026-11-23).
//
// Парсер навмисно рядковий і без залежностей — той самий компроміс, що й
// у сусідніх shape-тестах (ci-bundle-budget-gates, ci-dedupe-gate).
//
// Run with:  node --test scripts/__tests__/ci-coverage-credentials.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKFLOW_PATH = resolve(
  __dirname,
  "..",
  "..",
  ".github",
  "workflows",
  "ci.yml",
);

/** @see ci-dedupe-gate.test.mjs — той самий 2-space канон від prettier. */
function extractJobBlock(workflow, jobName) {
  const lines = workflow.split("\n");
  const headerRe = new RegExp(`^  ${jobName}:\\s*$`);
  const start = lines.findIndex((l) => headerRe.test(l));
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[a-zA-Z_][a-zA-Z0-9_-]*:\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** @see ci-bundle-budget-gates.test.mjs — крок = `- name:`/`- uses:` на 6 пробілах. */
function extractSteps(jobBlock) {
  const steps = [];
  let current = null;
  for (const line of jobBlock.split("\n")) {
    if (/^ {6}- (name|uses):/.test(line)) {
      if (current !== null) steps.push(current);
      current = line;
    } else if (current !== null) {
      current += "\n" + line;
    }
  }
  if (current !== null) steps.push(current);
  return steps;
}

/** Рядки кроку без YAML-коментарів: пояснення не мають задовольняти перевірку. */
function stripComments(step) {
  return step
    .split("\n")
    .filter((l) => !/^\s*#/.test(l))
    .join("\n");
}

const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf-8");
const COVERAGE_JOB = extractJobBlock(WORKFLOW, "coverage");
const STEPS = COVERAGE_JOB ? extractSteps(COVERAGE_JOB).map(stripComments) : [];
const CHECKOUT_RE = /uses:\s*actions\/checkout@/;
const PUSH_STEP_RE = /- name:\s*Push coverage-ratchet baseline bump\s*$/m;
const TOKEN_REF_RE = /\$\{\{\s*(secrets\.GITHUB_TOKEN|github\.token)\s*\}\}/;

test("happy path: чекаут джоби `coverage` не персистить токен у .git/config", () => {
  assert.ok(COVERAGE_JOB, "очікується джоба `coverage:` під `jobs:`");

  const checkouts = STEPS.filter((s) => CHECKOUT_RE.test(s));
  assert.ok(checkouts.length >= 1, "очікується крок actions/checkout");
  for (const step of checkouts) {
    assert.match(
      step,
      /^\s+persist-credentials:\s*false\s*$/m,
      "actions/checkout у `coverage` мусить мати `persist-credentials: false`: " +
        "push-крок отримує токен явно, а `pnpm install` після чекауту виконує " +
        "postinstall-скрипти, які інакше прочитають токен із .git/config (аудит 2026-08-04 §1.0)",
    );
  }
});

test("регрес: push-крок отримує токен явно і передає його git-у сам", () => {
  const push = STEPS.find((s) => PUSH_STEP_RE.test(s));
  assert.ok(push, "очікується крок «Push coverage-ratchet baseline bump»");

  assert.match(
    push,
    TOKEN_REF_RE,
    "push-крок мусить брати GITHUB_TOKEN зі свого `env:` — з `persist-credentials: false` " +
      "у .git/config токена немає",
  );

  // Обгортка `git_auth` — єдиний шлях токена до git: `-c ...extraheader`
  // діє лише на один виклик і нічого не пише в .git/config.
  assert.match(
    push,
    /git_auth\(\)\s*\{[^}]*git -c "http\.https:\/\/github\.com\/\.extraheader=AUTHORIZATION: basic \$AUTH_B64"/,
    "push-крок мусить визначати `git_auth` з `-c http.https://github.com/.extraheader=...`",
  );

  // Будь-який виклик `push origin` (і `fetch origin`) — через `git_auth`:
  // голий `git push` без токена в .git/config тихо впаде в best-effort гілку,
  // і baseline перестане доїжджати, а гейт лишиться зеленим.
  const remoteLines = push
    .split("\n")
    .filter((l) => /\b(push|fetch)\s+origin\b/.test(l));
  assert.ok(
    remoteLines.some((l) => /\bpush\s+origin\b/.test(l)),
    "очікується `push origin` у push-кроці",
  );
  for (const line of remoteLines) {
    assert.match(
      line,
      /\bgit_auth\s+(push|fetch)\b/,
      `виклик remote-а мусить іти через \`git_auth\`, а не покладатися на .git/config: ${line.trim()}`,
    );
  }
});

test("edge case: жоден крок до push-кроку не бачить GITHUB_TOKEN", () => {
  const pushIdx = STEPS.findIndex((s) => PUSH_STEP_RE.test(s));
  assert.ok(pushIdx !== -1, "очікується push-крок");

  STEPS.slice(0, pushIdx).forEach((step, i) => {
    assert.doesNotMatch(
      step,
      TOKEN_REF_RE,
      `крок #${i} джоби \`coverage\` виконується до push-кроку і не має отримувати ` +
        `токен із правом запису:\n${step.split("\n")[0]}`,
    );
  });

  // Токен на рівні джоби чи workflow бачили б і install, і тести.
  const jobHeader = COVERAGE_JOB.split(/^ {4}steps:\s*$/m)[0];
  assert.doesNotMatch(
    jobHeader,
    TOKEN_REF_RE,
    "GITHUB_TOKEN не має стояти в `env:` усієї джоби `coverage`",
  );
});

/** Умова `if:` на рівні джоби (4 пробіли), однорядкова або `>-`-блок. */
function jobCondition(jobBlock) {
  const lines = jobBlock.split("\n");
  const idx = lines.findIndex((l) => /^ {4}if:/.test(l));
  if (idx === -1) return null;
  const parts = [lines[idx].replace(/^ {4}if:\s*(>-?|\|-?)?\s*/, "")];
  for (let i = idx + 1; i < lines.length && /^ {6,}\S/.test(lines[i]); i++) {
    parts.push(lines[i].trim());
  }
  return parts.join(" ").trim();
}

test("найменші права: `contents: write` лише коли push-крок може виконатись", () => {
  assert.ok(COVERAGE_JOB, "очікується джоба `coverage:` під `jobs:`");
  const push = STEPS.find((s) => PUSH_STEP_RE.test(s));
  assert.ok(push, "очікується крок «Push coverage-ratchet baseline bump»");
  assert.match(
    push,
    /github\.event_name == 'pull_request'/,
    "тест писався під push-крок, що біжить лише на pull_request; змінилась умова, перегляньте тест",
  );

  const condition = jobCondition(COVERAGE_JOB);
  const runsOnPullRequest =
    condition === null || /pull_request/.test(condition);
  const jobHeader = COVERAGE_JOB.split(/^ {4}steps:\s*$/m)[0];

  if (runsOnPullRequest) {
    assert.match(
      jobHeader,
      /^ {6}contents: write\s*$/m,
      "джоба біжить на pull_request, тож push-кроку потрібен `contents: write`",
    );
    return;
  }
  assert.match(
    jobHeader,
    /^ {6}contents: read\s*$/m,
    `джоба \`coverage\` не біжить на pull_request (if: ${condition}), push-крок ` +
      "ніколи не виконується, тож права мають бути `contents: read`",
  );
  assert.doesNotMatch(
    jobHeader,
    /^ {6}contents: write\s*$/m,
    "`contents: write` у джобі, де push-крок недосяжний, лише дає токен із правом запису postinstall-скриптам",
  );
});
