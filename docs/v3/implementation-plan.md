# Mobile v3 + REST API Implementation Plan

> **Status**: Planning document — Phase-by-phase implementation guide
>
> **Last updated**: 2026-05-10
>
> **Reference**: [`docs/v3/architecture.md`](./architecture.md)

This document breaks down the v3 implementation into phases with specific tasks, dependencies, and acceptance criteria. Tasks are sized for delegation to coding agents.

---

## Phase Overview

| Phase | Name | Duration | Dependencies | Key Deliverables |
|-------|------|----------|--------------|------------------|
| P0 | Foundation | 1 week | None | Packages scaffolded, OpenAPI spec, CI |
| P1 | API Core | 2 weeks | P0 | All REST endpoints, contract tests |
| P2 | Mobile Shell | 1 week | P0 | Auth, navigation, design system |
| P3 | Feature Build | 3 weeks | P1, P2 | All screens, unit tests |
| P4 | E2E & Polish | 1 week | P3 | Maestro flows, bug fixes |
| P5 | Migration | 1 week | P4 | Beta rollout, monitoring |

**Total estimated duration**: 9 weeks

## Phase Details

- **[P0: Foundation](./plan-p0-foundation.md)** — Scaffold packages, OpenAPI spec, CI pipelines, Drizzle schema alignment.
- **[P1: API Core](./plan-p1-api-core.md)** — All REST endpoints (auth, projects, reports, notes, files, voice, rate limiting) with contract tests.
- **[P2: Mobile Shell](./plan-p2-mobile-shell.md)** — Auth flow, Expo Router navigation, Unistyles design system, API client setup.
- **[P3: Feature Build](./plan-p3-feature-build.md)** — All screens: projects, reports, notes, upload queue, files/camera, voice notes, profile, PDF export.
- **[P4: E2E & Polish](./plan-p4-e2e-polish.md)** — Maestro flow migration, bug fixing, performance optimization.
- **[P5: Testing](./plan-p5-testing.md)** — API integration tests (Testcontainers), mobile component tests (MSW), contract tests (OpenAPI), removal verification gates.
- **[P5: Migration](./plan-p5-migration.md)** — Fly.io deploy, mobile beta, monitoring, gradual rollout, and legacy code removal (Phases A-D).
- **[Meta: Parallelization & Risks](./plan-meta.md)** — Parallelization opportunities and risk mitigation.

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Source files | < 150 (vs 246) |
| Test coverage | > 80% |
| Maestro flows passing | 49/49 |
| API latency p95 | < 200ms |
| Mobile cold start | < 2s |
| Bundle size | < v1 |

---

*End of implementation plan.*
