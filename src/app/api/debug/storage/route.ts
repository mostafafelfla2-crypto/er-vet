import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { examFileStorage, isUsingSupabase } from "@/lib/exam/storage";
import { parseExcelBuffer } from "@/lib/exam/excel";
import { requireAdmin } from "@/lib/exam/auth";

/**
 * GET /api/debug/storage
 *
 * Admin-only diagnostic endpoint that tests the full storage + parse pipeline
 * and returns a structured report. Use this to pinpoint exactly where the
 * result-lookup pipeline fails in production:
 *
 *   1. Which storage backend is active (Supabase vs local)
 *   2. Whether `list()` works (and what files it returns)
 *   3. For each exam in the DB: whether the file can be read, parsed, and
 *      how many student rows are detected
 *   4. Any errors at each step, with full error messages
 *
 * The response is JSON — open it in the browser while logged in as admin.
 */
export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "unauthorized", detail: "Admin login required to run diagnostics." },
      { status: 401 },
    );
  }

  const report: {
    timestamp: string;
    storageBackend: string;
    isUsingSupabase: boolean;
    env: Record<string, string>;
    listResult: { ok: boolean; files: string[]; error?: string };
    exams: Array<{
      id: string;
      slug: string;
      examName: string;
      fileName: string;
      isActive: boolean;
      fileExists?: boolean;
      readResult?: { ok: boolean; size?: number; firstBytes?: string; error?: string };
      parseResult?: { ok: boolean; rowCount?: number; headers?: string[]; sampleEmails?: string[]; error?: string };
    }>;
  } = {
    timestamp: new Date().toISOString(),
    storageBackend: examFileStorage.constructor.name,
    isUsingSupabase,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "",
      VERCEL: process.env.VERCEL ?? "",
      SUPABASE_URL_SET: Boolean(process.env.SUPABASE_URL?.trim()).toString(),
      SUPABASE_KEY_SET: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      ).toString(),
      DATABASE_URL_SET: Boolean(process.env.DATABASE_URL?.trim()).toString(),
      EXAM_STORAGE: process.env.EXAM_STORAGE ?? "",
    },
    listResult: { ok: false, files: [] },
    exams: [],
  };

  // Step 1: Test list()
  try {
    const files = await examFileStorage.list();
    report.listResult = { ok: true, files };
  } catch (err) {
    report.listResult = {
      ok: false,
      files: [],
      error: (err as Error).message ?? String(err),
    };
  }

  // Step 2: For each exam in the DB, test read + parse
  const exams = await db.exam.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      slug: true,
      examName: true,
      fileName: true,
      isActive: true,
    },
  });

  for (const exam of exams) {
    const entry: (typeof report.exams)[number] = {
      id: exam.id,
      slug: exam.slug,
      examName: exam.examName,
      fileName: exam.fileName,
      isActive: exam.isActive,
    };

    // Check if the fileName appears in the list() output
    if (report.listResult.ok) {
      entry.fileExists = report.listResult.files.includes(exam.fileName);
    }

    // Test read
    try {
      const buf = await examFileStorage.read(exam.fileName);
      entry.readResult = {
        ok: true,
        size: buf.length,
        firstBytes: buf.slice(0, 8).toString("hex"),
      };

      // Test parse
      try {
        const parsed = parseExcelBuffer(buf);
        entry.parseResult = {
          ok: true,
          rowCount: parsed.count,
          headers: parsed.headers,
          sampleEmails: parsed.rows
            .slice(0, 5)
            .map((r) => r.email)
            .filter(Boolean),
        };
      } catch (parseErr) {
        entry.parseResult = {
          ok: false,
          error: (parseErr as Error).message ?? String(parseErr),
        };
      }
    } catch (readErr) {
      entry.readResult = {
        ok: false,
        error: (readErr as Error).message ?? String(readErr),
      };
    }

    report.exams.push(entry);
  }

  return NextResponse.json(report, {
    headers: { "cache-control": "no-store" },
  });
}
