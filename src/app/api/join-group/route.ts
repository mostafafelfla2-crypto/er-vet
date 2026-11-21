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
 * The group URL never leaves the server during the result lookup: /api/result
 * only returns a boolean eligibility flag, and this endpoint re-validates the
 * request (exam active, device binding, student found in the results file,
 * score at or above the success threshold) before doing anything with the
 * configured URL.
 *
 * Instead of a plain 302 to the https://t.me/ invite (which can land on
 * Telegram's web page where the link is visible and copyable), this endpoint
 * returns a tiny interstitial page that first tries the native Telegram deep
 * link (tg://join?invite=... for invite links, tg://resolve?domain=... for
 * public usernames), so the phone opens the Telegram app directly on the
 * group. If the app does not open within a short timeout (desktop browser,
 * app not installed), the page falls back to the regular https://t.me/ URL.
 *
 * Both URLs only exist in this post-validation response. Nothing reachable
 * before validation (page data, React props, the result API response, the
 * client bundle) contains the link.
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

    // --- Step 5: Hand off to Telegram ---------------------------------------
    const deepLink = buildTelegramDeepLink(exam.successGroupUrl);
    console.log(
      `[GET /api/join-group ${requestId}] 200 handoff — percent=${grade.percent} deepLink=${deepLink ? "yes" : "no (https only)"}`,
    );
    return telegramHandoffResponse(exam.successGroupUrl, deepLink);
  } catch (error) {
    console.error("[GET /api/join-group] uncaught error:", error);
    return NextResponse.json(
      { error: "server_error", detail: (error as Error).message ?? "unknown" },
      { status: 500 },
    );
  }
}

/**
 * Build the native Telegram deep link for a t.me URL.
 *
 * Invite links (https://t.me/+HASH or https://t.me/joinchat/HASH) map to
 * tg://join?invite=HASH. Public groups (https://t.me/USERNAME) map to
 * tg://resolve?domain=USERNAME. Returns null when the URL is not a
 * recognizable t.me link, in which case the interstitial falls back to the
 * plain https URL immediately.
 */
function buildTelegramDeepLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "t.me" && parsed.hostname !== "www.t.me") {
      return null;
    }
    const path = parsed.pathname.replace(/^\/+/, "");
    const inviteMatch = path.match(/^(?:\+|joinchat\/)([A-Za-z0-9_-]+)\/?$/);
    if (inviteMatch) {
      return `tg://join?invite=${inviteMatch[1]}`;
    }
    const usernameMatch = path.match(/^([A-Za-z0-9_]{5,32})\/?$/);
    if (usernameMatch) {
      return `tg://resolve?domain=${usernameMatch[1]}`;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tiny interstitial page: try the native app first, fall back to the https
 * URL when the app does not take over. Reached only after full server-side
 * validation, and only ever in a top-level tab the user opened by pressing
 * the join button.
 */
function telegramHandoffResponse(httpsUrl: string, deepLink: string | null): NextResponse {
  const fallbackDelayMs = deepLink ? 1500 : 0;
  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex,nofollow" />
<title>جاري فتح تليجرام…</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh; margin: 0; align-items: center; justify-content: center; background: #f4f7fb; color: #1f2933; text-align: center; }
  .card { padding: 2rem; }
  a.btn { display: inline-block; margin-top: 1rem; padding: 0.75rem 1.5rem; border-radius: 0.75rem; background: #229ed9; color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <p>جاري فتح تليجرام…</p>
  <p>لو ما اتفتحش التطبيق تلقائي، <a class="btn" href="${httpsUrl}">اضغط هنا للانضمام</a></p>
</div>
<script>
  (function () {
    var deepLink = ${JSON.stringify(deepLink)};
    var httpsUrl = ${JSON.stringify(httpsUrl)};
    if (deepLink) {
      window.location.href = deepLink;
      // Only fall back to the https URL when the app did not take over
      // (when Telegram opens, this tab goes to the background).
      setTimeout(function () {
        if (!document.hidden) { window.location.href = httpsUrl; }
      }, ${fallbackDelayMs});
    } else {
      window.location.replace(httpsUrl);
    }
  })();
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
