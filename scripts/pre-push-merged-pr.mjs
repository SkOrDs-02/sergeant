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

import { readFileSync } from "node:fs";

import { refreshTrunkMain } from "./lib/refresh-trunk-main.mjs";

const ENV_PATH = "D:\\Sergeant\\.env";
const REPO = "skords01/sergeant";

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

if (blocked.length === 0) {
  refreshTrunkMain();
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
