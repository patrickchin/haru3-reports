# P4: E2E & Polish (Week 8)

> Part of [Implementation Plan](./implementation-plan.md)

### Goal
Port Maestro flows, fix bugs, performance optimization.

### P4.1 — Maestro Flow Migration

**Deliverables:**
- All 49 flows ported to mobile-v3

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.1.1 | Port subflows (7 flows) | 2h | P3 |
| P4.1.2 | Port auth flows (11 flows) | 3h | P4.1.1 |
| P4.1.3 | Port project flows (10 flows) | 3h | P4.1.2 |
| P4.1.4 | Port member flows (6 flows) | 2h | P4.1.3 |
| P4.1.5 | Port report flows (13 flows) | 4h | P4.1.4 |
| P4.1.6 | Port voice-note flows (6 flows) | 2h | P4.1.5 |
| P4.1.7 | Port file flows (5 flows) | 2h | P4.1.6 |
| P4.1.8 | Port profile flows (8 flows) | 2h | P4.1.7 |
| P4.1.9 | Verify all flows pass | 4h | P4.1.8 |

**Acceptance Criteria:**
- [ ] All 49 flows ported
- [ ] smoke tag flows pass
- [ ] fixture-mode tag on AI flows (R7)

---

### P4.2 — Bug Fixing

**Deliverables:**
- All P0-P3 bugs fixed

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.2.1 | Triage E2E failures | 4h | P4.1 |
| P4.2.2 | Fix identified bugs | 8h | P4.2.1 |
| P4.2.3 | Regression tests for fixes | 4h | P4.2.2 |

**Acceptance Criteria:**
- [ ] All Maestro flows green
- [ ] 80% unit test coverage
- [ ] No critical bugs

---

### P4.3 — Performance Optimization

**Deliverables:**
- Optimized renders, bundle size

**Tasks:**

| Task | Description | Est. | Depends On |
|------|-------------|------|------------|
| P4.3.1 | Profile render performance | 2h | P4.2 |
| P4.3.2 | Add memoization where needed | 2h | P4.3.1 |
| P4.3.3 | Analyze bundle size | 1h | P4.3.2 |
| P4.3.4 | Remove unused dependencies | 1h | P4.3.3 |

**Acceptance Criteria:**
- [ ] No unnecessary re-renders
- [ ] Bundle size < v1 bundle
