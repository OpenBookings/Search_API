# Cursor Validation Pipeline — Deep Review

This document analyzes the search API cursor validation pipeline for correctness, safety, and intent preservation.

---

## 1. Schema correctness

### 1.1 Cursor schema (validator)

**Current definition:**

```ts
const cursorSchema = z
  .union([z.string(), z.undefined()])
  .transform((v) => (v === undefined ? undefined : (v as string).trim()))
  .refine(
    (v) =>
      v === undefined ||
      ((v as string).length > 0 && (v as string).length <= CURSOR_MAX_LENGTH),
    { message: `cursor must be absent or a non-empty string of at most ${CURSOR_MAX_LENGTH} characters` }
  );
```

**What works:**

- Optional semantics are explicit: `undefined` and non-empty string are the only valid outcomes.
- `null` is correctly rejected (union of `z.string()` and `z.undefined()` fails for `null`).
- Empty string and whitespace-only are rejected after trim + refine.
- Length cap (256) is enforced; no silent truncation.
- Refine message is clear and actionable.

**Correctness risks:**

| Risk | Why it matters | Recommendation |
|------|----------------|----------------|
| **Trim mutates opaque tokens** | Cursors are server-issued opaque values. Trimming `"  token  "` → `"token"` can change meaning if the server ever issued a token with spaces, or if the token is padding-sensitive (e.g. base64). Client/server can desync. | **Do not trim.** Reject cursors that have leading/trailing whitespace via a refine, so tokens are never altered. |
| **Doc says “no coercion” but transform trims** | Trimming is a form of normalization; it can change the value. So behavior is not strictly “no coercion.” | Either document “we normalize by trimming” or remove trim and reject whitespace. |
| **`z.undefined()` in union** | If the key is missing, Zod gets `undefined`. If the key is present with value `undefined` (e.g. from JSON), same. So absence is well-defined. | No change; optional semantics are correct. |

**Hidden assumption:** Cursors are assumed to be space-insensitive. If they are ever derived from or compared with values that include spaces, trimming breaks that.

---

### 1.2 Optional vs required

- **Required:** `lat`, `lon`, `checkIn`, `checkOut` (no `.optional()`/`.default()` in schema).
- **Optional with defaults:** `radius`, `adults`, `children`, `pageSize` (`.default(...)`).
- **Optional, no default:** `cursor` (valid: absent or non-empty string). Correct: no cursor must not be turned into a synthetic token.

**Verdict:** Required vs optional semantics in the schema are clear. Cursor is correctly “optional, no default.”

---

## 2. Data flow integrity

### 2.1 Request → app → controller

**Flow:**

1. **`request.query`** (Fastify): All query params are **strings** (or string arrays). There is no route schema, so no Fastify coercion.
2. **app.ts** destructures and **casts** to `{ lat?: number, ..., cursor?: string }`. The cast is incorrect: at runtime values are strings (e.g. `"52.1"`), not numbers or dates.
3. **Pre-validation check:** `if (!lat \|\| !lon \|\| !checkIn \|\| !checkOut \|\| !adults) return 400`. This runs **before** Zod. So:
   - Invalid or missing values can trigger “Missing required” instead of “Invalid query parameters” (message inconsistency).
   - If a value is the string `"0"`, it is truthy, so the check passes. Only truly missing or empty string fail here.
4. **Defaults in app.ts:** `checkIn ?? new Date()`, `checkOut ?? ...`, `adults ?? 1`, etc. So **absence is replaced before Zod**. Zod then sees server-chosen defaults, not “missing.” This splits default logic between app and schema and can desync intent (e.g. client “no checkIn” vs server default).
5. **`search(queryParams)`** receives this mixed object; **Zod** then coerces (e.g. `z.coerce.number()` for lat/lon) and validates. Cursor is passed as-is (string or undefined from query).

**Where invalid cursor can go:**

- **Bypass:** No. All search requests go through `search()` → `SearchQuerySchema.safeParse()`. Cursor is part of the schema, so it cannot bypass validation.
- **Absence vs invalid:** Absent cursor → `undefined` → schema accepts. Invalid (e.g. empty string, number, object) → parse fails, `query.success === false`, controller returns error object. So “no cursor” and “invalid cursor” are handled differently; good.

**Risks:**

| Risk | Why it matters | Recommendation |
|------|----------------|----------------|
| **Two sources of truth for “required”** | app.ts manual check vs Zod. Different error messages and order of checks. | **Single gate:** Remove the manual required check in app; pass raw `request.query` (or a shallow copy) and let Zod be the only validator. Return one consistent 400 message from Zod errors. |
| **Defaults in app.ts** | checkIn/checkOut/adults defaults in app change the object before Zod. Zod’s own defaults (e.g. radius, pageSize) apply when field is undefined. So “missing” is handled in two places. | Prefer **defaults only in Zod**. In app, pass through `request.query` (or normalized query) without injecting defaults; let schema apply defaults so one place defines “missing” and “default.” |
| **Type cast in app** | `request.query as { lat?: number, ... }` is misleading and wrong at runtime. | Type as `Record<string, string \| string[] \| undefined>` or use a generic query type; let Zod do parsing/coercion. |

---

## 3. Default handling

