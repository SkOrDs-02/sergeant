# Architecture

> **Last validated:** 2026-05-02 by @Skords-01. **Next review:** 2026-07-31.
> **Status:** Active

System architecture and runtime surface inventory for Sergeant.

| Document                                                             | Purpose                                                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`api-v1.md`](./api-v1.md)                                           | REST API v1 contract overview                                                         |
| [`apps-status-matrix.md`](./apps-status-matrix.md)                   | Status matrix for apps and packages                                                   |
| [`apps-web-exhaustive-deps.md`](./apps-web-exhaustive-deps.md)       | Web hooks dependency guidance                                                         |
| [`data-exchange-storage-audit.md`](./data-exchange-storage-audit.md) | Current data exchange, storage, weak points, and roadmap                              |
| [`frontend-overview.md`](./frontend-overview.md)                     | React 18 + Vite frontend architecture                                                 |
| [`hosting-evolution.md`](./hosting-evolution.md)                     | Hosting evolution and infra context                                                   |
| [`module-structure.md`](./module-structure.md)                       | Canonical layout of `apps/{web,mobile}/src/modules/<domain>/` + per-module deviations |
| [`platforms.md`](./platforms.md)                                     | Web, Expo mobile, and mobile-shell deployment surfaces                                |
| [`service-catalog.md`](./service-catalog.md)                         | Runtime inventory: owners, targets, dependencies, healthchecks, rollback paths        |
