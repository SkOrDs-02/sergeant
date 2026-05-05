# Repo assets — hero, screenshots, GIFs

> **Last validated:** 2026-05-05 by @Skords-01 / Devin. **Next review:** 2026-08-03.
> **Status:** Active

> Static assets, що використовуються в `README.md`, `docs/`, або в social-meta-картинках. Не плутати з `apps/web/public/` (runtime web assets) і `apps/mobile/assets/` (mobile bundle).

## Що тут лежить

| Файл                   | Призначення                                 | Розмір (target)    | Як капчити                                   |
| ---------------------- | ------------------------------------------- | ------------------ | -------------------------------------------- |
| `sergeant-hero.png`    | Hero-зображення на верху `README.md`        | 1280×720, ≤ 200 KB | Web dashboard (cold-start без даних)         |
| `ftux-flow.gif`        | 15-сек GIF онбордингу (welcome → dashboard) | 800×600, ≤ 4 MB    | Web FTUX flow з reset-нутою localStorage     |
| `module-finyk.png`     | Скрін Finyk dashboard (для doc-ів)          | 1024×768, ≤ 150 KB | `/finyk` після додавання 1-2 demo-транзакцій |
| `module-fizruk.png`    | Скрін Fizruk dashboard                      | 1024×768, ≤ 150 KB | `/fizruk` після додавання workout            |
| `module-routine.png`   | Скрін Routine                               | 1024×768, ≤ 150 KB | `/routine` після створення 2 habit-ів        |
| `module-nutrition.png` | Скрін Nutrition                             | 1024×768, ≤ 150 KB | `/nutrition` після додавання meal            |

> Капч робиться з web-app у Chrome, Linux/macOS, viewport 1280×720, без dev-tools. PNG експорт через DevTools `Capture full size screenshot`. GIF — через `peek` (Linux) або `Kap` (macOS), 12 fps.

## Як викапчити hero (`sergeant-hero.png`)

1. Локальний bootstrap (з `README.md` § Quickstart): `pnpm install --frozen-lockfile` → `cp .env.example .env` → `pnpm dev:db` → `pnpm dev:server` + `pnpm dev:web` у двох терміналах.
2. Відкрити `http://localhost:5173/welcome` у Chrome.
3. Localstorage очистити: DevTools → Application → Local Storage → `http://localhost:5173` → Clear all.
4. Reload — має показатися hero `OnboardingWizard`.
5. DevTools → Cmd+Shift+P → `Capture full size screenshot`.
6. Optimize: `pngquant --quality=80-95 sergeant-hero.png` (target ≤ 200 KB).
7. Покласти у `docs/assets/sergeant-hero.png`.

## Як викапчити FTUX-flow GIF (`ftux-flow.gif`)

1. Localstorage очистити (як вище).
2. Запустити screen-recorder (`peek` / `Kap`) на window 800×600.
3. Перейти `/welcome` → клікнути «Почати» → пройти OnboardingWizard (вибрати 2 модулі) → first action card → dashboard. **15 секунд**, не довше.
4. Експортувати як GIF, 12 fps.
5. Оптимізувати: `gifsicle -O3 --lossy=80 ftux-flow.gif -o ftux-flow.gif` (target ≤ 4 MB).
6. Покласти у `docs/assets/ftux-flow.gif`.

## Конвенції

- **Імена файлів:** kebab-case, ASCII-only, без пробілів. Префікс групи: `module-*`, `flow-*`, `onboarding-*`.
- **Мова:** UI на скрінах — українська (per Hard Rule #15 і consumer-target). Якщо потрібен EN-варіант для marketing — окрема папка `docs/assets/en/`.
- **Brand consistency:** модулі іменуються кирилицею без emoji («Фінік», «Фізрук», «Рутина», «Харчування»). Якщо capture показує latin codename — re-capture або edit string у capture-flow.
- **PII:** жодних реальних транзакцій, жодних реальних номерів карток, жодних реальних email-ів. Demo-data тільки.
- **Розмір:** PNG ≤ 200 KB, GIF ≤ 4 MB. Якщо більше — `pngquant` / `gifsicle`. Великі файли push в `git lfs` ми не використовуємо (поки що).
- **README не переходить на CDN:** path-и відносні (`docs/assets/...`), щоб працювало в offline preview.

## Що НЕ кладеться сюди

- Runtime web assets → `apps/web/public/` (favicon, app-icon, splash).
- Mobile bundle assets → `apps/mobile/assets/`, `apps/mobile-shell/...`.
- Marketing landing assets → окремий repo (`Sergeant-website` якщо буде створений).
- Дизайн-system графіка → `packages/design-tokens/`.

## Track відсутніх assets

> Цей track повинен бути порожнім після завершення asset-capture-PR-у (PR-02b з [`docs/launch/product-os/ftux-master-tracker.md`](../launch/product-os/ftux-master-tracker.md) §3).

| Asset               | Reason missing        | Owner / Tracker                       |
| ------------------- | --------------------- | ------------------------------------- |
| `sergeant-hero.png` | Asset capture pending | PR-02b (after PR-02 structural lands) |
| `ftux-flow.gif`     | Asset capture pending | PR-02b                                |
| `module-*.png` (×4) | Lower priority        | PR-22 (post-Wave-1)                   |
