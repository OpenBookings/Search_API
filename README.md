# Search API — Folder Structure & Flow

## Folder structure

```
Search_API/
├── .env
├── package.json
├── routes/
│   └── search.ts              ← HTTP route (entry point when wired)
├── database/
│   ├── index.ts               ← Pool, query(), getClient(), close()
│   └── queries.ts             ← (shared DB helpers)
├── services/
│   ├── types.ts               ← SearchInput, SearchPlan, CandidateProperty, etc.
│   ├── search.plan.ts         ← buildSearchPlan(input) — validate & normalize
│   ├── search.service.ts      ← search(input) — orchestrates pipeline
│   ├── pricing/
│   │   └── pricing.engine.ts  ← Pricing logic (used by pricing stage)
│   ├── queries/
│   │   ├── availability.query.ts
│   │   └── candidate.query.ts ← DB: capacity + PostGIS radius, limit
│   └── stages/
│       ├── candidate.stage.ts   → uses candidate.query
│       ├── availability.stage.ts → uses availability.query (stub)
│       ├── stayRules.stage.ts
│       ├── pricing.stage.ts     → uses pricing.engine (stub)
│       ├── ranking.stage.ts
│       └── pagination.stage.ts
├── scripts/
│   ├── test-db.mts
│   └── test-search.mts        ← Calls search() directly
└── node_modules/
```

---

## Request flow (high level)

```
  HTTP Request                    services/search.service.ts
        │                                    │
        ▼                                    ▼
  routes/search.ts  ──────────►  search(input)
        (empty)                           │
                                          │ 1. buildSearchPlan(input)
                                          ▼
                                 services/search.plan.ts
                                          │
                                          │  SearchPlan (validated, immutable)
                                          ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  PIPELINE (each stage receives plan + previous stage output)              │
  ├──────────────────────────────────────────────────────────────────────────┤
  │  2. candidate(plan)         →  stages/candidate.stage.ts                  │
  │         │                            │                                   │
  │         │                            └──► queries/candidate.query.ts     │
  │         │                                      │                         │
  │         │                                      └──► database/index.ts     │
  │         ▼                                                                 │
  │  3. availability(plan, candidates)  →  availability.stage → availability.query  │
  │  4. stayRules(plan, available)       →  stayRules.stage                         │
  │  5. pricing(plan, afterStayRules)    →  pricing.stage → pricing.engine          │
  │  6. ranking(plan, priced)            →  ranking.stage                           │
  │  7. pagination(plan, ranked)         →  pagination.stage                         │
  └──────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
                                 SearchResult (paginated)
                                          │
                                          ▼
  HTTP Response  ◄────────────  routes/search.ts
```

---

## Data flow through the pipeline

| Step | Stage        | Input                    | Output / Next              |
|------|--------------|--------------------------|----------------------------|
| 0    | **Plan**     | `SearchInput`            | `SearchPlan` (frozen)      |
| 1    | **Candidate**| `SearchPlan`             | `CandidateProperty[]`      |
| 2    | **Availability** | `SearchPlan`, candidates | `AvailableProperty[]`  |
| 3    | **Stay rules**   | `SearchPlan`, available  | filtered list              |
| 4    | **Pricing**      | `SearchPlan`, after stay | `PricedProperty[]`         |
| 5    | **Ranking**      | `SearchPlan`, priced     | sorted list                |
| 6    | **Pagination**   | `SearchPlan`, ranked     | `SearchResult` (page, total)|

---

## File roles (quick reference)

| File | Role |
|------|------|
| `routes/search.ts` | HTTP entry (currently empty; would call `search()` and return JSON). |
| `services/search.service.ts` | Runs the 7-step pipeline; single public function `search(input)`. |
| `services/search.plan.ts` | Pure validation + normalization: `SearchInput` → `SearchPlan`. No DB/HTTP. |
| `services/types.ts` | Shared types: `SearchInput`, `SearchPlan`, `CandidateProperty`, etc. |
| `services/stages/*.ts` | One stage per file; each takes `(plan, previousResult)` and returns next list or final `SearchResult`. |
| `services/queries/*.query.ts` | DB access: build SQL, call `database/query()`, map rows to types. |
| `services/pricing/pricing.engine.ts` | Pricing logic; used by `pricing.stage`. |
| `database/index.ts` | PG pool, `query()`, `getClient()`, `close()`. |

---

## How to run the flow today

- **Without HTTP**: `npm run test:search` runs `scripts/test-search.mts`, which calls `search(input)` directly.
- **With HTTP**: Wire `routes/search.ts` to Fastify (and ensure a `server.js` or similar entry exists) so that POST/GET search hits `search()` and returns `SearchResult`.
