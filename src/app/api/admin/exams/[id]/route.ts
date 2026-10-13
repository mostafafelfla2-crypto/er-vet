import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/exam/auth";
import { deleteExam, updateExamConfig } from "@/lib/exam/registry";
import { parseGradeBands } from "@/lib/exam/excel";

interface PatchBody {
  displayNameAr?: string;
  displayNameEn?: string;
  maxScore?: number | null;
  gradeBands?: Array<{
    min: number;
    max: number;
    ar: string;
    en: string;
    color: string;
  }> | null;
  successGroupUrl?: string | null;
  successThreshold?: number;
  viewOnceEnabled?: boolean;
  deviceBindingEnabled?: boolean;
  isActive?: boolean;
}

/**
 * PATCH /api/admin/exams/[id] — update per-exam configuration.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    const body = (await request.json()) as PatchBody;

    const patch: Parameters<typeof updateExamConfig>[1] = {};

    if (typeof body.displayNameAr === "string") {
      patch.displayNameAr = body.displayNameAr.trim();
    }
    if (typeof body.displayNameEn === "string") {
      patch.displayNameEn = body.displayNameEn.trim();
    }
    if (body.maxScore === null || typeof body.maxScore === "number") {
      patch.maxScore = body.maxScore;
    }
    if (body.gradeBands !== undefined) {
      if (body.gradeBands === null || body.gradeBands.length === 0) {
        patch.gradeBandsJson = null;
      } else {
        // Validate before persisting.
        const validated = body.gradeBands
          .filter(
            (b) =>
              typeof b.min === "number" &&
              typeof b.max === "number" &&
              typeof b.ar === "string" &&
              typeof b.en === "string" &&
              typeof b.color === "string",
          )
          .sort((a, b) => a.min - b.min);
        if (validated.length > 0) {
          patch.gradeBandsJson = JSON.stringify(validated);
          // Round-trip check.
          const reparsed = parseGradeBands(patch.gradeBandsJson);
          if (!reparsed) {
            return NextResponse.json(
              { error: "invalid_grade_bands" },
              { status: 400 },
            );
          }
        }
      }
    }
    if (body.successGroupUrl === null || typeof body.successGroupUrl === "string") {
      const url = body.successGroupUrl?.trim() ?? "";
      if (url && !/^https?:\/\//i.test(url)) {
        return NextResponse.json(
          { error: "invalid_url" },
          { status: 400 },
        );
      }
      patch.successGroupUrl = url || null;
    }
    if (typeof body.successThreshold === "number") {
      if (body.successThreshold < 0 || body.successThreshold > 100) {
        return NextResponse.json(
          { error: "invalid_threshold" },
          { status: 400 },
        );
      }
      patch.successThreshold = body.successThreshold;
    }
    if (typeof body.viewOnceEnabled === "boolean") {
      patch.viewOnceEnabled = body.viewOnceEnabled;
    }
    if (typeof body.deviceBindingEnabled === "boolean") {
      patch.deviceBindingEnabled = body.deviceBindingEnabled;
    }
    if (typeof body.isActive === "boolean") {
      patch.isActive = body.isActive;
    }

    const exam = await updateExamConfig(id, patch);
    return NextResponse.json({ ok: true, exam });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[PATCH /api/admin/exams/[id]] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/admin/exams/[id] — delete an exam and its file.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    await deleteExam(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[DELETE /api/admin/exams/[id]] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
