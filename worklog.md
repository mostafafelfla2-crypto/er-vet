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
