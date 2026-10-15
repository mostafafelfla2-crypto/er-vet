import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Storage abstraction for uploaded Excel files.
 *
 * Two implementations are shipped:
 *
 *   1. `LocalExamFileStorage` — persists files to `public/uploads/excel` on the
 *      local filesystem. Used in local development where no Supabase
 *      credentials are configured.
 *
 *   2. `SupabaseExamFileStorage` — stores files in a *private* Supabase
 *      Storage bucket named `exams`. Authenticated via the service-role key so
 *      the operations bypass RLS (this module only ever runs server-side).
 *      Selected automatically when `SUPABASE_URL` and
 *      `SUPABASE_SERVICE_ROLE_KEY` are present, and is the required backend on
 *      Vercel because Vercel's production filesystem is read-only at runtime.
 *
 * The rest of the application (scanner, upload API, result API) talks to the
 * `ExamFileStorage` interface exclusively, so switching between the two
 * implementations requires no other code changes.
 */
export interface ExamFileStorage {
  /** Persist a file under the canonical name. Overwrites if it already exists. */
  save(fileName: string, data: ArrayBuffer | Buffer): Promise<void>;
  /** Read a file as a Buffer. Throws when the file does not exist. */
  read(fileName: string): Promise<Buffer>;
  /** List all stored file names (basename only, e.g. "results-Exam-MSF.xlsx"). */
  list(): Promise<string[]>;
  /** Delete a file. No-op when the file does not exist. */
  delete(fileName: string): Promise<void>;
  /** Whether the file exists. */
  exists(fileName: string): Promise<boolean>;
}

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/excel");

/** Supabase bucket name — must exist and be private in the Supabase dashboard. */
const SUPABASE_BUCKET = "exams";

/** MIME type for .xlsx files. */
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// ---------------------------------------------------------------------------
// Local filesystem implementation (development without Supabase credentials)
// ---------------------------------------------------------------------------

export class LocalExamFileStorage implements ExamFileStorage {
  private async ensureDir(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }

  async save(fileName: string, data: ArrayBuffer | Buffer): Promise<void> {
    await this.ensureDir();
    const target = path.join(UPLOAD_DIR, this.sanitize(fileName));
    await fs.writeFile(target, Buffer.from(data));
  }

  async read(fileName: string): Promise<Buffer> {
    const target = path.join(UPLOAD_DIR, this.sanitize(fileName));
    return fs.readFile(target);
  }

  async list(): Promise<string[]> {
    await this.ensureDir();
    const entries = await fs.readdir(UPLOAD_DIR);
    return entries.filter((entry) => /\.xlsx$/i.test(entry)).sort();
  }

  async delete(fileName: string): Promise<void> {
    const target = path.join(UPLOAD_DIR, this.sanitize(fileName));
    try {
      await fs.unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }

  async exists(fileName: string): Promise<boolean> {
    try {
      const target = path.join(UPLOAD_DIR, this.sanitize(fileName));
      await fs.access(target);
      return true;
    } catch {
      return false;
    }
  }

  /** Guard against path traversal — only the base name is used. */
  private sanitize(fileName: string): string {
    return path.basename(fileName);
  }
}

// ---------------------------------------------------------------------------
// Supabase Storage implementation (production)
// ---------------------------------------------------------------------------

/**
 * Supabase Storage-backed storage for a *private* bucket.
 *
 * Auth: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` environment variables.
 * The service-role key bypasses Row-Level-Security — this is safe because the
 * module only runs on the server (API routes), never in the browser.
 *
 * Bucket: `exams` — must be created in the Supabase dashboard and set to
 * "private" so files are not publicly accessible. All reads go through the
 * authenticated admin client (`download`), not public URLs.
 *
 * File naming: every file is stored with its canonical `results-{ExamName}-
 * {SECRET_CODE}.xlsx` pathname (no random suffix), so the scanner can match it
 * against the secret pattern and the DB row stays 1:1 with the object key.
 */
export class SupabaseExamFileStorage implements ExamFileStorage {
  private client: SupabaseClient | null = null;
  private readonly url: string;
  private readonly serviceKey: string;

