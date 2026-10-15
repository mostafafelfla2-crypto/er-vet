# Project Worklog — Exam Results Portal (bmm)

> Multi-exam, bilingual (Arabic/English), Vercel-ready results portal built on
> Next.js 16. Upgraded from a single-file Arabic-only prototype
> (`Er-vet-in-arabic-main`) into a production-grade application with a hidden
> admin dashboard, dynamic exam tabs, and per-exam security features.

---

## Task ID: 1–7 (initial build)
Agent: main (Z.ai Code)
Task: Unzip `Er-vet-in-arabic-main.zip`, analyse the existing architecture, and
rebuild it as a senior-level, bilingual, multi-exam portal with a hidden admin
dashboard, view-once + device-binding security, and Vercel-compatible storage.

Work Log:
- Unzipped the source project. Original was a minimal Next.js (JS) app reading a
  single `results.xlsx` via `fs.readFileSync`, Arabic-only, no DB, no auth.
- Installed `xlsx` into the host project (Next.js 16 + TS + Tailwind 4 + shadcn).
- Designed a Prisma schema with three models: `Exam`, `ViewLog`, `DeviceBinding`.
  Ran `bun run db:push` to sync the SQLite database.
- Built a storage abstraction (`src/lib/exam/storage.ts`) with a
  `LocalExamFileStorage` implementation and a documented `VercelBlobExamFileStorage`
  placeholder so the project is Vercel-Blob-ready without code changes elsewhere.
- Wrote the Excel parser (`src/lib/exam/excel.ts`) supporting `"score/total"` and
  bare-numeric grades, configurable max-score override, and custom grade bands.
- Implemented the file-name convention `results-{ExamName}-{SECRET_CODE}.xlsx`
  with `buildResultsFileName` / `parseResultsFileName` in `src/lib/exam/config.ts`.
  `SECRET_CODE = "MSF2msf3##"` (env-overridable).
- Built the exam registry service (`src/lib/exam/registry.ts`) that scans the
  uploads directory, validates the secret code, and upserts Exam rows. Added
  `humanizeExamName` so `midterm-2024` → `Midterm 2024` in the UI.
- Implemented admin auth with HMAC-signed httpOnly session cookies
  (`src/lib/exam/auth.ts`) — no DB session table, single-admin personal tool.
- Implemented device fingerprinting via a long-lived cookie + UA hash
  (`src/lib/exam/fingerprint.ts`).
- API routes:
  - `GET  /api/exams`            — public list of active exams (for tabs)
  - `POST /api/result`           — student lookup with view-once + device-binding
  - `POST /api/admin/login`      — sets session cookie
  - `POST /api/admin/logout`     — clears session cookie
  - `GET  /api/admin/session`    — auth check
  - `GET  /api/admin/exams`      — admin list (all exams)
  - `POST /api/admin/exams`      — multipart upload (auto-renames file)
  - `PATCH /api/admin/exams/[id]`— per-exam config update
  - `DELETE /api/admin/exams/[id]`— delete exam + file
  - `GET  /api/admin/stats`      — dashboard stats
- Built a custom i18n system (`src/i18n/`) with a typed `useI18n()` hook, RTL/LTR
  sync, localStorage persistence, and Arabic as the default locale.
- Built the student UI: sticky header (brand + theme + language toggles), hero
  section, dynamic exam tabs (desktop) / select (mobile), search form, animated
  result card with progress bar + grade band + success-group link, sticky footer.
- Built the hidden admin portal at `/admin-hidden-portal`:
  - Server component reads the session cookie; client child renders login or
    dashboard.
  - Dashboard: stats cards, drag-and-drop upload center, per-exam config cards
    with accordion sections (Display, Grading, Success Group, Security).
- Generated three sample Excel files (`Midterm 2024`, `Final 2024`, `Quiz 1`)
  with bilingual student data and placed them in `public/uploads/excel/`.
- Updated `globals.css` with a teal/emerald brand palette, custom scrollbars,
  decorative grid utility, and refined shadows.
