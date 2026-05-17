# Sergeant v2 — Execution Status (live tracker)

> **Last validated:** 2026-05-17 by @Skords-01 (Phase 0+1 shipped, smoke verified on production).
> **Next review:** updated after each Phase wrap.
> **Status:** Active.
> **Companion docs:** [`execution-brief.md`](./execution-brief.md) (orchestration contract — how to run the work) · [`execution-plan.md`](./execution-plan.md) (intent — what we plan to do) · [`governance.md`](./governance.md) (governance) · [`migration.md`](./migration.md) (BEFORE/AFTER tokens) · [`handoff-package/`](./handoff-package/) (canvas mockups + locked decisions, 2026-05-17).

## Як цей doc працює

Цей файл — **live status**, не plan. План (`redesign-v2-execution-plan.md`) каже **що ми хочемо зробити**. Цей — **що насправді зроблено, що відкладено, які знайдені розриви плану та реальності**. Оновлюється наприкінці кожної фази у тому ж PR, що закриває фазу.

Якщо ти агент, що приходить cold у редизайн-роботу — починай **з цього файлу**, не з плана. Він дає мінімальний context: де ми, що було скоплено, які risk'и активні.

---

## Phase status matrix

| Phase                      | Status          | Branch / PR                                                                                      | Acceptance                                                                                                                           |
| -------------------------- | --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Phase 0 — Foundation       | ✅ Shipped      | [#2952](https://github.com/Skords-01/Sergeant/pull/2952) — `feat/redesign-v2/phase-0-foundation` | Typecheck clean, 8/8 rule tests pass, additive only                                                                                  |
| Phase 1 — Quick wins       | ✅ Shipped      | [#2953](https://github.com/Skords-01/Sergeant/pull/2953) — squash-merged → main                  | Typecheck clean (0 new errors); Chrome MCP smoke verified on https://sergeant.vercel.app — all features functional, 0 console errors |
| Phase 2 — Polish migration | ⬜ Not started  | —                                                                                                | —                                                                                                                                    |
| Phase 3 — Friction removal | ⬜ Not started  | —                                                                                                | —                                                                                                                                    |
| Phase 4 — Value + Wow      | ⬜ Not started  | —                                                                                                | —                                                                                                                                    |
| Phase 5 — Insights wiring  | ⬜ Not started  | —                                                                                                | —                                                                                                                                    |
| Phase 6 — Expensa delights | ⬜ Not started  | —                                                                                                | —                                                                                                                                    |
| Phase 7 — Mobile RN parity | 🚫 Out of scope | —                                                                                                | Свідомо відкладена — окремий стратегічний цикл                                                                                       |

### Phase 0 — Foundation (tasks)

| #   | Task                                              | Status      | Notes                                                                                                              |
| --- | ------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| T1  | `.text-style-display-hero` (Manrope 800)          | ✅          | `packages/design-tokens/tailwind-preset.js`. Additive — `.text-style-display` залишений на 700                     |
| T2  | `--c-chart-{module}` CSS vars × 4 themes          | ✅          | `apps/web/src/styles/theme.css`: `:root` + `.dark` + `html.hc` + `html.hc.dark`. Дзеркалить Tailwind preset values |
| T3  | `Sheet` `variant="glass"`                         | ✅          | Default лишається `default`. `GlassVariant` story додано                                                           |
| T4  | v1 gradient `@deprecated` + `no-v1-gradient` rule | ✅          | Rule severity `error` — recon показав zero consumers, безпечно                                                     |
| T5  | `prefer-text-style` → `error` для `modules/**`    | ⚠️ Deferred | ~80 baseline violations. Cleanup PR spawn-tasked окремо. TODO у `eslint.config.js` посилається сюди                |
| T6  | `min-h-touch-target` + `[data-touch-target]`      | ✅          | Tailwind utility (always-on) + opt-in attribute selector у `mobile.css`                                            |

### Phase 1 — Quick wins (tasks)

| #   | Task                                           | Status           | Notes                                                                                                                                                                   |
| --- | ---------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | FAB `v2-{module}` на 4 module entries          | ⚠️ Reduced scope | Тільки Finyk (inline `<button>` → `<FloatingActionButton variant="v2-finyk">`). Інші 3 модулі не мали FAB взагалі — додавання поза «quick wins» (див. Divergences §1.1) |
| 1.2 | M4 synergy — `--bottom-nav-height` на Hub root | ✅               | Hub насправді ВЖЕ wrapped у MeshBackground; додав `style` prop. Закрило M4 + M6 одним edit                                                                              |
| 1.3 | M1 iOS Capacitor JS-detect                     | ✅               | `main.tsx` + `theme.css`. Replaces deprecated `@supports (-webkit-overflow-scrolling: touch)`                                                                           |
| 1.4 | M2 HubBottomNav safe-area math fix             | ✅               | `mb-3` → wrapper `padding-bottom: calc(...)`                                                                                                                            |
| 1.5 | M5 KeyboardAccessory chip `min-h-touch-target` | ✅               | Pairs with T6 token                                                                                                                                                     |
| 1.6 | M3 `motion-safe:backdrop-blur-{md,xl}`         | ✅               | HubBottomNav + ModuleBottomNav                                                                                                                                          |
| 1.7 | Inline close-SVG → `<Icon name="close">`       | ✅               | Sheet + Modal. Icon registry уже мав `close` glyph                                                                                                                      |

---

## Divergences from plan

Кейси де реальність репо відрізнялась від припущень плана. Збираємо тут аби майбутні фази могли вчитися.

### Phase 0

**§T1 file path mismatch.**
План вказував `apps/web/tailwind-preset.js`. Реально preset живе у `packages/design-tokens/tailwind-preset.js` (monorepo package). Recon agent (Explore) це виявив. Виправлено в плані по факту? — ні, файл `redesign-v2-execution-plan.md` ще каже стару locație. **TODO:** виправити при наступному оновленні плана.

**§T2 chart vars — більше ніж план описав.**
План каже «додати 4 змінні у `:root` що дзеркалять preset values. Light + dark + HC окремо». Реальність — 4 theme scopes (`:root`, `.dark`, `html.hc`, `html.hc.dark`), плюс свідомо НЕ додав у `[data-theme-preview="..."]` блоки (DesignShowcase зараз не рендерить charts у preview, додавання — окрема фаза якщо потрібно).

**§T5 severity flip blocked by baseline.**
План просив flip rule на `error` для `modules/**`. Реальність — ~80 candidate violations baseline (grep на `text-* font-*` сполучення). Flip без cleanup ламає CI. Відкладено: TODO у config + spawn-task для cleanup PR.

### Phase 1

**§1.1 FAB inventory empty.**
План припускав «4 FAB-и» на 4 module entries для wire'ing `variant="v2-{module}"`. Реальність — `FloatingActionButton` component експортується з shared/ui, є stories, але **жоден module НЕ використовує його**. Finyk має inline `<button>` styled як FAB (FinykApp.tsx:513-523); Fizruk/Routine/Nutrition не мають quick-add FAB взагалі. Рішення: Finyk inline button → справжній `<FloatingActionButton variant="v2-finyk">`; інші 3 — out of scope (додавання FABs до них — продуктовий change, не «quick win»).

**§1.2 recon agent error.**
Spawned Explore agent помилково повідомив що «Hub не wrapped у MeshBackground — потрібна обгортка». Точкова перевірка через Read `HubHomeView.tsx:87` показала що Hub ВЖЕ wrapped (since PR-5). План був правильний; recon помилився. Урок: для критичних state-перевірок дублюй recon з точковим Read'ом перед прийняттям рішення.

---

## Follow-ups not done (свідомі відкладення)

Список того, що було б добре зробити, але свідомо відклав поза поточними PRs. Tracked aби не загубилось.

| Item                                                                                  | Why deferred                                                                                                                               | Where lives                                                            | When pickup                                                                                                                                                     |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`prefer-text-style` baseline cleanup** (~80 violations у `apps/web/src/modules/**`) | Phase 0 «purely additive» contract; flip severity ламає CI                                                                                 | Spawn-task chip у твоєму UI; TODO у `eslint.config.js`; row у T5 above | Як окремий cleanup PR перед Phase 5+                                                                                                                            |
| **Fizruk / Routine / Nutrition quick-add FABs**                                       | Phase 1 scope reduction — продуктовий change, не quick win                                                                                 | Цей doc (§1.1 divergence)                                              | Окрема product-decision сесія коли визначиш semantic для quick-add (за моделлю Finyk = expense; що для Fizruk? workout? exercise log? — потрібен product input) |
| **Refactor `--bottom-nav-height` як default у MeshBackground**                        | Phase 1.2 фікс — patch consequence (style prop), не root cause; MeshBackground мала б default'нути 60px на module shells і 0 на standalone | Self-eval Phase 1 + цей doc                                            | Phase 4 (Value + Wow primitives) — там і так refactoring shared/components                                                                                      |
| **Capacitor ready-event observer для iOS detect**                                     | Phase 1.3 race на early mount — якщо `getPlatform()` повертає "web" до того як bridge ready, fallback неправильний                         | Self-eval Phase 1                                                      | Phase 5+ (insights wiring) коли інші Capacitor APIs зачіпаються — можна додати observer там одним touch                                                         |
| **Chart CSS vars у `[data-theme-preview]` блоки**                                     | DesignShowcase зараз не рендерить charts у preview tiles                                                                                   | T2 above                                                               | Якщо у Phase 4 DesignShowcase отримає Recharts стори — додати тоді                                                                                              |
| **Update plan file** з виправленнями шляхів і scope-reductions                        | План — intent doc, не status; live updates перевантажують його                                                                             | Цей doc                                                                | Перед merge всієї редизайн-послідовності (Phase 7 фінал) — single update pass для history                                                                       |

---

## Hard-rule violations / near-misses

Поки **0 violations**. Список near-misses (для audit trail):

- **Phase 1, main.tsx:** перший варіант iOS detect я вставив МІЖ `import` statements. ESM забороняє code між imports → potential ESBuild warning. Самостійно catch'нув при final Read pass, виправив (move after all imports) ДО typecheck.

---

## Skill / tool dispatch lessons

Що працювало добре:

- **Recon-перед-планом через Explore agent** — економить 5-8 Read/Grep операцій. Recon виявив 2 plan-reality розриви у Phase 0 + 1 у Phase 1 які я мав би catch'нути сам.
- **`sergeant-design/no-v1-gradient` rule pattern** (tripwire з zero current consumers + paired `@deprecated` JSDoc) — низько-ризикова DS-enforcement без CI fail.
- **TODO-comment + spawn-task chip duo для T5 defer** — TODO для майбутнього reader'а коду, chip для actionable cleanup task.

Що треба міняти:

- **Параллелізм sub-tasks**: Phase 0 + Phase 1 робив sequential, навіть коли tasks незалежні. Phase 2 (codemod на 15 файлів) — обов'язково паралельні Agent calls per sub-PR.
- **Trust + verify recon outputs**: recon agent помилявся на 1.2 Hub MeshBackground state. Point-verify ключові твердження перед edit.
- **Не запускай typecheck у фоні до того як changes у потрібному worktree**: Phase 1 я стартував typecheck, потім транслував changes між worktrees, доводилось cancel+restart. Завжди typecheck у тому worktree де changes сидять.

---

## Next session entry point

Якщо ти агент, що приходить cold у v2-роботу — **починай ЗВІДСИ.** Це 30-секундний onboarding before any tool call.

### Reading order (≤ 10 хв)

1. [`AGENTS.md`](../../../AGENTS.md) — hard rules #11-#17 (особливо).
2. [`CLAUDE.md`](../../../CLAUDE.md) — local-execution policy (не запускай `pnpm test/lint/check/build/dev` без явного прохання).
3. [`execution-brief.md`](./execution-brief.md) — orchestration contract: toolkit dispatch matrix, anti-patterns, self-eval rubric, per-phase acceptance gates. **Читай повністю.**
4. **Цей файл** — поточний phase status, divergences, follow-ups.
5. [`execution-plan.md`](./execution-plan.md) — intent / phase sequencing.
6. [`governance.md`](./governance.md) — governance / token strategy.
7. [`migration.md`](./migration.md) — BEFORE/AFTER patterns (Phase 2 + 6 потребують).
8. [`handoff-package/`](./handoff-package/) — canvas mockups + locked decisions per phase 2 entry (Finyk hero A/B, ModuleBottomNav v2, Phase 6 cherry-picks).

### Memory (durable behavioral lessons)

`C:\Users\dmytr\.claude\projects\E---claude-Sergeant\memory\project_redesign_v2_tokens.md` — оновлюй після кожної фази:

- Що landed (короткий summary)
- Hard-rule trip-prevention notes
- Behavioral lessons (recon errors, scope reductions, anti-pattern slips)
- Open follow-ups not done

### Bootstrap steps

```powershell
# 1. Verify state
cd E:\.claude\Sergeant
git checkout main
git pull --ff-only origin main

# 2. Sync target worktree if needed (or create new for next phase)
git worktree list
# If `..\sergeant-redesign-v2-exec` is on a stale post-merge branch, switch to main:
git -C ..\sergeant-redesign-v2-exec checkout main
git -C ..\sergeant-redesign-v2-exec pull --ff-only origin main

# 3. New phase branch
git -C ..\sergeant-redesign-v2-exec checkout -b feat/redesign-v2/phase-<N>-<topic> main

# 4. Load skill
# Active skill: sergeant-web-ui (repo has no sergeant-design-system — DS work falls under web-ui)
```

### Current phase pointer

- **Last completed:** Phase 1 (Quick wins) — shipped 2026-05-17.
- **Next up:** Phase 2 (Polish migration) — 3-4 sub-PRs: C1+C2+C5 Hub critical, C3+C4 Module Hero, codemod for MAJOR module lists (~15 files), Onboarding cards. **Recon agent first** for C1-C5 surfaces, then `Plan` agent for the codemod recipe before starting 2.3. Locked decisions у [`handoff-package/Handoff for Claude Code.md`](./handoff-package/Handoff%20for%20Claude%20Code.md) §3.
- **Parallel-track follow-up:** T5 `prefer-text-style` baseline cleanup PR — see § Follow-ups not done below. Was spawned as a separate task chip; pick up when convenient.

### Telling the next agent in plain text

> "Continue redesign v2 execution from Phase 2. Read `docs/design/redesign-v2/execution-brief.md` and `docs/design/redesign-v2/execution-status.md` first, then `docs/design/redesign-v2/handoff-package/Handoff for Claude Code.md` for locked decisions. Check memory file `project_redesign_v2_tokens.md`. Active skill: `sergeant-web-ui`. Start with Explore agent recon of Phase 2 surfaces C1-C5, then Plan agent for codemod recipe before sub-PR 2.3."

## Refs

- Brief (orchestration): [`execution-brief.md`](./execution-brief.md)
- Plan: [`execution-plan.md`](./execution-plan.md)
- Governance: [`governance.md`](./governance.md)
- Migration BEFORE/AFTER: [`migration.md`](./migration.md)
- Polish backlog: [`backlog.md`](./backlog.md)
- Handoff package (canvas + locked decisions): [`handoff-package/`](./handoff-package/)
- DS contract: [`../design-system.md`](../design-system.md)
