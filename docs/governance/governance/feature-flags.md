# Feature Flags Registry

> **Last touched:** 2026-09-16 by @claude. **Next review:** 2026-12-16.
> **Status:** Deprecated — реєстр переїхав у [`docs/engineering/architecture/feature-flags.md`](../../engineering/architecture/feature-flags.md).

Цей файл був операційним реєстром прапорців на пʼять записів (`app-lock-enabled`, `hub_command_palette`, `ftux_outcome_card_v1`, `AI_MEMORY_ENABLED`, `DIGEST_AI_MEMORY_INGEST_ENABLED`), доки [`AGENTS.md § See also`](../../../AGENTS.md#see-also) не назвав канонічним реєстром **усіх** тумблерів архітектурний документ. Той покриває всі чотири системи (build-time `VITE_*`, серверні env, користувацький `FLAG_REGISTRY`, in-memory kill-switch), дефолти, що ламається при протилежному значенні, і умову зняття; усі пʼять записів звідси там уже є. Два реєстри поруч розходились мовчки — тут не було `STRIPE_ENABLED`, `LIQPAY_ENABLED`, `PLATA_ENABLED`, `ACCESS_ALLOWLIST_USER_IDS` і жодного `VITE_*`.

Що робити тепер:

- новий прапорець → [`add-feature-flag.md`](../../start/instructions/add-feature-flag.md) плюс рядок у таблиці відповідної системи архітектурного реєстру (його § 6);
- зняття → [`retire-feature-flag.md`](../../start/instructions/retire-feature-flag.md);
- контракт запису (власник, дефолт, план розкатки, семантика kill-switch, дата створення, умова зняття, поверхні, PR) — у § 6 архітектурного реєстру.

Історична таблиця — у git history цього файлу.
