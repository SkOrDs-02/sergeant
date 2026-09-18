# Agents in apps/mobile

> **Last touched:** 2026-09-14 by @claude. **Next review:** 2026-12-25.
> **Status:** Active

> **Single source of truth → root [`AGENTS.md`](../../AGENTS.md).** Sub-tree quick reference для агентів, що працюють в `apps/mobile/` (Expo + React Native). Сусідній `apps/mobile-shell/` (Capacitor wrapper) ділить ту саму specialist skill, але має окрему build pipeline (web bundle через `apps/web`).

## Specialist skill

[`.agents/skills/sergeant-mobile-expo/SKILL.md`](../../.agents/skills/sergeant-mobile-expo/SKILL.md) — `apps/mobile`, `apps/mobile-shell`, Expo Router boundaries, NativeWind, MMKV, no DOM leakage.

## Stack snapshot

Expo 52 + React Native 0.76 + Expo Router (file-based) + NativeWind. Storage: MMKV (не localStorage). Тести: Jest. E2E: Detox (iOS sim). Статус — **internal dev-client**: готово до `eas build --profile development`, ще не для store.

> **Продуктовий розвиток мобайла на паузі з 2026-08-25** — [ADR-0094](../../docs/governance/adr/0094-mobile-web-first-freeze.md) (web-first; обидва стеки, Expo і Capacitor). Пауза, **не** sunset: код лишається активом, а `typecheck` і Jest цього воркспейсу далі гейтять `main`. Беруть нову мобільну фічу — спершу звіряйся з ADR-0094, а не з цим стеком. Попередній запис «Capacitor primary, обидва стеки активні» ([ADR-0052](../../docs/governance/adr/0052-mobile-strategy-capacitor-primary.md)) superseded 2026-09-13.

## Quick commands

```bash
pnpm --filter @sergeant/mobile start            # Expo dev server
pnpm --filter @sergeant/mobile ios              # iOS sim
pnpm --filter @sergeant/mobile android          # Android emu
pnpm --filter @sergeant/mobile web              # Expo web (debug)
pnpm --filter @sergeant/mobile typecheck
pnpm --filter @sergeant/mobile test             # Jest (--passWithNoTests OK)
pnpm --filter @sergeant/mobile test:coverage
pnpm --filter @sergeant/mobile e2e:test:ios     # Detox iOS sim
pnpm --filter @sergeant/mobile check-build-config  # before EAS build
```

## Surface-specific gotchas

- **No DOM leakage:** mobile-код не імпортує `window`/`document`/DOM-only API. Перевіряй імпорти зі shared-пакетів і не тягни напряму з `apps/web`. ESLint ловить найочевидніше — але краще перевіряти у feature-cycle.
- **Storage:** MMKV, не localStorage. Спільні утиліти зі shared-пакетів повинні бути storage-agnostic (приймати storage adapter), інакше web/mobile почнуть розходитись.
- **Routing:** Expo Router file-based (`app/` directory). Не плутати з `react-router-dom` з web.
- **NativeWind:** Tailwind-like, але **не** Tailwind — частина класів не підтримується. Tailwind preset з `@sergeant/design-tokens` — джерело правди для токенів; перевіряй сумісність із NativeWind перед використанням.
- **Build config:** `pnpm --filter @sergeant/mobile check-build-config` валідує `app.config.ts` + `eas.json` перед EAS build — запускай локально перед PR, що чіпає mobile config.
- **Domain invariants** (Kyiv time, kopiykas as `number`, Better Auth opaque user IDs) — однакові з web/server, див. корінь.
- **Flaky-tests mitigation (T7 / [sprint-roadmap §1.1](https://github.com/Skords-01/Sergeant/blob/d068c73a2f21881d5c1305544fe99f3ea8be81f4/docs/90-work/planning/archive/sprint-roadmap-q2q3-2026.md#11-tech-борг)).** Якщо mobile-suite починає інтермітентно фейлити — спершу перевір канонічний pattern: `AccessibilityInfo.isReduceMotionEnabled()` має бути замоканий через `mockResolvedValue(false)`, а не як never-resolving Promise (інакше unsettled microtask + `act()` flushing → "update not wrapped in act" warning, і на slow-runner-і — таймаут). Референс: commit [`53853e00`](https://github.com/Skords-01/Sergeant/commit/53853e00) (OnboardingWizard) + [`f11c1f49`](https://github.com/Skords-01/Sergeant/commit/f11c1f49) (WeeklyDigestFooter, HubSettingsPage — stub `useWeeklyDigest`). Verification gate: GitHub Actions → **Mobile flaky-tests verification (20-run)** ([`.github/workflows/mobile-flaky-verify.yml`](../../.github/workflows/mobile-flaky-verify.yml)) — manual / weekly cron job, який гонить jest-suite 20 разів і фейлить на першій помилці; 20/20 поспіль зеленим = baseline для зняття flaky-tag-у.

## Deeper docs

- App README: [`apps/mobile/README.md`](./README.md)
- Mobile strategy ADR (чинний): [`docs/governance/adr/0094-mobile-web-first-freeze.md`](../../docs/governance/adr/0094-mobile-web-first-freeze.md) — пауза обох стеків, web-first. Історія: [`0052-mobile-strategy-capacitor-primary.md`](../../docs/governance/adr/0052-mobile-strategy-capacitor-primary.md) (superseded)
- Канонічний перелік замороженого й порядок розморозки: [`docs/work/specs/tech-debt/mobile.md`](../../docs/work/specs/tech-debt/mobile.md)
- Capacitor / deep links / RN migration: [`docs/engineering/mobile/`](../../docs/engineering/mobile/)
- Routing catalog: [`docs/start/agents/agent-skills-catalog.md`](../../docs/start/agents/agent-skills-catalog.md)
- Domain invariants: [`docs/engineering/architecture/domain-invariants.md`](../../docs/engineering/architecture/domain-invariants.md)