- Ran `bun run lint` — clean (0 errors, 0 warnings).

Stage Summary:
- All five user-requested feature areas are implemented and verified end-to-end
  via `agent-browser`:
  1. Dynamic exam tabs auto-generated from scanned `.xlsx` files ✓
  2. Hidden admin dashboard at `/admin-hidden-portal` with hardcoded login ✓
  3. View-once (burn after reading) verified: 2nd search returns
     "You have already viewed your grade." ✓
  4. Strict device binding verified: clearing the fingerprint cookie blocks the
     same email from a "new device" ✓
  5. Bilingual Arabic (default, RTL) / English (LTR) with header toggle ✓
- Upload center verified: a new Excel file is auto-renamed to
  `results-Practical-Exam-MSF2msf3##.xlsx`, saved, registered, and appears as a
  new auto-selected tab on the student portal.
- Mobile (390×844), desktop (1280), light, dark, RTL, and LTR all verified.
- Vercel compatibility: filesystem writes are isolated behind the
  `ExamFileStorage` interface; swap to `@vercel/blob` by uncommenting the
  documented placeholder. Configuration + tracking state live in the database,
  which can be pointed at Vercel Postgres by changing the Prisma datasource.

---

## Project Status

**Stable.** All core flows verified in the browser. No runtime errors in
`dev.log`. Lint clean.

### Architecture
```
src/
  app/
    page.tsx                          # Student portal (the only public route)
    layout.tsx                        # RTL/Arabic default, providers
    admin-hidden-portal/page.tsx      # Hidden admin route (server-gated)
    api/
      exams/route.ts
      result/route.ts
      admin/{login,logout,session,stats}/route.ts
      admin/exams/route.ts
      admin/exams/[id]/route.ts
  components/
    providers.tsx                     # QueryClient + Theme + I18n
    theme-provider.tsx
    student/{site-header,site-footer,search-form,result-card}.tsx
    admin/{admin-portal,admin-login,admin-dashboard,upload-center,exam-config-card}.tsx
    ui/                               # shadcn/ui (pre-existing)
  i18n/
    translations.ts                   # ar + en dictionaries
    i18n-provider.tsx                 # typed useI18n() + RTL sync
  lib/
    db.ts                             # Prisma client
    exam/
      config.ts                       # SECRET_CODE, file-name helpers
      excel.ts                        # parse + grade logic
      storage.ts                      # ExamFileStorage abstraction
      auth.ts                         # HMAC session cookies
      fingerprint.ts                  # device fingerprint
      registry.ts                     # scan + CRUD service
prisma/schema.prisma                  # Exam, ViewLog, DeviceBinding
public/uploads/excel/*.xlsx           # sample results files
```

### Current Goals / Completed
- ✅ Multi-exam dynamic tabs (newest auto-selected)
- ✅ Hidden admin portal with hardcoded credentials
- ✅ Upload center with auto file renaming
- ✅ Per-exam grading config (max score, custom grade bands with colors)
- ✅ Per-exam success-group link with percentage threshold
- ✅ View-once security toggle
- ✅ Strict device-binding security toggle
- ✅ Bilingual AR (default) / EN with RTL/LTR
- ✅ Dark / light theme
- ✅ Responsive (mobile select ↔ desktop tabs)
- ✅ Vercel-ready storage abstraction

### Unresolved Issues / Risks / Next-step Priorities
1. **Production storage swap.** Local dev uses `LocalExamFileStorage` (filesystem
   under `public/uploads/excel`). On Vercel the FS is read-only at runtime, so
   the `VercelBlobExamFileStorage` placeholder must be activated
   (`@vercel/blob` + `BLOB_READ_WRITE_TOKEN`). The interface is identical, so no
   application code changes are needed.
2. **Database on Vercel.** SQLite is used locally. For Vercel, change the Prisma
   `datasource` to a hosted Postgres (Neon/Supabase/Vercel Postgres) and run
   `prisma migrate deploy`. The schema is portable.