- **Cursor:** No default; optional. Correct: we never auto-generate or mutate the token.
- **pageSize, radius, adults, children:** Defaults in schema only when value is undefined. They do not overwrite a provided cursor or change “first page” vs “next page” intent.
- **Risk:** app.ts uses `checkIn ?? new Date()` and `checkOut ?? ...`. So “no checkIn” becomes “today.” If the client omits them on purpose (e.g. “any dates”), that intent is lost. For cursor/pagination specifically, no default is applied to cursor; pagination intent is preserved.

**Recommendation:** Keep cursor without default. Move all other defaults into the schema and remove default injection in app so that “default” is defined in one place and does not change pagination meaning.

---

## 4. Error behavior

### 4.1 Validation failures

- **Controller:** On `!query.success`, returns `{ error: "Invalid query parameters: ...", status: 400 }`.
- **app.ts:** `reply.send(result)` — **does not set HTTP status from `result.status`.** So when validation fails, the response is **HTTP 200** with body `{ error: "...", status: 400 }`. Clients that only check status code will treat this as success.

**Critical bug:** Validation errors must return **HTTP 400**, not 200.

**Recommendation:** In app, after `const result = await search(...)`:

- If `result.status === 400` (or `'error' in result`), call `reply.status(400).send({ error: result.error })` (or equivalent).
- Otherwise send 200 with the success payload.

### 4.2 Error content

- Zod issues are aggregated into a single string with path and message (e.g. `cursor: cursor must be absent or ...`). That is explicit and actionable.
- No silent fallback: failed parse does not default to “no cursor” or any other value. Good.

**Consistency:** Once the route sets 400 for validation errors, error behavior will be consistent: invalid cursor (or any invalid input) → 400 + message; no silent recovery.

---

## 5. Edge cases & abuse resistance

| Scenario | Current behavior | Verdict / recommendation |
|----------|------------------|---------------------------|
| **Empty string `cursor=`** | Trim → `""`, refine fails (length > 0). | Correct. |
| **Whitespace only** | Trim → `""`, refine fails. | Correct. |
| **Oversized token (>256)** | Refine fails. | Correct; no truncation. |
| **`cursor=null` (literal string)** | Accepted as the string `"null"` (4 chars). | Acceptable for opaque token; document if needed. |
| **`cursor` number (e.g. from wrong client)** | In GET, query is string `"123"`. Union accepts string; trim → `"123"`, refine passes. | Accepted as valid token; fine for opacity. |
| **Array `cursor=a&cursor=b`** | May be `cursor: ['a','b']`. Union fails. | Rejected; good. |
| **Object / boolean** | Union fails. | Rejected; good. |
| **Null (e.g. JSON body)** | Union fails. | Rejected; good. |
| **Replay of old cursor** | Not validated here; must be enforced in search logic (e.g. expiry, binding to session/filters). | Out of scope for this schema; ensure search layer does not trust cursor without server-side checks. |
| **Malformed but short token** | Any non-empty string ≤256 chars is accepted. | By design for opaque cursors; validation is strict for type/length, not format. |

**Recommendation:** If you want to reject the literal string `"null"` to avoid confusion with JSON null, add a refine (e.g. `v !== 'null'`). Optional.

---

## 6. Architectural intent

- **Pagination state:** Cursor is “optional opaque token.” Schema enforces: either no cursor (first page) or a single non-empty string within length limit. So “first page” vs “next page” intent is preserved; we do not generate or alter the token.
- **Desync risk:** Trimming cursor can desync if the server ever issues or compares tokens that include spaces. Recommended: reject leading/trailing whitespace instead of trimming.
- **Split defaults and dual “required” check:** app.ts and Zod both define required/default behavior. That can desync client/server semantics (e.g. “required” vs “invalid”, default dates). Unify in Zod and use a single validation gate.

---

## 7. Summary of recommendations

### High priority

1. **Fix error status:** When controller returns `status: 400`, set `reply.status(400)` and send the error body so validation failures are 400, not 200.
2. **Stop trimming cursor:** Replace trim with a refine that rejects leading/trailing whitespace (or reject if `v !== v.trim()`), so cursor value is never mutated.
3. **Single validation gate:** Remove the manual “missing required” check in app; pass raw (or minimally normalized) query and let Zod be the only validator; use Zod error message for 400.

### Medium priority

4. **Defaults only in schema:** Remove default injection in app for checkIn, checkOut, adults, etc.; rely on Zod defaults so “missing” and “default” are defined in one place.
5. **Type request.query correctly:** Do not cast to `number`/`Date`; use a type that reflects strings (or query schema); let Zod coerce.

### Optional

6. **Explicitly reject `null` string:** If you want to treat the literal string `"null"` as invalid, add a refine.
7. **Export cursorSchema (and CURSOR_MAX_LENGTH)** if you need to reuse (e.g. in other endpoints or tests).

---

## 8. Defensive validation pattern (cursor)

Suggested pattern: **reject, don’t mutate.**

```ts
// Option A: Reject if cursor has leading/trailing whitespace (no trim)
const cursorSchema = z
  .union([z.string(), z.undefined()])
  .refine(
    (v) => {
      if (v === undefined) return true;
      const s = typeof v === 'string' ? v : '';
      return s.length > 0 && s.length <= CURSOR_MAX_LENGTH && s === s.trim();
    },
    { message: `cursor must be absent or a non-empty string of at most ${CURSOR_MAX_LENGTH} characters without leading/trailing whitespace` }
  );
```

This keeps cursor value unchanged and avoids any risk of altering an opaque token.
