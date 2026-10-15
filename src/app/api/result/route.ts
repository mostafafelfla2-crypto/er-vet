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
 * Every step is logged with console.error/console.log so the full diagnostic
 * trail appears in Vercel function logs. The 404 responses include a `detail`
 * field with context so the issue is identifiable from the network tab alone.
 */
export async function POST(request: Request) {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const body = (await request.json()) as ResultRequestBody;
    const email = (body.email ?? "").trim();
    const examId = (body.examId ?? "").trim();

    console.log(`[POST /api/result ${requestId}] start — email="${email}" examId="${examId}"`);

    if (!email || !examId) {
      console.log(`[POST /api/result ${requestId}] 400 missing_fields`);
      return NextResponse.json(
        { error: "missing_fields", detail: "Both email and examId are required." },
        { status: 400 },
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log(`[POST /api/result ${requestId}] 400 invalid_email`);
      return NextResponse.json(
        { error: "invalid_email", detail: `"${email}" is not a valid email.` },
        { status: 400 },
      );
    }

    // --- Step 1: Look up the exam -------------------------------------------
    const exam = await getExam(examId);
    if (!exam) {
      console.error(
        `[POST /api/result ${requestId}] 404 exam_not_found — examId="${examId}" not in DB`,
      );
      return NextResponse.json(
        {
          error: "exam_not_found",
          detail: `No exam with id/slug "${examId}" exists in the database.`,
        },
        { status: 404 },
      );
    }
    if (!exam.isActive) {
      console.error(
        `[POST /api/result ${requestId}] 404 exam_inactive — examId="${examId}" isActive=false`,
      );
      return NextResponse.json(
        {
          error: "exam_not_found",
          detail: `Exam "${exam.displayNameEn}" is inactive.`,
        },
        { status: 404 },
      );
    }
    console.log(
      `[POST /api/result ${requestId}] exam found: id=${exam.id} fileName="${exam.fileName}"`,
    );

    // Resolve the device fingerprint early (creates the cookie on first call).
    const fingerprint = await getOrCreateDeviceFingerprint();

    // --- Step 2: Device binding enforcement ---------------------------------
    if (exam.deviceBindingEnabled) {
      const boundFp = await getDeviceBinding(exam.id, email);
      if (boundFp && boundFp !== fingerprint) {
        console.log(`[POST /api/result ${requestId}] 409 device_blocked`);
        return NextResponse.json(
          { error: "device_blocked" },
          { status: 409 },
        );
      }
      if (!boundFp) {
        await bindEmailToDevice(exam.id, email, fingerprint);
      }
    }

    // --- Step 3: View-once enforcement --------------------------------------
    const alreadyViewed = await hasViewedExam(exam.id, email);
    if (alreadyViewed && exam.viewOnceEnabled) {
      console.log(`[POST /api/result ${requestId}] 409 already_viewed`);
      return NextResponse.json(
        { error: "already_viewed" },
        { status: 409 },
      );
    }

    // --- Step 4: Read the Excel file from storage ---------------------------
    let fileBuffer: Buffer;
    try {
      console.log(
        `[POST /api/result ${requestId}] reading file "${exam.fileName}" from storage...`,
      );
      fileBuffer = await examFileStorage.read(exam.fileName);
      console.log(
        `[POST /api/result ${requestId}] file read OK — size=${fileBuffer.length} bytes, firstBytes=${fileBuffer.slice(0, 8).toString("hex")}`,
      );
    } catch (readError) {
      console.error(
        `[POST /api/result ${requestId}] storage.read failed for "${exam.fileName}":`,
        readError,
      );
      const errMsg = (readError as Error).message ?? "";
      const isMissing =
        /BLOB_NOT_FOUND/i.test(errMsg) ||
        /ENOENT/.test(errMsg) ||
        /not.?found/i.test(errMsg);
      return NextResponse.json(
        {
          error: isMissing ? "no_data_file" : "server_error",
          detail: `Storage read failed: ${errMsg}`,
          fileName: exam.fileName,
        },
        { status: isMissing ? 404 : 500 },
      );
    }

    // --- Step 5: Parse the Excel buffer -------------------------------------
    let parsed;
    try {
      parsed = parseExcelBuffer(fileBuffer);
      console.log(
        `[POST /api/result ${requestId}] parsed OK — ${parsed.count} student rows, headers=[${parsed.headers.join(", ")}]`,
      );
    } catch (parseError) {
      console.error(
        `[POST /api/result ${requestId}] xlsx parse failed for "${exam.fileName}" (size=${fileBuffer.length}):`,
        parseError,
      );
      return NextResponse.json(
        {
          error: "server_error",
          detail: `Excel parse failed: ${(parseError as Error).message}`,
          fileName: exam.fileName,
        },
        { status: 500 },
      );
    }

    if (parsed.count === 0) {
      console.error(
        `[POST /api/result ${requestId}] 404 no_result — parsed.count=0 (file is empty or has no data rows)`,
      );
      return NextResponse.json(
        {
          error: "no_result",
          detail: "The Excel file contains no student data rows.",
          fileName: exam.fileName,
          rowsParsed: 0,
        },
        { status: 404 },
      );
    }

    // --- Step 6: Find the student by email ----------------------------------
    const student = findStudentByEmail(parsed, email);
    if (!student) {
      // Log the first few emails in the file so the admin can verify the
      // email actually exists (and the column detection picked the right one).
      const sampleEmails = parsed.rows
        .slice(0, 5)
        .map((r) => r.email)
        .filter(Boolean);
      console.error(
        `[POST /api/result ${requestId}] 404 no_result — email "${email}" not found in ${parsed.count} rows. Sample emails: [${sampleEmails.join(", ")}]`,
      );
      return NextResponse.json(
        {
          error: "no_result",
          detail: `Email "${email}" was not found in the results file.`,
          fileName: exam.fileName,
          rowsParsed: parsed.count,
          sampleEmails,
        },
        { status: 404 },
      );
    }
    console.log(
      `[POST /api/result ${requestId}] student found: name="${student.name}" grade="${student.grade}"`,
    );

    // --- Step 7: Compute grade + band ---------------------------------------
    const grade = parseGrade(student.grade, exam.maxScore);
    const customBands = parseGradeBands(exam.gradeBandsJson);
    const band = resolveGradeBand(grade.percent, customBands);

    // --- Step 8: Success group link gating ----------------------------------
    let successGroupUrlB64: string | null = null;
    if (
      exam.successGroupUrl &&
      grade.percent !== null &&
      grade.percent >= exam.successThreshold
    ) {
      successGroupUrlB64 = Buffer.from(
        exam.successGroupUrl,
        "utf-8",
      ).toString("base64");
    }

    // --- Step 9: Record the view (only after a successful lookup) -----------
    if (exam.viewOnceEnabled) {
      await recordExamView(exam.id, email, fingerprint);
    }

    console.log(`[POST /api/result ${requestId}] 200 OK — percent=${grade.percent}`);

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
      successGroupUrlB64,
      viewOnceEnabled: exam.viewOnceEnabled,
      issuedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[POST /api/result] uncaught error:", error);
    return NextResponse.json(
      {
        error: "server_error",
        detail: (error as Error).message ?? "unknown",
      },
      { status: 500 },
    );
  }
}