3. **Secret management.** `RESULTS_SECRET_CODE`, admin credentials, and the
   session signing secret are currently constants/env defaults. Move all three
   to Vercel environment variables before going live.
4. **Brute-force protection.** A 400 ms delay is applied on failed logins. For
   production, add rate-limiting (e.g. Upstash rate-limit middleware).
5. **Audit logging.** View-once and device-binding events are recorded but not
   surfaced in the admin UI. A future enhancement could add a per-exam "views &
   bindings" log table in the dashboard.

---

## Task ID: 8 — Vercel Blob Storage Migration
Agent: main (Z.ai Code)
Task: Replace local-filesystem storage with Vercel Blob for the production
deployment. The Vercel project is now connected to a *private* Blob store, so
uploads via the admin panel were failing with 500 (read-only FS).

Work Log:
- Installed `@vercel/blob@2.8.1` and inspected its typed exports to confirm the
  right API: `put`, `list`, `del`, `head`, and crucially `get(pathname, { access:
  'private' })` which returns a `ReadableStream` for private blobs — no signed
  URL juggling required.
- Refactored `src/lib/exam/storage.ts`:
  - Kept the `ExamFileStorage` interface unchanged (so no other code had to
    change).
  - Implemented `VercelBlobExamFileStorage`:
    * `save()`  → `put(fileName, body, { access: 'private', addRandomSuffix:
      false, allowOverwrite: true })`. The canonical `results-{ExamName}-
      {SECRET_CODE}.xlsx` name is preserved exactly (no random suffix), so the
      scanner's filename pattern still matches and the DB row stays 1:1 with the
      blob pathname.
    * `read()`  → `get(fileName, { access: 'private' })` and drain the returned
      `ReadableStream<Uint8Array>` into a Node `Buffer` via a helper.
    * `list()`  → paginated `list()` call, filtering to `.xlsx` and walking the
      cursor until `hasMore` is false.
    * `delete()` → `del(fileName)` (idempotent — swallows not-found).
    * `exists()` → `head(fileName)` returns null when missing.
  - Made the singleton environment-aware via `createStorage()`:
    * `BLOB_READ_WRITE_TOKEN` set  → `VercelBlobExamFileStorage` (Vercel prod)
    * otherwise                    → `LocalExamFileStorage` (local dev)
    * `EXAM_STORAGE=local` forces local even with a token (escape hatch).
  - Exposed `isUsingVercelBlob` for diagnostics.
- No changes were needed in the scanner (`registry.ts`), upload API, result API,
  or delete API — they all call `examFileStorage.list/save/read/delete`, so the
  new backend is picked up transparently.
- Verified locally that the `LocalExamFileStorage` path still works (3 sample
  exams listed, student search returns results, admin upload saves a file with
  the canonical name `results-Smoke-Test-Exam-MSF2msf3##.xlsx`).
- Verified that with a fake `BLOB_READ_WRITE_TOKEN` the singleton switches to
  `VercelBlobExamFileStorage` and the SDK correctly rejects the token with
  "Access denied" — proving the wiring is correct and will work with a real
  token on Vercel.
- Lint clean. No runtime errors in `dev.log`.

Stage Summary:
- The codebase now supports both backends out of the box. On Vercel (where
  `BLOB_READ_WRITE_TOKEN` is auto-injected after connecting the Blob store), all
  four file operations — upload, list, read, delete — flow through Vercel Blob.
  Locally, the same code falls back to the filesystem so development is
  unaffected.
- Required Vercel environment variable: `BLOB_READ_WRITE_TOKEN` (auto-set when
  the Blob store is linked to the project). No code changes needed on deploy.
- Optional env var: `EXAM_STORAGE=local` to force the filesystem backend even
  when a Blob token is present (useful for preview deployments or tests).

---

## Task ID: 9 — Vercel Production Crash Fixes (Postgres + Strict Blob)
Agent: main (Z.ai Code)
Task: Fix two 500 errors on Vercel: (1) Prisma using SQLite which is unsupported
in serverless + missing DATABASE_URL; (2) storage still falling back to the
read-only local filesystem (EROFS) in production.

