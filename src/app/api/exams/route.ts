import { NextResponse } from "next/server";
import { listExams } from "@/lib/exam/registry";

/**
 * GET /api/exams
 * Returns the list of active exams for the student UI tabs. Newest first.
 * Public endpoint — only active exams are exposed.
 */
export async function GET() {
  try {
    const exams = await listExams();
    return NextResponse.json({
      exams: exams
        .filter((exam) => exam.isActive)
        .map((exam) => ({
          id: exam.id,
          slug: exam.slug,
          displayNameAr: exam.displayNameAr,
          displayNameEn: exam.displayNameEn,
          createdAt: exam.createdAt,
        })),
    });
  } catch (error) {
    console.error("[GET /api/exams] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
