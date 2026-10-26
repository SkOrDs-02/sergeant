# Хаб: свіжість банківських витрат без входу у Фінік

> **Last touched:** 2026-10-26 by @claude (тріаж документації: Active → Implemented, PR-номер, рев'ю: посилання на фінальний package gate). **Next review:** 2027-11-01.
> **Status:** Implemented - [#1515](https://github.com/SkOrDs-02/sergeant/pull/1515) (змерджено 2026-10-15); гейт `apps/web/src/modules/finyk/hooks/FinykBootCluster.freshness.test.tsx`. Свідома межа: живого push банку у вкладку немає. Залишків немає.

## Симптом і причина

Власник бачить на головній стару суму витрат; вхід у Фінік оновлює її. База розслідування: origin/main4aaac1772, merged #1514. Native заморожений, MEMANTO/codebase-memory не використовуються за вказівкою власника.

| ID           | Межа                                            | Підтвердження                                                                                                                                                                                | Виправлення                                                                                                                                                        |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HUB-FRESH-01 | Сервер → локальне дзеркало                      | Лише FinykApp монтував useMonobank/useMonobankWebhook, який запитує банк і записує SQLite. Загальний FinykBootCluster читав лише стару локальну копію                                        | Автентизований boot монтує той самий bank-hook на будь-якому маршруті. Boot з анонімним/невизначеним id не робить приватних запитів                                |
| HUB-FRESH-02 | Відновлений query-cache → увімкнення транзакцій | За збереженого свіжого query з однією операцією новий запит не починався після отримання sync-state: при переході enabledfalse→true staleTime60s ще не минув, навіть із refetchOnMountalways | Транзакції revalidate при увімкненні, монтуванні й focus; кеш лишається для негайного/offline читання                                                              |
| HUB-FRESH-03 | Boot + екран → SQLite                           | Два споживачі одного bank-hook могли б записувати ті самі відповіді двічі                                                                                                                    | Boot володіє mirror-записами, екран спостерігає ті самі query keys із writeMirrorfalse. Спільний in-flight запит один; два рядки банку дають два upsert, не чотири |

Quick-stats уже перераховувався від SQLite/mirror ticks і будив Hub через storageUpdated. Цей ланцюжок не замінюється. Формули, гроші в копійках, часові межі Києва, приховані картки, виключення, refunds і ручні записи не змінені. Банки-скарбнички потрібні екрану Фініка; загальний boot їх не завантажує. Нових API чи прямого polling Monobank немає: використовуються чинні серверні endpoints і query factories.

## Регресійний доказ

`FinykBootCluster.freshness.test.tsx` монтує реальний boot і HubSpendHero без FinykApp. Справжня in-memory SQLite з чинними міграціями; реальні bank-нормалізатор, mirror writer/reader, quick-stats і hub bus; MSW підміняє сервер. Замокані лише браузерний DB-handle та резолвер локального id (2 mocks, нижче cap5).

Сценарії: на пристрої100₴, на сервері500₴; повернення у вкладку приносить700₴; startup із ще свіжим persisted query; спільний запит і єдиний писач;503 зберігає100₴; anonymous/loading не запитують приватний банк. На main первинний сценарій стабільно лишається100₴. Початковий фікс виявив другий випадок persisted query, після виправлення проходять усі7 сценаріїв.

Фінальні browser-кадри та package-гейти дописуються перед публікацією. Перший тестовий harness ставив gcTime0 для неактивного me-query й сам видаляв auth-cache; виправлено на Infinity, як у живого auth-споживача. Це не продуктова зміна. Проміжні невдалі прогони не зараховуються.

## Межа гарантії

Оновлення працює на запуску й поверненні у вкладку. Коли мережі немає, зберігається остання локальна сума; живого push-потоку банківських даних у відкриту вкладку цей PR не вводить. Серверний ingest банку не перевіряється приватним MSW/browser fixture: перевіряється шлях отримання вже наявної серверної операції у web.

## Докази на остаточному коді

Production freeze1a3093e47, гілка `claude/fix-hub-finyk-freshness`. `regression-main-final.log`:4failed/3passed, exit1 на основній причині100₴ замість500₴; фікс відновлено без ослаблення assertions. `acceptance-final.log`:7/7passed, exit0. Цільовий звʼязаний пакет перед останнім loadJarsfalse:9suites/130passed, exit0. Повний пакет на freeze на момент цього запису ще добігав; фінальний результат (exit 0) - у § «Підсумковий package gate» нижче; логи `web-complete.log/.exit`, checksum source `full-suite-source.sha256`.

`pnpm --filter @sergeant/web typecheck`, `pnpm lint`, `pnpm --filter @sergeant/web build`, `pnpm --filter @sergeant/web exec size-limit`, `node scripts/ci/check-eager-bundle.mjs`, `pnpm format:check`: exit0 кожна. JS1.51MB≤1.51MB, CSS32.59KB≤40KB, eager258.1KB≤268KB; бюджети не змінені. Штатний web-коміт1a3093e47: hooks/typecheck/gitleaks exit0.

Browser: свіжий архів origin/main4aaac1772 і виправлення, `VITE_E2E_SEED=true`, Chromium390×844, обидві теми. `browser-before-final`2/2, exit0: хаб100₴ на startup й visibilitychange,0 запитів операцій до відкриття Фініка; Фінік700₴ після відкриття. `browser-after-final`2/2, exit0: startup500₴, після нової серверної операції й visibilitychange700₴, Фінік700₴;2 запити операцій (по одному на кожне оновлення хаба). До контрольного кроку Фінік не відкривався. SQLite засіяно через чинний writeMonoTransactions, читач/сповіщення справжні. Server API приватний fixture, не реальний банківський ingest.

Перший after-browser перевіряв bringToFront між headless tabs, але вони не дали потрібної lifecycle-події: сума лишилась500₴, а native visibilitychange не відбувся. Harness тепер явно надсилає `visibilitychange` у window — точний сигнал, на який підписаний FocusManager; після цього є новий запит і700₴. Це тест браузерного event-шляху, не фізичного iPhone. Перший невдалий прогін не pass. Обидві версії перезнято тим самим остаточним harness.

12 оригіналів і6 пар, розміри перевірено; самодостатня галерея/ZIP `/workspace/artifacts/hub-freshness/`. Кадри передано власнику в чат, не у PR body. Додаткових UI/копі/навігаційних змін немає.

## Підсумковий package gate

`CI=true NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @sergeant/web exec vitest run --maxWorkers=3 --reporter=verbose`: **1368/1368 файлів,14083 passed /5 skipped, failures0, exit0**,1338.90s (`web-complete.log/.exit`). Це весь web після остаточного freeze1a3093e47; production-source не змінювався. `sha256sum --check full-suite-source.sha256`: exit0. Origin/main після свіжого fetch лишився4aaac1772, merge-state актуальний.

Docs inventory/open-work/STATUS, `pnpm design:check-md`, `pnpm lint:specs` (22/22), validator PR body — exit0. Новий audit після першого docs-коміту потребував штатної нормалізації inventory old_path; артефакт перегенеровано, baseline/CI не послаблено. Commit по surfaces: web1a3093e47, docsac4980fce; усі hooks/gitleaks exit0. Повний monorepo/native check не заявляється зеленим замість цього web proof.