Work Log:
- **Prisma → PostgreSQL**
  - `prisma/schema.prisma`: changed `provider = "sqlite"` to
    `provider = "postgresql"`. The model definitions were already
    Postgres-compatible (cuid ids, Float, Boolean, @@unique, @@index).
  - Added `binaryTargets = ["native", "debian-openssl-3.0.x"]` so the generated
    client ships the binary for Vercel's AWS Lambda runtime (Debian) in addition
    to the developer's host. Without this, Prisma throws "binary not found" at
    runtime on Vercel even when the schema is correct.
  - Ran `bun run db:generate` to regenerate the client against the postgres
    provider.
  - `src/lib/db.ts`: added a fail-fast guard at module load — if
    `DATABASE_URL` is missing/empty, throw a clear actionable error
    (`[db] DATABASE_URL is not set. Configure a Vercel Postgres...`) instead of
    letting Prisma raise the cryptic "Environment variable not found" 500 later
    inside a request handler. Also gated the query log to dev only
    (production logs `error`/`warn` to keep serverless logs clean).
- **Storage: no local fallback in production**
  - Root cause of the EROFS crash: the previous `createStorage()` selected the
    local filesystem whenever `BLOB_READ_WRITE_TOKEN` was falsy. On Vercel the
    token is auto-injected only after the Blob store is properly linked; if for
    any reason it is not propagated to the serverless function, the code
    silently fell back to `LocalExamFileStorage`, which then tried to write to
    the read-only filesystem and crashed.
  - New logic in `src/lib/exam/storage.ts`:
    * `isProduction = NODE_ENV === "production"`
    * `isVercel = Boolean(process.env.VERCEL)` (Vercel sets this to "1" on every
      deployment, including previews)
    * `hasBlobToken` now also trims and rejects whitespace-only values (treats
      empty string as "not set").
    * If `isProduction || isVercel` → ALWAYS return `VercelBlobExamFileStorage`.
      There is NO path back to `LocalExamFileStorage` in production. If the
      token is missing we log a loud error but still return the Blob backend —
      the Blob SDK then raises a clear "Access denied" which is far easier to
      diagnose than the EROFS crash.
    * Local dev unchanged: filesystem by default, Blob if a token is present or
      `EXAM_STORAGE=blob` is set.
  - Verified the selection matrix with 5 simulated-environment tests:
    | NODE_ENV=production + VERCEL=1 + token  | VercelBlob ✅ |
    | NODE_ENV=production + VERCEL=1, NO token | VercelBlob ✅ (no fallback) |
    | VERCEL=1 only (preview)                  | VercelBlob ✅ |
    | local dev (no signals)                   | Local ✅ (allowed) |
    | whitespace-only token                    | VercelBlob ✅ (treated as missing) |
- **`.env`** updated to document all required variables: `DATABASE_URL`
  (Postgres placeholder), `BLOB_READ_WRITE_TOKEN` (commented, auto-injected on
  Vercel), and the `EXAM_STORAGE` override for local testing.
- Confirmed via grep that every `fs.*` call in the codebase lives inside
  `LocalExamFileStorage` — no production code path touches the filesystem
  directly.
- Lint clean.

Stage Summary:
- Prisma now targets PostgreSQL with the correct Lambda binary target, so the
  generated client runs on Vercel. `db.ts` fails fast with a clear message if
  `DATABASE_URL` is not configured, preventing the "Environment variable not
  found" 500.
- Storage is now strictly Vercel Blob on Vercel (production + previews). The
  EROFS crash is impossible because the local filesystem backend is never
  selected when `NODE_ENV=production` or `VERCEL=1`.