  constructor() {
    this.url = (process.env.SUPABASE_URL ?? "").trim();
    this.serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

    if (!this.url || !this.serviceKey) {
      if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
        console.error(
          "[SupabaseExamFileStorage] SUPABASE_URL or " +
            "SUPABASE_SERVICE_ROLE_KEY is not set. Supabase Storage operations " +
            "will fail until the credentials are configured.",
        );
      }
    }
  }

  /**
   * Lazily create the admin client on first use. This avoids crashing at
   * module-load time when credentials are temporarily missing (e.g. a Vercel
   * deployment before the env vars are wired up) — instead the error surfaces
   * at the first storage operation with a clear message.
   */
  private getClient(): SupabaseClient {
    if (this.client) return this.client;
    if (!this.url || !this.serviceKey) {
      throw new Error(
        "[SupabaseExamFileStorage] SUPABASE_URL or " +
          "SUPABASE_SERVICE_ROLE_KEY is not configured. Set both in your " +
          "environment variables (Supabase dashboard → Project Settings → API).",
      );
    }
    // `auth: { persistSession: false }` is important — we are running on the
    // server and must not try to persist sessions to localStorage (which does
    // not exist in Node).
    this.client = createClient(this.url, this.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client;
  }

  async save(fileName: string, data: ArrayBuffer | Buffer): Promise<void> {
    const body = Buffer.isBuffer(data) ? data : Buffer.from(data);
    // `upsert: true` makes re-uploading an exam idempotent (same path
    // overwrites the existing object instead of erroring).
    const { error } = await this.getClient()
      .storage.from(SUPABASE_BUCKET)
      .upload(this.sanitize(fileName), body, {
        contentType: XLSX_CONTENT_TYPE,
        upsert: true,
        cacheControl: "3600",
      });
    if (error) {
      throw new Error(
        `SUPABASE_UPLOAD_FAILED:${fileName} — ${error.message}`,
      );
    }
  }

  async read(fileName: string): Promise<Buffer> {
    const pathName = this.sanitize(fileName);
    // `download` returns a thenable builder that resolves to
    // { data: Blob, error } | { data: null, error }.
    const { data, error } = await this.getClient()
      .storage.from(SUPABASE_BUCKET)
      .download(pathName);

    if (error || !data) {
      // Distinguish "not found" from other errors for clearer upstream
      // handling (the result API maps BLOB_NOT_FOUND to a friendly message).
      const code = (error as { statusCode?: number } | null)?.statusCode;
      if (code === 404 || /not.?found/i.test(error?.message ?? "")) {
        throw new Error(`BLOB_NOT_FOUND:${fileName}`);
      }
      throw new Error(
        `SUPABASE_READ_FAILED:${fileName} — ${error?.message ?? "unknown"}`,
      );
    }

    // The Blob's `.arrayBuffer()` is available in Node 18+ (undici). Convert
    // to a Node Buffer for the xlsx parser.
    const arrayBuffer = await (data as Blob).arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async list(): Promise<string[]> {
    // `list(prefix, options)` — we pass an empty prefix to list the bucket
    // root. Supabase paginates in pages of 100 by default; loop until
    // exhausted so the scanner sees every exam.
    const collected: string[] = [];
    let offset = 0;
    const limit = 100;
    // Guard against infinite loops if the API misbehaves.
    let safety = 0;
    while (safety++ < 100) {
      const { data, error } = await this.getClient()
        .storage.from(SUPABASE_BUCKET)
        .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });
      if (error) {
        throw new Error(
          `SUPABASE_LIST_FAILED — ${error.message}`,
        );
      }
      if (!data || data.length === 0) break;
      for (const file of data) {
        // Folder entries have null metadata; skip anything that isn't an
        // .xlsx file. `file.name` is the object key relative to the prefix.
        if (file.name && /\.xlsx$/i.test(file.name)) {
          collected.push(file.name);
        }
      }
      if (data.length < limit) break; // last page
      offset += limit;
    }
    return collected.sort();
  }

