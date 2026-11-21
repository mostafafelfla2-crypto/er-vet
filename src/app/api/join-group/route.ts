import { NextResponse } from "next/server";
import { getDeviceBinding, getExam } from "@/lib/exam/registry";
import { examFileStorage } from "@/lib/exam/storage";
import {
  findStudentByEmail,
  parseExcelBuffer,
  parseGrade,
} from "@/lib/exam/excel";
import { readDeviceFingerprint } from "@/lib/exam/fingerprint";

/**
 * GET /api/join-group?email=...&examId=...
 *
 * Server-side gateway for the successful-students group link.
 *
 * The group URL never leaves the server: /api/result only returns a boolean
 * eligibility flag, and this endpoint re-validates the request (exam active,
 * device binding, student found in the results file, score at or above the
 * success threshold) before issuing a 302 redirect to the configured URL.
 * Because the URL only exists in the redirect response, it cannot be read
 * from page data, React props, or DevTools network inspection of the result
 * lookup.
 *
 * Note: a student who actually follows the redirect will see the URL in the
 * address bar afterwards. That is unavoidable; the point of this endpoint is
 * that nobody can obtain the link without passing the same validation the
 * result lookup itself performs.
 */
export async function GET(request: Request) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const { searchParams } = new URL(request.url);
    const email = (searchParams.get("email") ?? "").trim();
    const examId = (searchParams.get("examId") ?? "").trim();

    console.log(`[GET /api/join-group ${requestId}] start — email="${email}" examId="${examId}"`);

    if (!email || !examId) {
      console.log(`[GET /api/join-group ${requestId}] 400 missing_fields`);
      return NextResponse.json(
        { error: "missing_fields", detail: "Both email and examId are required." },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[GET /api/join-group ${requestId}] 400 invalid_email`);
      return NextResponse.json(
        { error: "invalid_email", detail: `"${email}" is not a valid email.` },
        { status: 400 },
      );
    }

    // --- Step 1: Look up the exam -------------------------------------------
    const exam = await getExam(examId);
    if (!exam || !exam.isActive) {
      console.error(`[GET /api/join-group ${requestId}] 404 exam_not_found — examId="${examId}"`);
      return NextResponse.json(
        { error: "exam_not_found", detail: `No active exam with id/slug "${examId}".` },
        { status: 404 },
      );
    }
    if (!exam.successGroupUrl) {
      console.log(`[GET /api/join-group ${requestId}] 404 no_group — exam "${examId}" has no success group configured`);
      return NextResponse.json(
        { error: "no_group", detail: "This exam has no success group link." },
        { status: 404 },
      );
    }

    // --- Step 2: Device binding enforcement ---------------------------------
    // Unlike /api/result, this endpoint never CREATES a binding: joining the
    // group is only possible after a successful result view, which is what
    // binds the device. A missing or mismatched binding is denied.
    if (exam.deviceBindingEnabled) {
      const fingerprint = await readDeviceFingerprint();
      const boundFp = await getDeviceBinding(exam.id, email);
      if (!fingerprint || !boundFp || boundFp !== fingerprint) {
        console.log(`[GET /api/join-group ${requestId}] 403 device_blocked`);
        return NextResponse.json({ error: "device_blocked" }, { status: 403 });
      }
    }

    // --- Step 3: Re-verify the student's result -----------------------------
    let fileBuffer: Buffer;
    try {
      fileBuffer = await examFileStorage.read(exam.fileName);
    } catch (readError) {
      console.error(
        `[GET /api/join-group ${requestId}] storage.read failed for "${exam.fileName}":`,
        readError,
      );
      return NextResponse.json(
        { error: "server_error", detail: `Storage read failed: ${(readError as Error).message}` },
        { status: 500 },
      );
    }

    const parsed = parseExcelBuffer(fileBuffer);
    const student = findStudentByEmail(parsed, email);
    if (!student) {
      console.log(`[GET /api/join-group ${requestId}] 404 no_result — email "${email}"`);
      return NextResponse.json(
        { error: "no_result", detail: `Email "${email}" was not found in the results file.` },
        { status: 404 },
      );
    }

    // --- Step 4: Threshold check --------------------------------------------
    const grade = parseGrade(student.grade, exam.maxScore);
    if (grade.percent === null || grade.percent < exam.successThreshold) {
      console.log(
        `[GET /api/join-group ${requestId}] 403 not_eligible — percent=${grade.percent} threshold=${exam.successThreshold}`,
      );
      return NextResponse.json({ error: "not_eligible" }, { status: 403 });
    }

    console.log(`[GET /api/join-group ${requestId}] 302 redirect — percent=${grade.percent}`);
    return NextResponse.redirect(exam.successGroupUrl, 302);
  } catch (error) {
    console.error("[GET /api/join-group] uncaught error:", error);
    return NextResponse.json(
      { error: "server_error", detail: (error as Error).message ?? "unknown" },
      { status: 500 },
    );
  }
  }
