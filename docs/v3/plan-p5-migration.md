# P5: Migration (Week 9)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Beta rollout with feature flag.

### P5.1 — Deploy API

**Deliverables:**
- API deployed to Fly.io

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P5.1.1 | Create Fly.io app | 1h | P4 |
| P5.1.2 | Configure secrets | 1h | P5.1.1 |
| P5.1.3 | Deploy staging | 2h | P5.1.2 |
| P5.1.4 | Smoke test staging | 2h | P5.1.3 |
| P5.1.5 | Deploy production | 1h | P5.1.4 |

**Acceptance Criteria:**
- [ ] API running on api.harpa.app
- [ ] All endpoints responding
- [ ] Monitoring in place

---

### P5.2 — Mobile Beta

**Deliverables:**
- mobile-v3 in TestFlight/Play Store Internal

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P5.2.1 | Configure EAS for mobile-v3 | 2h | P5.1 |
| P5.2.2 | Build preview | 2h | P5.2.1 |
| P5.2.3 | Internal testing | 4h | P5.2.2 |
| P5.2.4 | Fix critical issues | 4h | P5.2.3 |
| P5.2.5 | Build production | 2h | P5.2.4 |
| P5.2.6 | Submit to stores | 2h | P5.2.5 |

**Acceptance Criteria:**
- [ ] App in TestFlight
- [ ] App in Play Store Internal
- [ ] Feature flag controls rollout

---

### P5.3 — Monitoring & Rollout

**Deliverables:**
- Monitoring, gradual rollout

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P5.3.1 | Set up error tracking (Sentry) | 2h | P5.2 |
| P5.3.2 | Set up API metrics | 2h | P5.3.1 |
| P5.3.3 | Enable for 10% users | 1h | P5.3.2 |
| P5.3.4 | Monitor for 48h | — | P5.3.3 |
| P5.3.5 | Expand to 50% | 1h | P5.3.4 |
| P5.3.6 | Monitor for 48h | — | P5.3.5 |
| P5.3.7 | Full rollout | 1h | P5.3.6 |

**Acceptance Criteria:**
- [ ] Error rate < 0.1%
- [ ] p95 latency < 500ms
- [ ] 100% users on v3
