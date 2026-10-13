import { promises as fs } from "node:fs";
import path from "node:path";
import * as xlsx from "xlsx";

/**
 * Storage abstraction for uploaded Excel files.
 *
 * In local development we persist files to the filesystem under
 * `public/uploads/excel`. On Vercel the filesystem is read-only at runtime, so
 * this interface is designed to be backed by Vercel Blob in production — see
 * the `VercelBlobFileStorage` placeholder at the bottom of this file.
 *
 * To switch to Vercel Blob, install `@vercel/blob`, set BLOB_READ_WRITE_TOKEN,
 * and replace the body of each method with the corresponding `put`/`del`/`head`
 * calls. The rest of the application does not need to change.
 */
export interface ExamFileStorage {
  /** Persist a file and return the canonical stored file name. */
  save(fileName: string, data: ArrayBuffer | Buffer): Promise<void>;
  /** Read a file as a Buffer. Throws when the file does not exist. */
  read(fileName: string): Promise<Buffer>;
  /** List all stored file names. */
  list(): Promise<string[]>;
  /** Delete a file. No-op when the file does not exist. */
  delete(fileName: string): Promise<void>;
  /** Whether the file exists. */
  exists(fileName: string): Promise<boolean>;
}

const UPLOAD_DIR = path.join(process.cwd(), "public/uploads/excel");

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

/**
 * Vercel Blob-backed storage placeholder.
 *
 * Uncomment and install `@vercel/blob` to use in production. The method
 * signatures are intentionally identical to `LocalExamFileStorage` so the rest
 * of the codebase is storage-agnostic.
 */
// export class VercelBlobExamFileStorage implements ExamFileStorage {
//   async save(fileName: string, data: ArrayBuffer | Buffer) {
//     await put(fileName, data, { access: "public", addRandomSuffix: false });
//   }
//   async read(fileName: string) {
//     const head = await head(`results-${fileName}`); // store pathname mapping
//     const res = await fetch(head.url);
//     return Buffer.from(await res.arrayBuffer());
//   }
//   ...
// }

/** Singleton storage instance for the application. */
export const examFileStorage: ExamFileStorage = new LocalExamFileStorage();

/**
 * Read an Excel file from storage and parse it into student rows.
 * Throws when the file is missing or unreadable.
 */
export async function readExamSheet(fileName: string) {
  const buffer = await examFileStorage.read(fileName);
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [] as Array<unknown[]>, headers: [] as string[] };
  }
  const sheet = workbook.Sheets[sheetName];
  const matrix = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  const headers =
    matrix.length > 0
      ? (matrix[0] as unknown[])
          .map((c) => (c == null ? "" : String(c).trim()))
          .filter(Boolean)
      : [];
  return { rows: matrix.slice(1), headers };
}
