---
description: Start all dev services — DB, server, web — in background
---

Start all development services for the Sergeant monorepo.

1. **Database:** Start Docker Postgres + migrations:
   ```
   background_process start: pnpm dev:db
   ```
2. **Server:** Start API server:
   ```
   background_process start: pnpm dev:server
   ready: { pattern: "localhost:3000" }
   ```
3. **Web:** Start frontend dev server:
   ```
   background_process start: pnpm dev:web
   ready: { pattern: "localhost:5173" }
   ```
4. Report status of all three services with their URLs:
   - DB: Docker Postgres (port 5432)
   - API: http://localhost:3000
   - Web: http://localhost:5173

If any service fails to start, show the error and suggest fixes.
