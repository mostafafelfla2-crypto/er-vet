/**
 * Centralised configuration constants for the exam portal.
 *
 * The SECRET_CODE is a static verification string embedded in every uploaded
 * results file name. Any `.xlsx` file placed in the uploads directory must
 * match the pattern `results-{ExamName}-{SECRET_CODE}.xlsx` to be detected as
 * a valid exam by the scanner.
 *
 * In production this should be moved to an environment variable.
 */
export const RESULTS_SECRET_CODE =
  process.env.RESULTS_SECRET_CODE ?? "MSF2msf3##";

/** Admin credentials (hardcoded as requested for this personal tool). */
export const ADMIN_EMAIL = "mostafafelfla@mostafa.com";
export const ADMIN_PASSWORD = "Mostafa2msf3##";

/** Cookie names. */
export const ADMIN_SESSION_COOKIE = "exam-portal-admin-session";
export const DEVICE_FINGERPRINT_COOKIE = "exam-portal-device-fp";

/** Session lifetime in seconds (8 hours). */
export const ADMIN_SESSION_TTL = 60 * 60 * 8;

/** Directory (relative to project root) where Excel files are stored. */
export const EXCEL_UPLOAD_DIR = "public/uploads/excel";

/** Public URL prefix that maps to the uploads directory. */
export const EXCEL_PUBLIC_PREFIX = "/uploads/excel";

/** A simple HMAC-style signing secret. In production use a real env var. */
export const SESSION_SIGNING_SECRET =
  process.env.SESSION_SIGNING_SECRET ?? "msf-exam-portal-signing-secret-v1";

/** File-name pattern: results-{ExamName}-{SECRET_CODE}.xlsx */
export const RESULTS_FILE_PATTERN = / ^results-(.+)-([^.]+)\.xlsx$/i;

/**
 * Build the canonical stored file name for an exam.
 * Spaces in the exam name are replaced with dashes so the file name stays
 * filesystem-safe while remaining human-readable.
 */
export function buildResultsFileName(examName: string): string {
  const slug = examName
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}\-_]/gu, "")
    .replace(/-+/g, "-");
  return `results-${slug}-${RESULTS_SECRET_CODE}.xlsx`;
}

/**
 * Parse a stored file name and return the exam name segment.
 * Returns null when the file name does not match the expected pattern or
 * the embedded secret code does not equal the configured one.
 */
export function parseResultsFileName(
  fileName: string,
): { examName: string; secretCode: string } | null {
  // Match everything between "results-" and the final "-<secret>.xlsx".
  const match = fileName.match(/^results-(.+)-([^.]+)\.xlsx$/i);
  if (!match) return null;
  const [, examName, secretCode] = match;
  if (secretCode !== RESULTS_SECRET_CODE) return null;
  return { examName, secretCode };
}

/** Convert an arbitrary exam name into a URL/database-friendly slug. */
export function slugifyExamName(examName: string): string {
  return (
    examName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^\p{L}\p{N}\-]/gu, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "exam"
  );
}