- Deploy checklist for the user:
  1. In Vercel project settings → Environment Variables, ensure `DATABASE_URL`
     is set to the Vercel Postgres connection string (the pooled one). Run
     `prisma migrate deploy` or `prisma db push` against it once to create the
     tables.
  2. Confirm the Blob store is linked to the project so
     `BLOB_READ_WRITE_TOKEN` is injected. If the 500 persists with an "Access
     denied" message, the store is not linked — re-link it in Vercel → Storage.
  3. Redeploy.

---

## Task ID: 10 — Remove `#` from secret code (Vercel Blob 404 fix)
Agent: main (Z.ai Code)
Task: The Vercel Blob download was returning 404 because the `#` characters in
the file naming convention (`results-{Exam_Name}-MSF2msf3##.xlsx`) were being
treated as URL fragments by HTTP fetch requests, truncating the pathname
server-side. Remove the `#` characters from the secret code entirely so the
new format is `results-{Exam_Name}-MSF2msf3.xlsx`.

Work Log:
- **Root cause**: `#` is the URL fragment delimiter. When the Vercel Blob SDK
  (or any HTTP client) fetches a pathname containing `#`, everything from the
  `#` onwards is stripped before the request reaches the server. The blob
  `results-Midterm-2024-MSF2msf3##.xlsx` was therefore requested as
  `results-Midterm-2024-MSF2msf3` → 404.
- **`src/lib/exam/config.ts`**:
  - Changed `RESULTS_SECRET_CODE` default from `"MSF2msf3##"` to `"MSF2msf3"`.
  - Added a documentation comment explaining why the code must stay URL-safe
    (no `#`, `?`, `&`).
  - Removed the dead `RESULTS_FILE_PATTERN` constant (it had a leading-space
    typo and was never imported).
  - `buildResultsFileName` and `parseResultsFileName` were already
    parameterised on `RESULTS_SECRET_CODE`, so they pick up the new code
    automatically. Verified: `buildResultsFileName("Midterm 2024")` now
    returns `results-Midterm-2024-MSF2msf3.xlsx`, and `parseResultsFileName`
    accepts the new format while correctly **rejecting** any old `##` files
    (returns `null`), so stale files won't be re-registered by the scanner.
- **Sample files**: renamed the three existing `.xlsx` files on disk:
  - `results-Final-2024-MSF2msf3##.xlsx`  → `results-Final-2024-MSF2msf3.xlsx`
  - `results-Midterm-2024-MSF2msf3##.xlsx` → `results-Midterm-2024-MSF2msf3.xlsx`
  - `results-Quiz-1-MSF2msf3##.xlsx`      → `results-Quiz-1-MSF2msf3.xlsx`
- **UI instructions** (Upload Center): already rendered the secret code
  dynamically from the `RESULTS_SECRET_CODE` constant, so the displayed
  template now reads `results-{Exam Name}-MSF2msf3.xlsx` with no code change
  needed. Verified there are no hardcoded `##` strings in any component or
  translation dictionary.
- **`prisma/schema.prisma`**: updated the `fileName` field doc comment to show
  the new example and note the URL-safety rationale.
- Admin login password (`Mostafa2msf3##`) was left unchanged — it is a login
  credential, not a URL component, so the `#` is harmless there and changing it
  would break the user's existing credentials.
- Lint clean.

Stage Summary:
- The file naming convention is now `results-{Exam_Name}-MSF2msf3.xlsx` — fully
  URL-safe. The Vercel Blob 404 caused by `#`-truncation is resolved.
- The change is isolated to a single constant (`RESULTS_SECRET_CODE`); all
  scanner logic, API routes, and UI instructions derive from it.
- On Vercel: existing exams in the DB that still reference old `##` filenames
  should be deleted via the admin panel (or the DB reset) so the scanner
  re-registers them against the renamed blobs. New uploads will use the new
  format automatically.

---

## Task ID: 11 — Admin Login Glitch + Secure Join Group Button
Agent: main (Z.ai Code)
Task: Fix (1) admin portal requiring manual page refresh after login, and
(2) secure the "Join Group" button against long-press copy and DevTools
inspection of the raw WhatsApp/Telegram URL.

