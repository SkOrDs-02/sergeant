# OpenClaw Stage 5b — Strategic-Modes PR Split Session Recap (2026-05-12)

> **Last validated:** 2026-05-12 by Devin. **Next review:** 2026-08-10 (or coincident with Stage 7 cutover, whichever sooner — see § 7).
> **Status:** In progress.
>
> - PR-1 (`/plan`) — **merged** ([#2482](https://github.com/Skords-01/Sergeant/pull/2482), `ae703ca0`, 2026-05-12 17:13 UTC)
> - PR-2 (`/analyze`) — **PR open** ([#2483](https://github.com/Skords-01/Sergeant/pull/2483); rebased onto `main` after PR-1 merged so the diff is a clean delta against current `main`)
> - PR-3 (this doc) — **PR open**
> - Pending: PR-4 (`/okr` + parent Stage 5b ✅ flip) — handed off to a subsequent session per founder split.

## 0. TL;DR (актуальна версія — 30 сек)

Stage 5b ("Strategic-modes wiring") у `docs/planning/openclaw-migration-plan.md` спочатку був одним стейджем — а далі його розбили на **три** PR-и (`/plan`, `/analyze`, `/okr`) для смаллер-blast-radius review. Ця сесія шипить перші два code-PR (`/plan` уже merged, `/analyze` open) + цей docs-PR. Архітектурний контракт зафіксований нижче, бо PR-4 (`/okr`) поїде у наступній сесії і йому потрібен handoff.

**Що нового у плагіні після Stage 5b:**

- Новий package-internal module `packages/openclaw-plugin/src/strategic-modes/` — registry-style catalogue (`ALL_STRATEGIC_MODES`) + `matchStrategicMode()` matcher + per-mode definition files (`plan.ts`, `analyze.ts`, надалі `okr.ts`).
- Новий host hook `packages/openclaw-plugin/src/hooks/strategic-mode.ts` на `before_agent_start` — другий handler цього lifecycle slot-а (перший — Stage 4a audit-open).
- При матчі `/plan <topic>` / `/analyze <anomaly>` hook повертає `{ prompt: <stripped topic>, prependContext: <PRIMER> }` — таким чином agent отримує **тільки тему** (без слешу) у `prompt`, а primer впадає у системний промпт перед agent-call-ом. Не-strategic prompts: hook повертає `undefined`, дефолтний flow продовжується.
- Drift gate: PLAN_PRIMER / ANALYZE_PRIMER порівнюється байт-у-байт з legacy console (`tools/console/src/agents/strategic-modes.ts`). Якщо хтось зачепить legacy primer без bump-у в плагіні — CI падає. Це навмисний contract під час parallel-run з Gateway (Stage 6b).

**Hook count в `before_agent_start`:** **2** (Stage 4a audit-open + Stage 5b strategic-mode). Total hook count в plugin: **7** (виріс з 6 після Stage 5b PR-1).

---

## 1. Чому розбили Stage 5b на 3 PR-и

Founder обрав split-варіант (option "Розбити Stage 5b на менші PR (окремо /plan, /analyze, /okr)" у живій бесіді). Trade-offs які зважували:

- **PR size & blast radius.** Один великий PR на всі 3 strategic-modes легше зробити (одна гілка, одна review-сесія), але важче ревьюити: drift-gate тести × 3, integration тести × 3, registry asserts, host hook factory. Кожен з трьох пунктів ортогональний до іншого, тому атомарний review логічно роздробити.
- **Залежності між модами.** Першу PR-у треба зробити "scaffolding-heavy" — host hook, registry, matcher, types, drift-gate test pattern. Наступні дві — це data-додатки (new primer + new pattern + extend `ALL_STRATEGIC_MODES`). Якщо все було б в одній PR-і, scaffolding утопає у data.
- **Rebase coordination.** PR-2 (`/analyze`) спочатку базувався на гілці PR-1 (`devin/...-stage5b-plan`), бо обидві PR-и чіпають `ALL_STRATEGIC_MODES`. Коли PR-1 merge-нувся (швидко — 5 хв між open і merge), PR-2 довелося ребейзнути на `main` — це чистий 1-commit-replay (`git rebase main`, `git push --force-with-lease`). Якщо б це був один великий PR — таких rebase-ів не було б, але кожна окрема PR-а review-ється легше.
- **Future strategic-modes у Stage 8+.** Voice/Canvas персони можуть притягнути додаткові slash-команди (`/voice`, `/canvas`). Завдяки розбиттю кожна з них = ~80 LOC PR-а (один новий файл у `strategic-modes/`, plug-in у registry, drift-gate якщо є legacy primer, integration test).

PR-3 (цей docs) виокремлений за окремим запитом founder-а: _"ні, після пр 2 робиш окремий пр документацї. потім скажу шо робити"_. Чисто розділяє code-changes від session knowledge капчуру.

---

## 2. Архітектура strategic-modes module

```
packages/openclaw-plugin/src/
├── strategic-modes/
│   ├── types.ts          # StrategicModeSlug, StrategicModeTrigger, StrategicModeMatch, StrategicModeDefinition
│   ├── plan.ts           # PLAN_PRIMER, PLAN_PATTERN, planMode (PR-1)
│   ├── analyze.ts        # ANALYZE_PRIMER, ANALYZE_PATTERN, analyzeMode (PR-2)
│   ├── okr.ts            # OKR_PRIMER, OKR_PATTERN, okrMode (PR-4, pending)
│   ├── index.ts          # ALL_STRATEGIC_MODES = [planMode, analyzeMode, …], matchStrategicMode()
│   └── index.test.ts     # matcher tests + drift-gate tests per mode
└── hooks/
    ├── strategic-mode.ts        # createStrategicModeHook() factory → before_agent_start handler
    └── strategic-mode.test.ts   # handler unit-tests (happy / pass-through / error-safe)
```

**Per-mode definition shape** (`types.ts`):

```typescript
export interface StrategicModeDefinition {
  slug: StrategicModeSlug; // "plan" | "analyze" | "okr"
  trigger: StrategicModeTrigger; // "strategic_plan" | "strategic_analyze" | "strategic_okr"
  primer: string; // STRATEGIC_MODE: <slug>. <4-step framework…>
  pattern: RegExp; // ^\/<slug>\b\s+(?<topic>\S[\s\S]*?)\s*$/i
  topicRequired: boolean; // /plan and /analyze: true; /okr: false (bare /okr is valid)
}
```

**Matcher** (`strategic-modes/index.ts:matchStrategicMode`):

1. Trim message.
2. Iterate `ALL_STRATEGIC_MODES` in declaration order. First pattern match wins.
3. If `topicRequired === true` and captured `topic` group is empty → continue (no match).
4. Return `{ slug, trigger, primer, topic }` or `null`.

**Host hook** (`hooks/strategic-mode.ts:createStrategicModeHook`):

1. Read `event.prompt`. Defensive: if not a string or throws → log + return `undefined` (pass-through).
2. Call `matchStrategicMode(event.prompt)`.
3. If `null` → return `undefined` (pass-through; non-strategic prompts fall through to default flow).
4. If match → return `{ prompt: match.topic, prependContext: match.primer }`. Note: `prompt` is the stripped topic only — the slash command itself never reaches the agent. `prependContext` is the primer which lands at the **head** of the agent's system prompt.

---

## 3. Чому `before_agent_start`, а не `before_dispatch`

OpenClaw 5.7 SDK реал API (verified у spike `docs/notes/spikes/openclaw-sdk-5.7-real-api.md` § 4):

| Hook                 | Return shape                                                    | Semantic                                                                                |
| -------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `before_dispatch`    | `{ handled: true, text: string } \| { handled: false } \| void` | **Short-circuit only.** Use case: Layer 0 shortcut router (no agent call at all).       |
| `before_agent_start` | `{ prompt?, prependContext?, … } \| void`                       | **Mutate then continue.** Multiple handlers compose; results merged registration-order. |

Strategic mode wants **mutate-then-continue**, not short-circuit — founder must still get a full LLM response, just primed with a structured framework. Тому `before_agent_start` — єдиний валідний slot. Цей вибір залишається canonical і для майбутніх PR-4 (`/okr`) — навіть якщо `/okr` короткий, він пропускає agent з primer-ом.

---

## 4. Hook registration order (КРИТИЧНО)

Реєстрація — у `packages/openclaw-plugin/src/index.ts` (registerPlugin):

```typescript
// 1. Stage 4a audit-open — отримує оригінальний `/plan churn-q3` text
api.on("before_agent_start", auditOpenHandler, { name: "sergeant.audit.open" });

// 2. Stage 5b strategic-mode — отримує (і пере-пише) той самий event після audit
api.on("before_agent_start", strategicModeHandler, {
  name: "sergeant.strategic_mode",
});
```

**Чому audit-open ПЕРШИЙ:**

- Audit-row у Postgres (`openclaw_invocations.user_message`) має зберегти ВЕРБАТИМНИЙ текст founder-а — `"/plan churn-q3"`, не `"churn-q3"`. Якщо strategic-mode зареєструється першим, audit побачить уже stripped prompt і колонка втратить інформацію.
- Покрите регресійним тестом у `src/index.test.ts` ("Stage 5b PR-1 + PR-2 — strategic-mode hook wired into before_agent_start"): handler-и filter-яться по `event === "before_agent_start"`, очікується що `.length === 2` і `handlers[1]` (НЕ `[0]`) — strategic.
- Stage 4b Layer 0 shortcut router живе на **окремому** lifecycle slot (`before_dispatch`), тому з ним конфліктів немає.

---

## 5. Drift gate pattern

PLAN_PRIMER + ANALYZE_PRIMER (і майбутній OKR_PRIMER) — це **byte-for-byte copy** з legacy console (`tools/console/src/agents/strategic-modes.ts`). Drift gate тест читає legacy файл, reconstructs string literal через `Function()`, і порівнює:

```typescript
const legacyPath = resolve(
  __dirname,
  "../../../../tools/console/src/agents/strategic-modes.ts",
);
const legacySource = readFileSync(legacyPath, "utf8");
const blockMatch = legacySource.match(
  /const PLAN_PRIMER =\s*([\s\S]*?);\s*\n/, // greedy until terminating `;\n`
);
const reconstructed = Function(
  "return (" + (blockMatch?.[1] ?? "''") + ")",
)() as string;
expect(PLAN_PRIMER).toBe(reconstructed);
```

**Чому не просто `import`?** Плагін `@sergeant/openclaw-plugin` має бути package-independent — окремий Docker image, deploy-ит-ся на Railway service `sergeant-openclaw-gateway`. Він НЕ може import-ити з `tools/console/*` (workspace boundary). Замість прямого import — drift gate через file-read дає eventually-consistent гарантію.

**Lifetime контракту:** drift gate валідний поки legacy console живе (Stage 6b parallel-run). Як тільки Stage 7 cutover видаляє `tools/console/src/agents/strategic-modes.ts` — drift gate треба видалити одним PR (з усіма трьома `*_PRIMER` тестами). Це vendoring trade-off: контракт є нудний, але defensive і catch-ить drift автоматично.

---

## 6. Якщо PR конфлікти при rebase

Сценарій що трапився цією сесією: PR-1 merge-нувся ДО того, як PR-2 був відкритий (5 хв). PR-2 базувався на гілці PR-1 → після merge гілка PR-1 видалилась з remote → коли пробували відкрити PR-2 з `base: devin/...-stage5b-plan` дістали 422 від GitHub API. Resolution:

1. **Open PR-2 with `base: main` directly** (бо PR-1 commit уже в `main`, GitHub diff покаже лише delta).
2. Якщо при цьому GitHub показав `mergeable: false, mergeable_state: dirty` — значить tracker-рядок у `docs/planning/openclaw-migration-plan.md` конфліктує з оновленим `main` (бо PR-1 теж чіпав цей файл при merge). Resolution: `git rebase main`, прийняти merged-state, `npx prettier --write` (бо table-realignment може зрушити column widths), `git push --force-with-lease=<branch>:<remote-sha>`.
3. **`--force-with-lease` warning:** plain `--force-with-lease` падає з `stale info` коли local repo не знає remote ref. Workaround — fetch first then `--force-with-lease=<branch>:<fetched-sha>` (explicit expected ref).

---

## 7. PR-4 (`/okr`) handoff

PR-4 буде делегований у наступну сесію (founder вибере timing). Чек-лист для агента що візьме:

- [ ] **Code:** новий `packages/openclaw-plugin/src/strategic-modes/okr.ts` з `OKR_PRIMER`, `OKR_PATTERN = /^\/okr\b\s*(?<topic>\S[\s\S]*?)?\s*$/i` (важливо: `\s+(?<topic>\S[\s\S]*?)\s*$` → `\s*(?<topic>\S[\s\S]*?)?\s*$` — topic optional), `okrMode = { slug: "okr", trigger: "strategic_okr", primer: OKR_PRIMER, pattern: OKR_PATTERN, topicRequired: false }`.
- [ ] **Wire у `strategic-modes/index.ts`:** add `import { okrMode } from "./okr.js"`, push до `ALL_STRATEGIC_MODES` третім, export.
- [ ] **Tests:** mirror `/analyze`-suite але з case `topicRequired: false` (bare `/okr` — valid match, returns `{ topic: "" }`). Add `/okr Q3 progress` case теж. Drift gate для `OKR_PRIMER` — той самий pattern як для PLAN/ANALYZE. Integration test у `src/index.test.ts` — додати в існуючий "Stage 5b" describe block (зайве не множити describe-блоки).
- [ ] **Tracker bump:** `5b/okr` row ⬜→✅ merged, parent `5b` 🚧→✅ merged. Plan freshness header — `last_validated` bumped до дати merge.
- [ ] **Verification:** `pnpm --filter @sergeant/openclaw-plugin test` — expected count 258 → ~273 (+15 для OKR mirror suite). Lint + typecheck + build + prettier — clean.

Архітектурно OKR `topicRequired: false` — це ЄДИНА відмінність від /plan і /analyze. Matcher уже підтримує цей кейс (див. `matchStrategicMode` § 2 пункт 3) — нічого міняти в `strategic-modes/index.ts` matcher логіці не треба.

---

## 8. Posture для Stage 6+

Як тільки PR-4 (`/okr`) merge-нувся і parent Stage 5b ✅:

- Stage 6a — reactivate parity harness у CI (compare grammy bot output vs Gateway output для тих самих 17 шорткатів + 3 strategic-modes).
- Stage 6b — ≥1 тиждень manual parallel run. Live smoke-тест для `/plan`, `/analyze`, `/okr` — кожен має повернути 4-step structured response per primer (NOT generic LLM prose).
- Stage 7 — Cutover playbook (ADR-0056 supersedes ADR-0055). Деletion checklist включає: drift-gate тести × 3, `tools/console/src/agents/strategic-modes.ts`, всі legacy primers.

---

## 9. Що не входить у Stage 5b (нагадування)

- **Council orchestration** (`/council <topic>` — multi-persona consensus). Це Stage 5c, окрема архітектура з $2.0 budget pre-gate і multi-turn coordination.
- **Morning-digest cron** (auto-generated digest о 09:00 EEST). Це Stage 5d.
- **Per-strategic-mode tool overlays.** Сьогодні persona-allowlist (Stage 5a) — це базовий tool gate. Strategic-mode primer не змінює tool-allowlist (тільки prompt mutation). Якщо в майбутньому захочеться "у `/analyze` mode дай агенту доступ до посилених observability tools" — це окрема архітектура (`StrategicModeDefinition.toolsOverride?`), не Stage 5b.

---

## 10. Verification matrix (snapshot після цієї сесії)

| File                                                                    | LOC change | Tests                                                                                  |
| ----------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| `packages/openclaw-plugin/src/strategic-modes/types.ts`                 | +78 (new)  | covered by type-check                                                                  |
| `packages/openclaw-plugin/src/strategic-modes/plan.ts`                  | +54 (new)  | 12 matcher + drift gate                                                                |
| `packages/openclaw-plugin/src/strategic-modes/analyze.ts`               | +40 (new)  | 11 matcher + drift gate                                                                |
| `packages/openclaw-plugin/src/strategic-modes/index.ts`                 | +57 (new)  | 2 registry asserts (length + unique slug/trigger)                                      |
| `packages/openclaw-plugin/src/strategic-modes/index.test.ts`            | +220 (new) | covers all of above                                                                    |
| `packages/openclaw-plugin/src/hooks/strategic-mode.ts`                  | +125 (new) | 10 hook factory tests                                                                  |
| `packages/openclaw-plugin/src/hooks/strategic-mode.test.ts`             | +180 (new) | covers above                                                                           |
| `packages/openclaw-plugin/src/index.ts`                                 | +12        | 3 integration tests (PR-1) + 1 added in PR-2 (/analyze)                                |
| `packages/openclaw-plugin/src/index.test.ts`                            | +50        | hook count 7, before_agent_start count 2, /plan and /analyze activations, pass-through |
| `docs/planning/openclaw-migration-plan.md`                              | +4         | n/a (tracker)                                                                          |
| `docs/notes/spikes/openclaw-stage-5b-pr-split-2026-05-12.md` (цей файл) | +new       | n/a (knowledge handoff)                                                                |

**Test count:** `pnpm --filter @sergeant/openclaw-plugin test`: **258/258 pass** (baseline 221 до Stage 5b → 245 після PR-1 → 258 після PR-2).

**Lint + typecheck + build + prettier:** clean across all PRs.
