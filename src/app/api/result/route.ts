import { NextResponse } from "next/server";
import {
  bindEmailToDevice,
  getDeviceBinding,
  getExam,
  hasViewedExam,
  recordExamView,
} from "@/lib/exam/registry";
import { examFileStorage } from "@/lib/exam/storage";
import {
  findStudentByEmail,
  parseExcelBuffer,
  parseGrade,
  parseGradeBands,
  resolveGradeBand,
} from "@/lib/exam/excel";
import { getOrCreateDeviceFingerprint } from "@/lib/exam/fingerprint";

interface ResultRequestBody {
  email?: string;
  examId?: string;
}

/**
 * POST /api/result
 * Body: { email, examId }
 *
 * Looks up a student's result for a specific exam and enforces the optional
 * security features (view once, device binding) configured per exam.
 *
 * Response codes:
 *   200 — result returned
 *   400 — bad request (missing/invalid fields)
 *   404 — exam or student not found
 *   409 — blocked by view-once or device-binding policy
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResultRequestBody;
    const email = (body.email ?? "").trim();
    const examId = (body.examId ?? "").trim();

    if (!email || !examId) {
      return NextResponse.json(
        { error: "missing_fields" },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "invalid_email" },
        { status: 400 },
      );
    }

    const exam = await getExam(examId);
    if (!exam || !exam.isActive) {
      return NextResponse.json(
        { error: "exam_not_found" },
        { status: 404 },
      );
    }

    // Resolve the device fingerprint early (creates the cookie on first call).
    const fingerprint = await getOrCreateDeviceFingerprint();

    // --- Strict device binding enforcement -----------------------------------
    if (exam.deviceBindingEnabled) {
      const boundFp = await getDeviceBinding(exam.id, email);
      if (boundFp && boundFp !== fingerprint) {
        return NextResponse.json(
          { error: "device_blocked" },
          { status: 409 },
        );
      }
      if (!boundFp) {
        // First query on this device — bind it now.
        await bindEmailToDevice(exam.id, email, fingerprint);
      }
    }

    // --- View-once enforcement ----------------------------------------------
    // We check *before* returning the result so a second request never leaks
    // the grade. The view is recorded only on a successful lookup so that a
    // "not found" student does not burn a non-existent view.
    const alreadyViewed = await hasViewedExam(exam.id, email);
    if (alreadyViewed && exam.viewOnceEnabled) {
      return NextResponse.json(
        { error: "already_viewed" },
        { status: 409 },
      );
    }

    // --- Read the Excel file -------------------------------------------------
    let fileBuffer: Buffer;
    try {
      fileBuffer = await examFileStorage.read(exam.fileName);
    } catch {
      return NextResponse.json(
        { error: "no_data_file" },
        { status: 404 },
      );
    }

    const parsed = parseExcelBuffer(fileBuffer);
    const student = findStudentByEmail(parsed, email);

    if (!student) {
      return NextResponse.json(
        { error: "no_result" },
        { status: 404 },
      );
    }

    // --- Compute grade + band ------------------------------------------------
    const grade = parseGrade(student.grade, exam.maxScore);
    const customBands = parseGradeBands(exam.gradeBandsJson);
    const band = resolveGradeBand(grade.percent, customBands);

    // --- Success group link gating -------------------------------------------
    let successGroupUrl: string | null = null;
    if (
      exam.successGroupUrl &&
      grade.percent !== null &&
      grade.percent >= exam.successThreshold
    ) {
      successGroupUrl = exam.successGroupUrl;
    }

    // --- Record the view (only after a successful lookup) --------------------
    if (exam.viewOnceEnabled) {
      await recordExamView(exam.id, email, fingerprint);
    }

    return NextResponse.json({
      exam: {
        id: exam.id,
        displayNameAr: exam.displayNameAr,
        displayNameEn: exam.displayNameEn,
      },
      student: {
        name: student.name || "",
        email: student.email,
        grade: grade.text,
        score: grade.score,
        total: grade.total,
        percent: grade.percent,
      },
      band: band
        ? {
            ar: band.ar,
            en: band.en,
            color: band.color,
            min: band.min,
            max: band.max,
          }
        : null,
      successGroupUrl,
      viewOnceEnabled: exam.viewOnceEnabled,
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/result] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
