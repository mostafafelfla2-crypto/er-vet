import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Storage abstraction for uploaded Excel files.
 *
 * Two implementations are shipped:
 *
 *   1. `LocalExamFileStorage` — persists files to `public/uploads/excel` on the
 *      local filesystem. Used in development and any environment that does not
 *      provide a `BLOB_READ_WRITE_TOKEN`.
 *
 *   2. `VercelBlobExamFileStorage` — stores files in a (private) Vercel Blob
 *      store. Selected automatically when `BLOB_READ_WRITE_TOKEN` is present,
 *      which is the case after the Vercel project is connected to Blob Storage.
 *      This is the only Vercel-compatible option because Vercel's production
 *      filesystem is read-only at runtime.
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

// ---------------------------------------------------------------------------
// Local filesystem implementation (development / preview without Blob token)
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
// Vercel Blob implementation (production)
// ---------------------------------------------------------------------------

/**
 * Vercel Blob-backed storage for a *private* Blob store.
 *
 * Auth: the `BLOB_READ_WRITE_TOKEN` environment variable (auto-injected by
 * Vercel once the project is linked to a Blob store). All SDK calls accept an
 * explicit `token` option which we pass defensively, though the SDK also reads
 * the env var directly.
 *
 * File naming: every blob is stored with its canonical `results-{ExamName}-
 * {SECRET_CODE}.xlsx` pathname (no random suffix), so the scanner can match it
 * against the secret pattern and the DB row stays 1:1 with the blob pathname.
 *
 * Reading private blobs: the SDK's `get(pathname, { access: 'private' })`
 * returns a `ReadableStream` with the blob content — no signed URL juggling
 * needed. We drain the stream into a Buffer.
 */
export class VercelBlobExamFileStorage implements ExamFileStorage {
  private readonly token: string | undefined;

  constructor() {
    this.token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!this.token && process.env.NODE_ENV === "production") {
      // Surface the misconfiguration loudly — uploads/reads would otherwise
      // fail with cryptic 401s deep inside the SDK.
      console.warn(
        "[VercelBlobExamFileStorage] BLOB_READ_WRITE_TOKEN is not set. " +
          "Vercel Blob operations will fail until the store is connected.",
      );
    }
  }

  async save(fileName: string, data: ArrayBuffer | Buffer): Promise<void> {
    const { put } = await import("@vercel/blob");
    // `addRandomSuffix: false` keeps the canonical name so the scanner and the
    // DB row can reference the exact pathname. `allowOverwrite: true` makes
    // re-uploading an exam idempotent.
    await put(fileName, data, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      token: this.token,
    });
  }

  async read(fileName: string): Promise<Buffer> {
    const { get, head } = await import("@vercel/blob");

    // `get` returns the content stream for private blobs when `access` is set.
    const result = await get(fileName, {
      access: "private",
      token: this.token,
    });

    if (!result || result.statusCode !== 200 || !result.stream) {
      // Distinguish "missing" from "unreadable" for clearer errors upstream.
      const exists = await this.exists(fileName);
      if (!exists) {
        throw new Error(`BLOB_NOT_FOUND:${fileName}`);
      }
      throw new Error(
        `BLOB_READ_FAILED:${fileName} (status=${result?.statusCode ?? "n/a"})`,
      );
    }

    return streamToBuffer(result.stream);
  }

  async list(): Promise<string[]> {
    const { list } = await import("@vercel/blob");
    const collected: string[] = [];
    let cursor: string | undefined;
    // The list() API is paginated; loop until exhausted so the scanner sees
    // every exam even when the store grows past the default page size.
    do {
      const result = await list({
        token: this.token,
        ...(cursor ? { cursor } : {}),
      });
      for (const blob of result.blobs) {
        // `blob.pathname` is the base name (no leading slash) for blobs stored
        // at the root of the store.
        if (/\.xlsx$/i.test(blob.pathname)) {
          collected.push(blob.pathname);
        }
      }
      cursor = result.hasMore ? result.cursor : undefined;
    } while (cursor);

    return collected.sort();
  }

  async delete(fileName: string): Promise<void> {
    const { del } = await import("@vercel/blob");
    try {
      await del(fileName, { token: this.token });
    } catch (err) {
      // `del` is idempotent — a missing blob is not an error worth surfacing.
      const message = (err as Error).message ?? "";
      if (!/not_found|not found|404/i.test(message)) {
        throw err;
      }
    }
  }

  async exists(fileName: string): Promise<boolean> {
    const { head } = await import("@vercel/blob");
    try {
      const blob = await head(fileName, { token: this.token });
      return blob !== null;
    } catch {
      return false;
    }
  }
}

/** Drain a Web ReadableStream<Uint8Array> into a Node Buffer. */
async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  // Read loop: pull chunks until done, accumulating byte lengths so we can
  // allocate a single Buffer at the end (cheaper than repeated concat).
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      totalLength += value.byteLength;
    }
  }
  const out = Buffer.alloc(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Singleton selection
// ---------------------------------------------------------------------------

function createStorage(): ExamFileStorage {
  // Prefer Vercel Blob whenever the token is present (i.e. on Vercel after the
  // Blob store is connected, or locally if the dev exports the token).
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobExamFileStorage();
  }
  // Allow forcing the local implementation even if a token is present (handy
  // for tests / offline development).
  if (process.env.EXAM_STORAGE === "local") {
    return new LocalExamFileStorage();
  }
  return new LocalExamFileStorage();
}

/** Singleton storage instance used across the application. */
export const examFileStorage: ExamFileStorage = createStorage();

/** Whether the active storage backend is Vercel Blob. Exposed for diagnostics. */
export const isUsingVercelBlob = process.env.BLOB_READ_WRITE_TOKEN
  ? process.env.EXAM_STORAGE !== "local"
  : false;
