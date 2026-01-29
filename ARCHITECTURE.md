# Search API — Architecture

## Folder structure

All application code lives under `services/`. Database and tests are colocated or at the root as shown.

```
Search_API/
├── .env
├── package.json
├── services/
│   ├── types.ts                 ← SearchInput, SearchPlan, CandidateProperty, etc.
│   ├── search.plan.ts            ← buildSearchPlan(input) — validate & normalize
│   ├── search.service.ts         ← search(input) — orchestrates pipeline
│   ├── database/
│   │   └── index.ts              ← Pool, query(), getClient(), close()
│   ├── pricing/
│   │   └── pricing.engine.ts     ← Pricing logic (used by pricing stage)
│   ├── queries/
│   │   ├── availability.query.ts
│   │   └── candidate.query.ts    ← DB: capacity + PostGIS radius, limit
│   └── stages/
│       ├── candidate.stage.ts     → candidate.query → database
│       ├── availability.stage.ts → availability.query
│       ├── stayRules.stage.ts
│       ├── pricing.stage.ts      → pricing.engine
│       ├── ranking.stage.ts
│       └── pagination.stage.ts
├── test/
│   ├── test-db.mts
│   └── test-search.mts           ← Calls search() directly
└── node_modules/
```

---

## Request flow

Entry is via `search(input)` (e.g. from `test/test-search.mts` or a future HTTP layer). The service builds a plan, then runs the pipeline.

```
  Caller (test or HTTP)
        │
        ▼
  services/search.service.ts  ──►  search(input)
        │
        │  1. buildSearchPlan(input)
        ▼
  services/search.plan.ts  ──►  SearchPlan (validated, immutable)
        │
        ▼
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  PIPELINE (each stage: plan + previous stage output)                     │
  ├─────────────────────────────────────────────────────────────────────────┤
  │  2. candidate(plan)           →  stages/candidate.stage.ts              │
  │           │                              │                               │
  │           │                              └──► queries/candidate.query.ts │
  │           │                                        │                     │
  │           │                                        └──► database/index.ts │
  │           ▼                                                                 │
  │  3. availability(plan, candidates)   →  availability.stage → availability.query  │
  │  4. stayRules(plan, available)        →  stayRules.stage                          │
  │  5. pricing(plan, afterStayRules)    →  pricing.stage → pricing.engine           │
  │  6. ranking(plan, priced)             →  ranking.stage                            │
  │  7. pagination(plan, ranked)          →  pagination.stage                         │
  └─────────────────────────────────────────────────────────────────────────┘
        │
        ▼
  SearchResult (paginated)  ──►  returned to caller
```

---

## Data flow through the pipeline

| Step | Stage         | Input                      | Output / Next               |
|------|---------------|----------------------------|-----------------------------|
| 0    | **Plan**      | `SearchInput`              | `SearchPlan` (frozen)       |
| 1    | **Candidate** | `SearchPlan`               | `CandidateProperty[]`       |
| 2    | **Availability** | `SearchPlan`, candidates | `AvailableProperty[]`       |
| 3    | **Stay rules**   | `SearchPlan`, available  | filtered list               |
| 4    | **Pricing**      | `SearchPlan`, after stay | `PricedProperty[]`          |
| 5    | **Ranking**      | `SearchPlan`, priced     | sorted list                 |
| 6    | **Pagination**   | `SearchPlan`, ranked     | `SearchResult` (page, total)|

---

## File roles

| File | Role |
|------|------|
| `services/search.service.ts` | Single public API: `search(input)`. Runs the 7-step pipeline. |
| `services/search.plan.ts` | Pure validation + normalization: `SearchInput` → `SearchPlan`. No DB/HTTP. |
| `services/types.ts` | Shared types: `SearchInput`, `SearchPlan`, `CandidateProperty`, etc. |
| `services/database/index.ts` | PG pool, `query()`, `getClient()`, `close()`. |
| `services/stages/*.ts` | One stage per file; `(plan, previousResult)` → next list or `SearchResult`. |
| `services/queries/*.query.ts` | DB access: build SQL, call `database/query()`, map rows to types. |
| `services/pricing/pricing.engine.ts` | Pricing logic; used by `pricing.stage`. |
| `test/test-search.mts` | Invokes `search(input)` directly (no HTTP). |

---

## How to run

- **Search pipeline**: From project root, run `npx tsx test/test-search.mts` (or add an npm script that points to `test/test-search.mts`).
- **HTTP**: Add a server entry (e.g. Fastify) and a route that calls `search(input)` and returns the `SearchResult` as JSON.
