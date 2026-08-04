# eslint-plugin-sergeant-design

> **Last touched:** 2026-08-04 by @Skords-01. **Next review:** 2026-11-02.
> **Status:** Active

Локальний ESLint-плагін для runtime-, security-, storage-, API- та domain-інваріантів Sergeant. Попри історичну назву, він більше не кодує в AST суб’єктивні візуальні рішення: колір, радіус, типографіка, motion і композиція перевіряються design tokens, Storybook та review згідно з [ADR-0081](../../docs/04-governance/adr/0081-repository-simplification.md).

## Правила

- `no-raw-tracked-storage` — не дозволяє прямий доступ до tracked storage.
- `no-raw-local-storage` — не дозволяє обхід storage-адаптерів.
- `no-finyk-token-in-storage` — не дозволяє зберігати Finyk token у client storage.
- `ai-marker-syntax` — перевіряє синтаксис lifecycle/AI-маркерів.
- `no-bigint-string` — блокує серіалізацію DB `bigint` як рядка.
- `rq-keys-only-from-factory` — вимагає централізовані React Query keys.
- `no-anthropic-key-in-logs` — захищає LLM credentials від логування.
- `no-console-pii` — блокує PII у console-викликах.
- `no-raw-req-in-pino-log` — не дозволяє передавати raw request у Pino.
- `no-strict-bypass` — блокує локальні обходи TypeScript strictness.
- `no-cyrillic-jsx-literal` — маршрутизує product-copy через i18n-каталог.
- `no-flat-shared-lib` — захищає межі shared-lib.
- `forbid-shell-only-feature` — блокує feature-код лише в одному shell.
- `no-hash-router-in-modules` — захищає канонічний router contract.
- `no-legacy-telegram-parse-mode` — блокує legacy Telegram parse mode.
- `prefer-kyiv-time` — вимагає явної доктрини межі доби (ADR-0078): Kyiv-хелпери для відображення/звітів, документований suppress для device-local особистого дня.
- `no-inline-body-size-limit` — вимагає централізовані body-size limits.
- `prefer-parse-body-over-validate-body` — вимагає типізований parse contract.
- `sri-on-third-party-script` — вимагає SRI для third-party scripts.
- `no-raw-storage-key` — вимагає централізовані storage keys.
- `no-adhoc-metric-aggregation` — не дозволяє рахувати витрати інлайном (акумульований `Math.abs(tx.amount / 100)`) поза `packages/*-domain/**`; метрика має йти через канонічну функцію з [реєстру метрик](../../docs/02-engineering/architecture/metric-registry.md).

## Перевірка

```bash
pnpm --filter eslint-plugin-sergeant-design test
pnpm lint
```
