// scripts/__tests__/dockerfile-api-migrate-entrypoint.test.mjs
//
// Shape-regression tests for the migration step in `Dockerfile.api`.
//
// Чому цей гейт існує. До 2026-09-21 міграції запускав Coolify
// `pre_deployment_command`, і це давало тихий розсинхрон: Coolify виконує
// команду через `docker exec` у контейнері, що ЩЕ ПРАЦЮЄ на попередньому
// образі. `migrate.js` читав старі `.sql`, не бачив нової міграції і чесно
// рапортував `migrate_ok` — тобто кожна міграція застосовувалась рівно на
// один деплой пізніше за код, який на неї розраховує (знахідка 2026-08-28,
// `apps/server/AGENTS.md`).
//
// Лікує перенесення кроку в ENTRYPOINT образу: там це вже новий код, і він
// відпрацьовує до старту веб-сервера. Але сама конструкція крихка у трьох
// місцях, і втрата будь-якого повертає поломку мовчки:
//
//   1. `migrate` має стояти ПЕРЕД `index` — інакше сервер стартує зі старою
//      схемою, тобто рівно той стан, який ми лікуємо;
//   2. з'єднання має бути `&&`, а не `;` — інакше впала міграція не зупиняє
//      старт, healthcheck зеленіє, і Coolify лишає контейнер з розбіжною
//      схемою замість відкоту;
//   3. `index` має запускатись через `exec` — інакше PID 1 лишається за
//      `sh`, який не ретранслює SIGTERM, і graceful shutdown у `index.ts`
//      не спрацьовує: контейнер помирає по таймауту з обірваними
//      з'єднаннями.
//
// Тому перевіряються саме ці властивості, а не «рядок ENTRYPOINT існує».
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dockerfile = readFileSync(resolve(repoRoot, "Dockerfile.api"), "utf8");

/** Рядки без коментарів — інакше приклади в примітках ловились би як код. */
function instructionLines() {
  return dockerfile
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
}

function entrypointLine() {
  const found = instructionLines().filter((l) => l.startsWith("ENTRYPOINT"));
  assert.equal(
    found.length,
    1,
    `очікується рівно один ENTRYPOINT, знайдено ${found.length}`,
  );
  return found[0];
}

test("ENTRYPOINT проганяє міграції перед стартом сервера", () => {
  const line = entrypointLine();
  const migrateAt = line.indexOf("migrate.js");
  const indexAt = line.indexOf("index.js");

  assert.notEqual(migrateAt, -1, "у ENTRYPOINT немає migrate.js");
  assert.notEqual(indexAt, -1, "у ENTRYPOINT немає index.js");
  assert.ok(
    migrateAt < indexAt,
    "migrate.js має стояти ПЕРЕД index.js, інакше сервер стартує зі старою схемою",
  );
});

test("крок fail-closed: міграція і сервер зʼєднані через &&", () => {
  const line = entrypointLine();
  assert.ok(
    /migrate\.js\s*&&/.test(line),
    "між migrate.js та стартом сервера має бути `&&`: з `;` впала міграція не зупинить старт",
  );
});

test("сервер запускається через exec, щоб отримувати SIGTERM", () => {
  const line = entrypointLine();
  assert.ok(
    /exec\s+node\s+dist-server\/index\.js/.test(line),
    "index.js має стартувати через `exec`, інакше PID 1 лишається за sh і graceful shutdown не працює",
  );
});

test("ENTRYPOINT іде через shell, який у образі справді є", () => {
  const line = entrypointLine();
  assert.ok(
    line.includes('"/bin/sh"'),
    "ENTRYPOINT має бути обгорнутий у /bin/sh",
  );
  assert.ok(
    /COPY --from=busybox:stable-musl \/bin\/busybox \/bin\/sh/.test(dockerfile),
    "у distroless немає шела: /bin/sh мусить копіюватись з busybox:stable-musl",
  );
});

test("CMD не лишився поруч із shell-ENTRYPOINT", () => {
  // `sh -c "<script>"` віддає наступний аргумент у `$0`, а не в скрипт, тож
  // забутий `CMD ["dist-server/index.js"]` не запустив би сервер удруге, але
  // й нічого не означав би — мертвий рядок, який читається як робочий.
  const cmds = instructionLines().filter((l) => l.startsWith("CMD"));
  assert.equal(
    cmds.length,
    0,
    `при shell-ENTRYPOINT CMD зайвий і оманливий, знайдено: ${cmds.join(" | ")}`,
  );
});

test("PATH містить /nodejs/bin, інакше sh не знайде node", () => {
  assert.ok(
    /ENV PATH="\/nodejs\/bin:/.test(dockerfile),
    "у distroless node живе в /nodejs/bin, якого немає в дефолтному PATH; без override ENTRYPOINT падає на 127",
  );
});
