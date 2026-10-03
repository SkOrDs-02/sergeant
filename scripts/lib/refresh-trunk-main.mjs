// Тримати `main` у трунку `D:\Sergeant` свіжим із будь-якого worktree.
//
// AI-CONTEXT: уся робота йде через worktree, тож у трунк не заходять місяцями.
// Залежить від нього більше, ніж здається: `core.hooksPath` указує на `.husky/_`
// саме трунку, а шим husky шукає сам хук у його РОБОЧОМУ ДЕРЕВІ. Тобто застарілий
// трунк означає застарілі (або відсутні) хуки в УСІХ worktree.
//
// Спільне між трунком і worktree - каталог `.git`: об'єкти, гілки, remotes. Окреме
// в кожного - робоче дерево, HEAD, індекс. Звідси два різні випадки, і обидва треба
// обробити, бо потрібна команда залежить від того, що зачекінено в трунку:
//
//   `main` НЕ зачекінений -> `fetch origin main:main` рухає ref без checkout.
//       Дешево і безпечно, але ФАЙЛИ трунку лишаються старими, тож хуки не
//       оновлюються. Це half-fix, і саме на ньому 2026-09-23 хук не запрацював.
//
//   `main` зачекінений -> `fetch main:main` ВІДМОВИТЬ (git не фетчить у поточну
//       гілку), потрібен `merge --ff-only`. Він оновлює й робоче дерево, тобто
//       це єдиний шлях, яким у трунк доїжджають нові хуки.
//
// Untracked-файли не блокують: у трунку часто лежать артефакти чужої сесії, а
// ff-merge їх не чіпає. Незакомічені зміни tracked-файлів блокують - чужу роботу
// не чіпаємо. Будь-яка помилка тут мовчазна: це зручність, а не гейт.

import { execFileSync } from "node:child_process";

const TRUNK = "D:\\Sergeant";

// Обережно з `stdio: "ignore"`: execFileSync тоді повертає null, і наївний
// `.toString()` кидає TypeError, який тут же ковтає catch. Тобто функція мовчки
// рапортує "skipped" і нічого не робить - рівно та порода помилки, проти якої
// написаний цей файл.
function git(args, opts = {}) {
  const out = execFileSync("git", ["-C", TRUNK, ...args], {
    encoding: "utf8",
    timeout: 30_000,
    ...opts,
  });
  return (out ?? "").toString().trim();
}

/**
 * @returns {"ff-merged"|"ref-updated"|"dirty"|"skipped"} що саме сталося
 */
export function refreshTrunkMain() {
  try {
    const head = git(["rev-parse", "--abbrev-ref", "HEAD"]);

    if (head !== "main") {
      git(["fetch", "origin", "main:main"], { stdio: "ignore" });
      return "ref-updated";
    }

    // Tracked-зміни означають, що в трунку хтось працює: не чіпаємо.
    if (git(["status", "--porcelain", "--untracked-files=no"]) !== "") {
      return "dirty";
    }

    git(["fetch", "origin", "--quiet"], { stdio: "ignore" });
    git(["merge", "--ff-only", "origin/main"], { stdio: "ignore" });
    return "ff-merged";
  } catch {
    return "skipped";
  }
}
