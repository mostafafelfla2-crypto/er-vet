import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/exam/auth";
import { db } from "@/lib/db";
import { getExam } from "@/lib/exam/registry";
import { examFileStorage } from "@/lib/exam/storage";
import { parseExcelBuffer } from "@/lib/exam/excel";

/**
 * POST /api/admin/exams/[id]/file
 *
 * Replace the Excel file for an existing exam WITHOUT creating a new exam or
 * touching any of its settings (grade bands, success group, active status,
 * tracking records, etc.).
 *
 * The new file is validated (must be a readable .xlsx with ≥1 student row),
 * then uploaded to Supabase Storage with `upsert: true` so it overwrites the
 * existing object at the same pathname. The `Exam.fileName` stays the same —
 * only the file content changes.
 *
 * Accepts multipart/form-data with a single field:
 *   - file: the new .xlsx file
 *
 * Response (200):
 *   { ok: true, exam: { id, fileName, studentCount } }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    const exam = await getExam(id);
    if (!exam) {
      return NextResponse.json(
        { error: "exam_not_found" },
        { status: 404 },
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "missing_file", detail: "No file field in the form data." },
        { status: 400 },
      );
    }

    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json(
        {
          error: "invalid_format",
          detail: "The file must be an .xlsx or .xls file.",
        },
        { status: 400 },
      );
    }

    const fileData = await file.arrayBuffer();

    // Validate the new file is actually a readable Excel with student rows
    // BEFORE overwriting the existing one. This prevents a bad upload from
    // destroying the working file.
    let studentCount = 0;
    try {
      const parsed = parseExcelBuffer(Buffer.from(fileData));
      studentCount = parsed.count;
      if (studentCount === 0) {
        return NextResponse.json(
          {
            error: "invalid_excel",
            detail: "The file contains no student data rows.",
          },
          { status: 400 },
        );
      }
    } catch {
      return NextResponse.json(
        {
          error: "invalid_excel",
          detail: "The file could not be parsed as a valid Excel workbook.",
        },
        { status: 400 },
      );
    }

    // Upload to storage with upsert so the existing object is overwritten at
    // the same pathname. The exam.fileName stays unchanged.
    try {
      await examFileStorage.save(exam.fileName, fileData);
    } catch (storageErr) {
      console.error(
        `[POST /api/admin/exams/[id]/file] storage.save failed for "${exam.fileName}":`,
        storageErr,
      );
      return NextResponse.json(
        {
          error: "upload_failed",
          detail: (storageErr as Error).message,
        },
        { status: 500 },
      );
    }

    // Touch the exam's `updatedAt` so the admin dashboard reflects the
    // change. No other fields are modified.
    await db.exam.update({
      where: { id: exam.id },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({
      ok: true,
      exam: {
        id: exam.id,
        fileName: exam.fileName,
        studentCount,
      },
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[POST /api/admin/exams/[id]/file] error:", error);
    return NextResponse.json(
      { error: "server_error", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
