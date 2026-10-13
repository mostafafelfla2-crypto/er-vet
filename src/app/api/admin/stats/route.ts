import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/exam/auth";
import { db } from "@/lib/db";

/** GET /api/admin/stats — dashboard summary statistics. */
export async function GET() {
  try {
    await requireAdmin();
    const [totalExams, activeExams, totalViews, totalBindings] =
      await Promise.all([
        db.exam.count(),
        db.exam.count({ where: { isActive: true } }),
        db.viewLog.count(),
        db.deviceBinding.count(),
      ]);
    return NextResponse.json({
      totalExams,
      activeExams,
      totalViews,
      totalBindings,
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[GET /api/admin/stats] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