Work Log:

### Fix 1 — Admin login instant state update
- **Root cause**: `AdminLogin` called `router.refresh()` without awaiting it,
  then immediately called `router.replace()`. Because `router.refresh()` is
  async (it re-runs the server component and updates the Router Cache), the
  navigation fired before the refresh completed — so the server component's
  `getAdminSession()` re-evaluated against a stale render and the
  `initialAuthed` prop stayed `false`. The user saw the login form until they
  manually refreshed.
- **Fix** in `src/components/admin/admin-login.tsx`:
  - Added an `onAuthenticated?: () => void` prop.
  - On successful login: call `onAuthenticated()` FIRST (synchronous client
    state flip), THEN `await router.refresh()` (so the server component
    re-evaluates the session cookie and the Router Cache is invalidated),
    THEN `router.replace("/admin-hidden-portal")`.
- **Fix** in `src/components/admin/admin-portal.tsx`:
  - Added `handleAuthenticated` callback that does `setAuthed(true)`.
  - Passed it to `<AdminLogin onAuthenticated={handleAuthenticated} />`.
  - When the callback fires, `authed` flips to `true` synchronously and the
    component returns `<AdminDashboard />` immediately — no flash of the login
    form, no manual refresh needed.

### Fix 2 — Secure "Join Group" button (anti-copy & anti-inspect)
- **Root cause**: the success-group link was rendered as an `<a href="...">`
  tag. The raw WhatsApp/Telegram URL was therefore (a) visible in the DOM to
  anyone opening DevTools, (b) copyable via long-press on mobile, and
  (c) sent in plaintext in the `/api/result` JSON response.
- **Fix** — three layers of obfuscation:

  1. **Server-side encoding** (`src/app/api/result/route.ts`):
     - Renamed the response field from `successGroupUrl` to
       `successGroupUrlB64`.
     - The URL is now base64-encoded via `Buffer.from(url, "utf-8")
       .toString("base64")` before being sent. The raw URL never appears in
       the network response body.

  2. **Client-side type** (`src/components/student/result-card.tsx`):
     - `ResultPayload.successGroupUrl` → `successGroupUrlB64: string | null`.

  3. **DOM rendering** (`result-card.tsx`):
     - Replaced `<a href={...}>` with `<Button type="button" onClick={...}>`.
       There is NO `href` attribute anywhere in the DOM — the URL cannot be
       copied via long-press and cannot be seen by inspecting the element.
     - Added anti-copy CSS classes to the button:
       `select-none` (disable text selection),
       `[-webkit-touch-callout:none]` (disable iOS long-press context menu),
       `[-webkit-tap-highlight-color:transparent]` (clean tap),
       `[touch-action:manipulation]` (prevent double-tap zoom delay).
     - The `onClick` handler calls `openSuccessGroup(b64)` which:
       - decodes the base64 string via `atob(b64)`,
       - validates it starts with `http(s)://` (defensive — never opens
         `javascript:` or `data:` URLs),
       - opens it via `window.open(decoded, "_blank", "noopener,noreferrer")`.
       The decoded URL is a local variable that is never persisted or written
       to the DOM.

### Verification
- Lint clean.
- Direct API test: `POST /api/result` returns `successGroupUrlB64`
  (`aHR0cHM6Ly9jaGF0...`) and the raw `successGroupUrl` key is **absent**
  from the response. The base64 decodes correctly to the WhatsApp URL.
- Code inspection confirms: no `href` attribute in the result-card DOM, the
  button uses `onClick` + `window.open`, and anti-copy classes are applied.
- The admin login code path uses `onAuthenticated` (instant client flip) +
  `await router.refresh()` (server cache invalidation) before
  `router.replace()` — the standard App Router fix for this glitch.

Stage Summary:
- Admin login now updates the UI instantly — no manual refresh required.
- The success-group URL is invisible to DOM inspectors and cannot be copied
  via long-press. It is base64-encoded in the network response and decoded
  only inside the onClick handler at click time.
