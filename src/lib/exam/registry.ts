import { db } from "@/lib/db";
import {
  buildResultsFileName,
  parseResultsFileName,
  slugifyExamName,
} from "@/lib/exam/config";
import { examFileStorage } from "@/lib/exam/storage";
import { parseExcelBuffer } from "@/lib/exam/excel";

/**
 * Exam registry service.
 *
 * Bridges the filesystem (Excel files) and the database (exam metadata +
 * per-exam configuration). The scanner walks the uploads directory, parses
 * each file name, and upserts a corresponding Exam row. This is what powers
 * the dynamic "one tab per exam" UI.
 */

export interface ExamSummary {
  id: string;
  slug: string;
  examName: string;
  fileName: string;
  displayNameAr: string;
  displayNameEn: string;
  maxScore: number | null;
  gradeBandsJson: string | null;
  successGroupUrl: string | null;
  successThreshold: number;
  viewOnceEnabled: boolean;
  deviceBindingEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function toSummary(exam: {
  id: string;
  slug: string;
  examName: string;
  fileName: string;
  displayNameAr: string;
  displayNameEn: string;
  maxScore: number | null;
  gradeBandsJson: string | null;
  successGroupUrl: string | null;
  successThreshold: number;
  viewOnceEnabled: boolean;
  deviceBindingEnabled: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): ExamSummary {
  return { ...exam };
}

/**
 * Convert a raw exam-name segment (extracted from the file name, where spaces
 * were replaced by dashes) into a human-readable display name.
 * "midterm-2024" -> "Midterm 2024"
 * "quiz-1"       -> "Quiz 1"
 */
export function humanizeExamName(raw: string): string {
  return raw
    .split("-")
    .filter(Boolean)
    .map((part) => {
      // Keep years / numbers as-is.
      if (/^\d+$/.test(part)) return part;
      // Title-case alphabetic segments.
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ")
    .trim();
}

/**
 * Scan the uploads directory for valid `results-*.xlsx` files and reconcile
 * the database. New files create new Exam rows. Files that no longer exist on
 * disk are left in the DB (the admin can delete them explicitly) — but their
 * data is reported as missing at query time.
 *
 * Returns the number of newly registered exams.
 */
export async function scanAndRegisterExams(): Promise<number> {
  const fileNames = await examFileStorage.list();
  let created = 0;

  for (const fileName of fileNames) {
    const parsed = parseResultsFileName(fileName);
    if (!parsed) continue; // skip files that don't match the secret pattern

    const existing = await db.exam.findUnique({
      where: { fileName },
      select: { id: true },
    });
    if (existing) continue;

    const slug = slugifyExamName(parsed.examName);
    // Guarantee slug uniqueness by appending a short suffix on collision.
    let uniqueSlug = slug;
    let suffix = 1;
    while (
      await db.exam.findUnique({ where: { slug: uniqueSlug }, select: { id: true } })
    ) {
      uniqueSlug = `${slug}-${suffix++}`;
    }

    const displayName = humanizeExamName(parsed.examName);
    await db.exam.create({
      data: {
        slug: uniqueSlug,
        examName: displayName,
        fileName,
        displayNameAr: displayName,
        displayNameEn: displayName,
      },
    });
    created += 1;
  }

  return created;
}

/**
 * Best-effort scan that never throws. If the storage backend is temporarily
 * unreachable (e.g. Supabase rate limit, network blip), we log the error and
 * continue — exams already in the DB remain queryable. This is critical
 * because `getExam` and `listExams` both call this before touching the DB;
 * a scanner failure must NOT block result lookups for existing exams.
 */
async function safeScanAndRegister(): Promise<void> {
  try {
    await scanAndRegisterExams();
  } catch (err) {
    console.error(
      "[registry] scanAndRegisterExams failed (non-fatal, continuing with DB data):",
      err,
    );
  }
}

/** List all exams, newest first. Runs a scan first so the UI stays in sync. */
export async function listExams(): Promise<ExamSummary[]> {
  await safeScanAndRegister();
  const exams = await db.exam.findMany({
    orderBy: { createdAt: "desc" },
  });
  return exams.map(toSummary);
}

/** Fetch a single exam by id or slug. */
export async function getExam(
  identifier: string,
): Promise<ExamSummary | null> {
  await safeScanAndRegister();
  const exam = await db.exam.findFirst({
    where: {
      OR: [{ id: identifier }, { slug: identifier }],
    },
  });
  return exam ? toSummary(exam) : null;
}

export interface RegisterExamInput {
  examName: string;
  displayNameAr?: string;
  displayNameEn?: string;
  fileData: ArrayBuffer | Buffer;
}

/**
 * Register a brand new exam from an uploaded Excel buffer.
 * The file is saved with the canonical name and a DB row is created.
 */
export async function registerExamFromUpload(
  input: RegisterExamInput,
): Promise<ExamSummary> {
  // Validate the buffer is actually a readable Excel file.
  const parsed = parseExcelBuffer(Buffer.from(input.fileData));
  if (parsed.count === 0) {
    throw new Error("invalid-excel");
  }

  const fileName = buildResultsFileName(input.examName);
  await examFileStorage.save(fileName, input.fileData);

  const slug = slugifyExamName(input.examName);
  let uniqueSlug = slug;
  let suffix = 1;
  while (
    await db.exam.findUnique({ where: { slug: uniqueSlug }, select: { id: true } })
  ) {
    uniqueSlug = `${slug}-${suffix++}`;
  }

  const exam = await db.exam.create({
    data: {
      slug: uniqueSlug,
      examName: input.examName.trim(),
      fileName,
      displayNameAr: (input.displayNameAr ?? humanizeExamName(input.examName)).trim(),
      displayNameEn: (input.displayNameEn ?? humanizeExamName(input.examName)).trim(),
    },
  });

  return toSummary(exam);
}

/** Update editable per-exam configuration. */
export async function updateExamConfig(
  id: string,
  patch: {
    displayNameAr?: string;
    displayNameEn?: string;
    maxScore?: number | null;
    gradeBandsJson?: string | null;
    successGroupUrl?: string | null;
    successThreshold?: number;
    viewOnceEnabled?: boolean;
    deviceBindingEnabled?: boolean;
    isActive?: boolean;
  },
): Promise<ExamSummary> {
  const exam = await db.exam.update({
    where: { id },
    data: patch,
  });
  return toSummary(exam);
}

/** Delete an exam and its associated file and tracking rows. */
export async function deleteExam(id: string): Promise<void> {
  const exam = await db.exam.findUnique({ where: { id }, select: { fileName: true } });
  if (!exam) return;
  await db.exam.delete({ where: { id } });
  await examFileStorage.delete(exam.fileName);
}

/** Mark an email as having viewed an exam (idempotent). */
export async function recordExamView(
  examId: string,
  email: string,
  fingerprint: string | null,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  await db.viewLog.upsert({
    where: {
      examId_email: { examId, email: normalized },
    },
    create: { examId, email: normalized, fingerprint },
    update: {}, // no-op if already viewed
  });
}

export async function hasViewedExam(
  examId: string,
  email: string,
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  const view = await db.viewLog.findUnique({
    where: { examId_email: { examId, email: normalized } },
    select: { id: true },
  });
  return view !== null;
}

/** Bind an email to a device fingerprint for a given exam. */
export async function bindEmailToDevice(
  examId: string,
  email: string,
  fingerprint: string,
): Promise<{ bound: boolean; fingerprint: string }> {
  const normalized = email.trim().toLowerCase();
  const existing = await db.deviceBinding.findUnique({
    where: { examId_email: { examId, email: normalized } },
  });
  if (existing) {
    // Already bound — return the stored fingerprint for comparison.
    return { bound: true, fingerprint: existing.fingerprint };
  }
  await db.deviceBinding.create({
    data: { examId, email: normalized, fingerprint },
  });
  return { bound: true, fingerprint };
}

export async function getDeviceBinding(
  examId: string,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  const binding = await db.deviceBinding.findUnique({
    where: { examId_email: { examId, email: normalized } },
    select: { fingerprint: true },
  });
  return binding?.fingerprint ?? null;
}