  async delete(fileName: string): Promise<void> {
    const { error } = await this.getClient()
      .storage.from(SUPABASE_BUCKET)
      .remove([this.sanitize(fileName)]);
    if (error) {
      const message = error.message ?? "";
      // `remove` is idempotent — a missing object is not an error worth
      // surfacing.
      if (!/not.?found|404/i.test(message)) {
        throw new Error(`SUPABASE_DELETE_FAILED:${fileName} — ${message}`);
      }
    }
  }

  async exists(fileName: string): Promise<boolean> {
    // Supabase has no dedicated `head`/`exists` method. The cheapest way to
    // check existence is `list` with a prefix filter — a single object name
    // as the prefix returns at most one entry.
    const pathName = this.sanitize(fileName);
    const { data, error } = await this.getClient()
      .storage.from(SUPABASE_BUCKET)
      .list(pathName, { limit: 1 });
    if (error) return false;
    // When listing with a full filename as the prefix, Supabase returns the
    // file itself (if it exists) or an empty array.
    return Array.isArray(data) && data.some((f) => f.name === pathName);
  }

  /** Guard against path traversal — only the base name is used. */
  private sanitize(fileName: string): string {
    return path.basename(fileName);
  }
}

// ---------------------------------------------------------------------------
// Singleton selection
// ---------------------------------------------------------------------------

function hasSupabaseCredentials(): boolean {
  return Boolean(
    process.env.SUPABASE_URL &&
      process.env.SUPABASE_URL.trim().length > 0 &&
      process.env.SUPABASE_SERVICE_ROLE_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY.trim().length > 0,
  );
}

/**
 * Select the storage backend.
 *
 * CRITICAL: on Vercel (production OR any preview deployment) the serverless
 * filesystem is READ-ONLY. The local filesystem backend MUST NOT be used there
 * — it crashes with `EROFS: read-only file system`. Therefore:
 *
 *   - When `NODE_ENV=production` OR the `VERCEL` env var is set, we ALWAYS
 *     return the Supabase backend. We do NOT fall back to local even if the
 *     Supabase credentials are missing — instead the Supabase client itself
 *     will raise a clear auth error, which is far easier to diagnose than the
 *     EROFS crash that a silent local fallback would produce.
 *
 *   - In local development (no `VERCEL`, `NODE_ENV !== "production"`) we use
 *     the filesystem by default for convenience, and switch to Supabase when
 *     credentials are present or `EXAM_STORAGE=supabase` is set (useful for
 *     testing against the real bucket).
 *
 * Detection signals:
 *   - `process.env.SUPABASE_URL` + `process.env.SUPABASE_SERVICE_ROLE_KEY`
 *   - `process.env.VERCEL` — set to `"1"` by Vercel for every deployment.
 *   - `process.env.NODE_ENV` — `"production"` on Vercel prod.
 */
function createStorage(): ExamFileStorage {
  const isProduction = process.env.NODE_ENV === "production";
  const isVercel = Boolean(process.env.VERCEL);
  const hasSupabase = hasSupabaseCredentials();
  // Explicit escape hatch: `EXAM_STORAGE=local` forces the filesystem backend
  // even in production (useful for self-hosted deployments with a writable
  // data volume). Everything else on Vercel MUST use Supabase because the
  // serverless filesystem is read-only.
  const forceLocal = process.env.EXAM_STORAGE === "local";

  if (!forceLocal && (isProduction || isVercel)) {
    if (!hasSupabase) {
      console.error(
        "[storage] Production/Vercel environment detected but " +
          "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set. " +
          "Refusing to fall back to the read-only local filesystem.",
      );
    }
    return new SupabaseExamFileStorage();
  }

  // --- Local development (or explicit local override) ----------------------
  if (!forceLocal && (process.env.EXAM_STORAGE === "supabase" || hasSupabase)) {
    return new SupabaseExamFileStorage();
  }
  return new LocalExamFileStorage();
}

/** Singleton storage instance used across the application. */
export const examFileStorage: ExamFileStorage = createStorage();

/** Whether the active storage backend is Supabase Storage. Exposed for diagnostics. */
export const isUsingSupabase = examFileStorage instanceof SupabaseExamFileStorage;
