# Pre-commit timing — як читати і чим міряти

> **Last validated:** 2026-05-13 by Devin (child session). **Next review:** 2026-08-11.
> **Status:** Active

> Закриває P1-5 з [`docs/audits/2026-05-13-testing-devx-roast.md`](../audits/2026-05-13-testing-devx-roast.md) — «Pre-commit timing не вимірюється».
> Жорстко тримається Hard Rule #7 — `--no-verify` далі заборонено, ця обгортка лише вимірює час, не послаблює гейт.

## Що це таке

`.husky/pre-commit` тепер запускає не `pnpm exec lint-staged` напряму, а wrapper `scripts/pre-commit-timing.mjs`. Wrapper:

1. Спавнить `pnpm exec lint-staged --concurrent false` як child process — те саме, що було раніше.
2. Міряє wall-clock час `perf_hooks.performance.now()` навколо нього.
3. Друкує markdown summary у stderr одразу після хука (видно у консолі при кожному `git commit`).
4. Дописує JSONL-рядок у `.husky/.pre-commit-timings.log` (gitignored, local-only signal).
5. Виходить із тим самим exit-кодом, що й lint-staged — commit-семантика не змінюється.

Дефолт — увімкнено. Жодних додаткових прапорців не треба.

## Що ти бачиш у консолі

Після успішного commit-у Husky-вивід виглядає так:

```
✔ Preparing lint-staged...
✔ Running tasks for staged files...
✔ Applying modifications from tasks...
✔ Cleaning up temporary files...

⏱  pre-commit timing summary
   total: 4.21 s · exit 0
   log:   .husky/.pre-commit-timings.log (gitignored)
   tip:   run `pnpm pre-commit:timings` to see p50/p95 over recent commits.
```

Якщо lint-staged відвалився — summary все одно друкується (з `exit ≠ 0`), а wrapper re-exits із тим самим кодом.

## Як подивитись історію

```bash
pnpm pre-commit:timings              # останні 50 commit-ів
pnpm pre-commit:timings -- --last 20 # останні 20
pnpm pre-commit:timings -- --all     # увесь лог
```

Вивід — markdown-таблиця з `n / p50 / p95 / mean / max` для `total` і кожного зареєстрованого stage. Лог приватний (gitignored), тому числа у тебе локальні — не діляться на CI, не публікуються в repo. Якщо хочеш порівняти з кимсь — копіюй вручну.

## Opt-out

```bash
SERGEANT_SKIP_TIMING=1 git commit -m "..."
```

Bypass-ить лише timing, не сам хук. Корисно якщо wrapper колись поламається — швидкий fallback на чисте `lint-staged`. **Не використовуй це для CI-гейтів** — таймінги — суто dev signal.

## Per-stage контракт — `SERGEANT_TIMING_LOG`

Wrapper кладе у env-var `SERGEANT_TIMING_LOG` шлях до session-scoped tmp-файлу. Будь-який nested-скрипт (наприклад, `scripts/staged-typecheck.mjs`, `scripts/docs/bump-last-validated.mjs`) може дописати JSONL-рядок туди, і wrapper підхопить ці події у summary + log record. Контракт:

```jsonc
// один stage = один рядок
{ "stage": "staged-typecheck", "ms": 1234 }
```

Поля:

- `stage` (string) — людино-читабельна назва stage-у. Стабільні значення стають колонками у `pnpm pre-commit:timings`.
- `ms` (number) — час stage-у у мілісекундах (`perf_hooks.performance.now()` різниця).

Рекомендована емісія у скрипті:

```js
import { performance } from "node:perf_hooks";
import { appendFileSync } from "node:fs";

const start = performance.now();
// ... робота скрипта ...
const log = process.env.SERGEANT_TIMING_LOG;
if (log) {
  try {
    appendFileSync(
      log,
      JSON.stringify({ stage: "my-stage", ms: performance.now() - start }) +
        "\n",
    );
  } catch {
    // timing must never block a commit
  }
}
```

Помилки запису — best-effort: коментуй `catch {}` і не валі commit з-за них.

Інструментація staged-stage-ів (eslint+prettier per file, staged-typecheck, bump-last-validated) — окремий follow-up; контракт уже стабільний і чекає його. Поки активний лише `total` row, що покриває весь pre-commit pipeline.

## Куди записується лог

`.husky/.pre-commit-timings.log` — JSON-lines, по одному запису на commit:

```jsonc
{
  "ts": "2026-05-13T22:00:00.000Z",
  "totalMs": 4213,
  "stages": {
    // populated тільки якщо downstream-скрипт емітнув подію
    "staged-typecheck": { "ms": 1234, "calls": 1 },
  },
  "exitCode": 0,
  "node": "20.20.2",
}
```

Файл — gitignored ([`.gitignore` § "Pre-commit timing log"](../../.gitignore)). Локальний-only. Якщо лог захарастився — `rm .husky/.pre-commit-timings.log` безпечно.

## FAQ

**Чи може wrapper заблокувати commit, якщо timing-логіка впаде?**
Ні. Запис у лог обгорнуто `try/catch`, помилка друкується у stderr і пропускається. Сам commit лише блокується тоді, коли `lint-staged` повертає ненульовий код (як і до wrapper-а).

**Що з `--no-verify`?**
Заборонено Hard Rule #7. Wrapper нічого не послаблює — він просто вимірює час навколо тих самих кроків.

**Чому timing у stderr, а не stdout?**
git pipe-ить stdout pre-commit-у, і ми не хочемо забруднити його markdown-блоком. stderr терміналу видно інтерактивно, у CI воно теж попадає у лог.

**Скільки місця займає лог?**
~150 байт на запис. 1000 commit-ів = ~150 KB. Періодично можна обрізати руками; ніколи не комітиться у repo.

## Cross-refs

- `scripts/pre-commit-timing.mjs` — wrapper (опис у файлі-header).
- `scripts/pre-commit-timings-report.mjs` — aggregator для `pnpm pre-commit:timings`.
- [`.husky/pre-commit`](../../.husky/pre-commit) — точка входу.
- [`docs/audits/2026-05-13-testing-devx-roast.md` § P1-5](../audits/2026-05-13-testing-devx-roast.md#p1-5-pre-commit-timing-не-вимірюється) — origin audit item.
- [`docs/governance/rules/07-pre-commit-hooks-via-husky.md`](../governance/rules/07-pre-commit-hooks-via-husky.md) — Hard Rule #7.
- [`CONTRIBUTING.md § Pre-commit hooks`](../../CONTRIBUTING.md#pre-commit-hooks) — повний pre-commit matrix.
