#!/usr/bin/env node
// Не дати запушити в гілку, чий PR на Bitbucket уже змерджений.
//
// AI-CONTEXT: власник мерджить швидко і паралельно з роботою сесій. Через це
// виникає тихий клас помилок: агент дороблює щось у своїй гілці, пушить - і
// коміт нікуди не доїжджає, бо PR закритий. Виглядає як успіх (`git push` каже
// ok), а зміни в main немає. Саме так 2026-09-23 виправлення POST для Coolify
// розминулося з PR #7 і потрапило в main лише окремим PR #8.
//
// Текстового правила тут замало - воно вже існувало в памʼяті агента і було
// порушене. Тому перевірка механічна.
//
// Не блокує, коли:
//   - пушиться не гілка (теги, refspec на кшталт origin/main:main);
//   - remote не Bitbucket (дзеркало Hetzner);
//   - немає токена або немає мережі: хук не повинен ламати роботу офлайн,
//     а пропущена перевірка гірша лише за відсутню, не за зламаний пуш.
//
// AI-NOTE: хук НЕ діє з worktree, доки не змерджений у main. `core.hooksPath`
// вказує на `.husky/_` ОСНОВНОГО клону, а шим husky шукає сам хук поруч із ним,
// тобто в `D:\Sergeant\.husky\`. Файл, що існує лише у worktree, не виконається
// взагалі, і це виглядає як «хук мовчки не працює». Перевіряти логіку тут треба
// прямим запуском: `echo "refs/heads/<гілка> <sha> refs/heads/<гілка> <sha>" |
// node scripts/pre-push-merged-pr.mjs origin git@bitbucket.org:skords01/sergeant.git`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ENV_PATH = "D:\\Sergeant\\.env";
const TRUNK = "D:\\Sergeant";
const REPO = "skords01/sergeant";

// Оновити `main` у трунку. Уся робота йде через worktree, тож у трунк ніхто не
// заходить місяцями, а від нього залежить більше, ніж здається: `core.hooksPath`
// указує на `.husky/_` саме трунку, тобто застарілий трунк означає застарілі хуки
// в УСІХ worktree. 2026-09-23 він відставав на 31 коміт.
//
// `fetch origin main:main` оновлює ref БЕЗ checkout, тож робоче дерево трунку не
// чіпається і чужа сесія в ньому нічого не помітить. Якщо `main` там зачекінений,
// git відмовить - і це правильно, мовчки пропускаємо.
function refreshTrunkMain() {
  try {
    execFileSync("git", ["-C", TRUNK, "fetch", "origin", "main:main"], {
      stdio: "ignore",
      timeout: 30_000,
    });
  } catch {
    // main зачекінений у трунку, немає мережі або трунку: не привід зривати пуш
  }
}

const remoteUrl = process.argv[3] ?? "";
if (!remoteUrl.includes("bitbucket.org")) process.exit(0);

let token;
try {
  const line = readFileSync(ENV_PATH, "utf8")
    .split(/\r?\n/)
    .find((l) => l.startsWith("BITBUCKET_TOKEN="));
  token = line?.slice("BITBUCKET_TOKEN=".length).trim();
} catch {
  process.exit(0);
}
if (!token) process.exit(0);

// git подає на stdin рядки: <local ref> <local sha> <remote ref> <remote sha>
const stdin = readFileSync(0, "utf8").trim();
if (!stdin) process.exit(0);

const branches = stdin
  .split("\n")
  .map((l) => l.split(/\s+/))
  .filter(([localRef]) => localRef?.startsWith("refs/heads/"))
  .map(([, , remoteRef]) => remoteRef?.replace("refs/heads/", ""))
  .filter(Boolean);

if (branches.length === 0) process.exit(0);

const blocked = [];

for (const branch of branches) {
  const url =
    `https://api.bitbucket.org/2.0/repositories/${REPO}/pullrequests` +
    `?q=${encodeURIComponent(`source.branch.name="${branch}" AND state="MERGED"`)}&fields=values.id,values.title`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) continue;
    const data = await res.json();
    const pr = data.values?.[0];
    if (pr) blocked.push({ branch, id: pr.id, title: pr.title });
  } catch {
    // мережа недоступна: мовчки пропускаємо, це не привід зривати пуш
  }
}

/**
 * Нагадати, що реєстр PR відстав від змерджених PR (Hard Rule #26).
 *
 * Чому саме тут. Мерж відбувається на сервері Bitbucket, локального
 * post-merge хука не існує, а CI, який раніше дописував реєстр, помер разом
 * із GitHub. Пуш - єдина мить, коли ми і так уже говоримо з Bitbucket API і
 * маємо токен під рукою. Реєстр тихо стояв від 2026-09-17 саме тому, що такої
 * миті ніхто не використовував (аудит DG-3).
 *
 * Чому попередження, а не блок. Запис у реєстр - це зміна файлів, яку треба
 * закомітити; робити її посеред чужого пуша означало б лишити брудне дерево
 * після успішного `git push`. І тим паче не привід зривати пуш: бухгалтерія
 * доків не важливіша за доставку коду.
 */
async function warnIfLedgerStale() {
  try {
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    // Шлях від самого файлу, а не від cwd: хук запускається з кореня того
    // дерева, звідки пушать, і відносний шлях там не завжди той самий.
    const writer = fileURLToPath(
      new URL("./ci/update-pr-backlinks.mjs", import.meta.url),
    );
    const out = execFileSync(process.execPath, [writer, "--stale"], {
      encoding: "utf8",
      timeout: 60_000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const missing = Number(out.trim().split("\n").pop());
    if (!Number.isInteger(missing) || missing < 1) return;
    console.error("");
    console.error(
      `Реєстр PR відстав: ${missing} змерджених PR ще не в docs/governance/pr-ledger/index.json (Hard Rule #26).`,
    );
    console.error("Дописати і закомітити окремо:");
    console.error("  pnpm docs:sync-pr-ledger");
  } catch {
    // Немає мережі, токена чи самого скрипта: мовчимо, це лише нагадування
  }
}

if (blocked.length === 0) {
  refreshTrunkMain();
  await warnIfLedgerStale();
  process.exit(0);
}

console.error("");
for (const b of blocked) {
  console.error(`Гілка "${b.branch}" уже змерджена як PR #${b.id}: ${b.title}`);
}
console.error("");
console.error(
  "Пуш зупинено: коміт доїде в гілку, але в main не потрапить, бо PR закритий.",
);
console.error("Замість цього візьми свіжий main і зроби окрему гілку:");
console.error(
  "  git fetch origin && git checkout -b <нова-гілка> origin/main && git cherry-pick <коміт>",
);
console.error("");
console.error("Якщо пуш у закриту гілку все ж потрібен: git push --no-verify");
process.exit(1);
