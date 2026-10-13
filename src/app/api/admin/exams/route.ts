import { NextResponse } from "next/server";
import {
  listExams,
  registerExamFromUpload,
} from "@/lib/exam/registry";
import { requireAdmin } from "@/lib/exam/auth";

/**
 * GET /api/admin/exams — list ALL exams (including inactive) for the dashboard.
 */
export async function GET() {
  try {
    await requireAdmin();
    const exams = await listExams();
    return NextResponse.json({ exams });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[GET /api/admin/exams] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/exams — upload a new exam.
 * Accepts `multipart/form-data` with fields:
 *   - file:        the .xlsx file
 *   - examName:    human readable exam name
 *   - displayNameAr (optional)
 *   - displayNameEn (optional)
 */
export async function POST(request: Request) {
  try {
    await requireAdmin();

    const formData = await request.formData();
    const file = formData.get("file");
    const examName = (formData.get("examName") as string | null)?.trim() ?? "";
    const displayNameAr = (formData.get("displayNameAr") as string | null)?.trim() || undefined;
    const displayNameEn = (formData.get("displayNameEn") as string | null)?.trim() || undefined;

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "missing_file" },
        { status: 400 },
      );
    }
    if (!examName) {
      return NextResponse.json(
        { error: "missing_exam_name" },
        { status: 400 },
      );
    }
    if (!/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json(
        { error: "invalid_format" },
        { status: 400 },
      );
    }

    const fileData = await file.arrayBuffer();
    let exam;
    try {
      exam = await registerExamFromUpload({
        examName,
        displayNameAr,
        displayNameEn,
        fileData,
      });
    } catch (err) {
      if ((err as Error).message === "invalid-excel") {
        return NextResponse.json(
          {
            error: "invalid_excel",
            // Surfaced to the admin UI as a more actionable message.
            detail:
              "no_student_rows — ensure the sheet has at least one row with a name, an email-shaped value, and a grade.",
          },
          { status: 400 },
        );
      }
      throw err;
    }

    return NextResponse.json({ ok: true, exam }, { status: 201 });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[POST /api/admin/exams] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
