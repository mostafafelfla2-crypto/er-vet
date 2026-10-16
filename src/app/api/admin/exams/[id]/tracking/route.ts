import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/exam/auth";
import { db } from "@/lib/db";
import { getExam } from "@/lib/exam/registry";

/**
 * Tracking management endpoints for a single exam.
 *
 *   GET    /api/admin/exams/[id]/tracking   — export all tracking records as JSON
 *   POST   /api/admin/exams/[id]/tracking   — bulk import (restore) tracking records
 *   DELETE /api/admin/exams/[id]/tracking   — reset (clear) all tracking for this exam
 *
 * "Tracking" = ViewLog rows (burn-after-read) + DeviceBinding rows (anti-sharing).
 */

// ---------------------------------------------------------------------------
// GET — Export
// ---------------------------------------------------------------------------

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;

    // Verify the exam exists (also runs a non-fatal scan).
    const exam = await getExam(id);
    if (!exam) {
      return NextResponse.json(
        { error: "exam_not_found" },
        { status: 404 },
      );
    }

    const [views, bindings] = await Promise.all([
      db.viewLog.findMany({
        where: { examId: exam.id },
        select: {
          email: true,
          fingerprint: true,
          viewedAt: true,
        },
        orderBy: { viewedAt: "asc" },
      }),
      db.deviceBinding.findMany({
        where: { examId: exam.id },
        select: {
          email: true,
          fingerprint: true,
          boundAt: true,
        },
        orderBy: { boundAt: "asc" },
      }),
    ]);

    // Structured export format — versioned so future imports stay compatible.
    const exportPayload = {
      format: "exam-portal-tracking",
      version: 1,
      exportedAt: new Date().toISOString(),
      exam: {
        id: exam.id,
        slug: exam.slug,
        examName: exam.examName,
        fileName: exam.fileName,
      },
      viewOnceEnabled: exam.viewOnceEnabled,
      deviceBindingEnabled: exam.deviceBindingEnabled,
      views: views.map((v) => ({
        email: v.email,
        fingerprint: v.fingerprint,
        viewedAt: v.viewedAt.toISOString(),
      })),
      bindings: bindings.map((b) => ({
        email: b.email,
        fingerprint: b.fingerprint,
        boundAt: b.boundAt.toISOString(),
      })),
      stats: {
        totalViews: views.length,
        totalBindings: bindings.length,
      },
    };

    return NextResponse.json(exportPayload, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[GET /api/admin/exams/[id]/tracking] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// POST — Import (bulk restore)
// ---------------------------------------------------------------------------

interface ImportPayload {
  views?: Array<{
    email: string;
    fingerprint?: string | null;
    viewedAt?: string;
  }>;
  bindings?: Array<{
    email: string;
    fingerprint: string;
    boundAt?: string;
  }>;
}

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

    const body = (await request.json()) as ImportPayload;
    const views = Array.isArray(body.views) ? body.views : [];
    const bindings = Array.isArray(body.bindings) ? body.bindings : [];

    // --- Validate the incoming records ------------------------------------
    const validViews: Array<{
      examId: string;
      email: string;
      fingerprint: string | null;
      viewedAt: Date;
    }> = [];
    for (const [index, raw] of views.entries()) {
      const email = (raw?.email ?? "").toString().trim().toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          {
            error: "invalid_record",
            detail: `views[${index}].email is not a valid email: "${email}"`,
          },
          { status: 400 },
        );
      }
      const viewedAt = raw.viewedAt ? new Date(raw.viewedAt) : new Date();
      if (Number.isNaN(viewedAt.getTime())) {
        return NextResponse.json(
          {
            error: "invalid_record",
            detail: `views[${index}].viewedAt is not a valid date`,
          },
          { status: 400 },
        );
      }
      validViews.push({
        examId: exam.id,
        email,
        fingerprint: raw.fingerprint ?? null,
        viewedAt,
      });
    }

    const validBindings: Array<{
      examId: string;
      email: string;
      fingerprint: string;
      boundAt: Date;
    }> = [];
    for (const [index, raw] of bindings.entries()) {
      const email = (raw?.email ?? "").toString().trim().toLowerCase();
      const fingerprint = (raw?.fingerprint ?? "").toString().trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json(
          {
            error: "invalid_record",
            detail: `bindings[${index}].email is not a valid email: "${email}"`,
          },
          { status: 400 },
        );
      }
      if (!fingerprint) {
        return NextResponse.json(
          {
            error: "invalid_record",
            detail: `bindings[${index}].fingerprint is required`,
          },
          { status: 400 },
        );
      }
      const boundAt = raw.boundAt ? new Date(raw.boundAt) : new Date();
      if (Number.isNaN(boundAt.getTime())) {
        return NextResponse.json(
          {
            error: "invalid_record",
            detail: `bindings[${index}].boundAt is not a valid date`,
          },
          { status: 400 },
        );
      }
      validBindings.push({ examId: exam.id, email, fingerprint, boundAt });
    }

    // --- Bulk insert using upserts (idempotent on the unique constraint) ---
    // The unique constraints are (examId, email) for both models, so importing
    // the same file twice is safe — the second import updates the existing
    // row instead of erroring.
    let insertedViews = 0;
    let updatedViews = 0;
    for (const record of validViews) {
      const existing = await db.viewLog.findUnique({
        where: {
          examId_email: { examId: record.examId, email: record.email },
        },
        select: { id: true },
      });
      if (existing) {
        await db.viewLog.update({
          where: { id: existing.id },
          data: {
            fingerprint: record.fingerprint,
            viewedAt: record.viewedAt,
          },
        });
        updatedViews++;
      } else {
        await db.viewLog.create({ data: record });
        insertedViews++;
      }
    }

    let insertedBindings = 0;
    let updatedBindings = 0;
    for (const record of validBindings) {
      const existing = await db.deviceBinding.findUnique({
        where: {
          examId_email: { examId: record.examId, email: record.email },
        },
        select: { id: true },
      });
      if (existing) {
        await db.deviceBinding.update({
          where: { id: existing.id },
          data: {
            fingerprint: record.fingerprint,
            boundAt: record.boundAt,
          },
        });
        updatedBindings++;
      } else {
        await db.deviceBinding.create({ data: record });
        insertedBindings++;
      }
    }

    return NextResponse.json({
      ok: true,
      imported: {
        views: { inserted: insertedViews, updated: updatedViews, total: validViews.length },
        bindings: { inserted: insertedBindings, updated: updatedBindings, total: validBindings.length },
      },
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[POST /api/admin/exams/[id]/tracking] error:", error);
    return NextResponse.json(
      { error: "server_error", detail: (error as Error).message },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// DELETE — Reset (clear all tracking for this exam)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: Request,
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

    // Delete all view logs and device bindings for this exam. Both models
    // have ON DELETE CASCADE on the exam relation, so deleting the exam would
    // also clear them — but we only want to clear the tracking, not the exam.
    const [deletedViews, deletedBindings] = await Promise.all([
      db.viewLog.deleteMany({ where: { examId: exam.id } }),
      db.deviceBinding.deleteMany({ where: { examId: exam.id } }),
    ]);

    return NextResponse.json({
      ok: true,
      deleted: {
        views: deletedViews.count,
        bindings: deletedBindings.count,
      },
    });
  } catch (error) {
    if ((error as Error).message === "unauthorized") {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401 },
      );
    }
    console.error("[DELETE /api/admin/exams/[id]/tracking] error:", error);
    return NextResponse.json(
      { error: "server_error", detail: (error as Error).message },
      { status: 500 },
    );
  }
}
