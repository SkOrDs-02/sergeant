# Локальне середовище верифікації

> **Last validated:** 2026-09-05 by Codex. **Next review:** 2026-10-05.
> **Status:** Active

## База даних

Docker Desktop 4.78.0 / engine 29.5.3 відновлено 2026-09-05. У контейнері `hub-postgres` на SHA-pinned pgvector/pg17 створена окрема база `sergeant_verification_20260905`; застосовано 136 міграцій (`migrate_ok`, schema_drift_none: shipped=applied=136). Том контейнера не видалявся, інші бази не очищались.

Локальний URL (лише dev-credentials): `postgresql://hub:hub@127.0.0.1:5432/sergeant_verification_20260905`.

Кореневий `.env` містить **віддалений** DATABASE_URL. Для цього стенду обовʼязково перекривати DATABASE_URL і MIGRATE_DATABASE_URL локальним URL у процесі, до імпорту server/db. Ніколи не запускати dev:db з припущенням, що кореневий env локальний. З кореневого env потрібен лише OpenRouter key; не переносити решту production-конфігурації до стенду.

```powershell
docker exec hub-postgres pg_isready -U hub -d sergeant_verification_20260905
$env:DATABASE_URL = 'postgresql://hub:hub@127.0.0.1:5432/sergeant_verification_20260905'
$env:MIGRATE_DATABASE_URL = $env:DATABASE_URL
pnpm --filter @sergeant/server db:migrate:dev
```

`db:migrate` не підхоплює `.env` самостійно. Попередній `migrate_database_url_missing` означав відсутність змінної **у процесі**, а не доказ відсутності запису у файлі.

## Відновлення Docker (факт цієї сесії)

Було дві перешкоди: застряглий WSL bootstrap та вікно відновлення після невдалого оновлення від 2026-07-20. У `C:/ProgramData/DockerDesktop/update-state.json` лишився `Failed: true`, причина — тоді було 2110 MB вільного місця при потребі 3464 MB. Це історичний замір, не поточний стан диска.

Зупинено Docker Desktop/backend і виконано `wsl --terminate docker-desktop`, потім Docker запущено знову. Для вікна `Update Failed` виконано штатну дію Continue через його локальний named-pipe API (контракт перевірено у встановленому `entry-error-dialog.main.js`: POST /action, JSON action=Continue). Після цього `docker version` повернув 29.5.3, PostgreSQL — accepting connections. Видалення томів, factory reset, перевстановлення та зміна системного JSON не знадобились.

При повторенні починати з нових логів: `%LOCALAPPDATA%/Docker/log/host/` і `log/vm/init.log`. Відсутній pipe й старий listener WSL не є доказом готової БД. Перевіряти Docker API та pg_isready окремо.

## Web/API

Для пілота: API 127.0.0.1:3000, preview 127.0.0.1:4173, BETTER_AUTH_URL на API й ALLOWED_ORIGINS на preview. Web збирається з VERCEL=1 (outDir=dist) і VITE_API_BASE_URL=http://127.0.0.1:3000. Без VERCEL=1 Vite використовує іншу теку результату.

Продуктові OAuth, email, push, зовнішні банківські токени та Redis не налаштовані на цьому стенді. Це обмеження відповідних сценаріїв, не причина називати їх пройденими. На машині мало вільної RAM; важкі тести запускати послідовно, browser workers=1.
