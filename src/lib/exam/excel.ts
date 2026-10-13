import * as xlsx from "xlsx";

/**
 * A single student row extracted from an Excel results sheet.
 * The canonical column layout (kept identical to the original project) is:
 *   column 0 -> student name
 *   column 1 -> email
 *   column 2 -> grade (raw string, often "12/20" or "85")
 */
export interface StudentRow {
  name: string;
  email: string;
  grade: string;
  /** Extra columns preserved verbatim for forward compatibility. */
  extras: string[];
}

export interface ParsedSheet {
  rows: StudentRow[];
  /** Total number of data rows (excluding header). */
  count: number;
  /** Detected header row, if any. */
  headers: string[];
}

/**
 * Parse an Excel buffer (uploaded file or file read from disk) into structured
 * student rows. Column detection is automatic: if the first row contains
 * recognized header keywords (name/email/grade, in Arabic or English) those are
 * used; otherwise the parser inspects the data to find the email column by
 * shape and infers the name/grade columns from there.
 */
/** Header keywords used to auto-detect the email / name / grade columns. */
const EMAIL_HEADERS = ["email", "e-mail", "البريد", "الايميل", "الإيميل", "بريد", "mail"];
const NAME_HEADERS = ["name", "student", "student name", "الاسم", "اسم الطالب", "اسم"];
const GRADE_HEADERS = [
  "grade",
  "score",
  "mark",
  "result",
  "الدرجة",
  "الدرجه",
  "النتيجة",
  "النتيجه",
  "Mark",
];

function normalizeHeader(cell: unknown): string {
  return (cell == null ? "" : String(cell)).trim().toLowerCase();
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * Detect the column indices for name / email / grade.
 *
 * Strategy (most permissive first, so weirdly-formatted files still work):
 *   1. If the first row looks like a header, match by keyword.
 *   2. Otherwise, scan the data rows and pick the column that contains the
 *      most email-shaped values as the email column. Then pick the first
 *      non-numeric column as the name, and the first remaining column as the
 *      grade.
 *   3. Fall back to the canonical layout (0=name, 1=email, 2=grade).
 */
function detectColumns(matrix: unknown[][]): {
  nameIdx: number;
  emailIdx: number;
  gradeIdx: number;
  hasHeader: boolean;
} {
  const width = Math.max(...matrix.map((row) => row.length), 0);
  if (width === 0) {
    return { nameIdx: 0, emailIdx: 1, gradeIdx: 2, hasHeader: false };
  }

  // 1. Header-keyword detection.
  const firstRow = (matrix[0] ?? []).map(normalizeHeader);
  let emailIdx = firstRow.findIndex((h) => EMAIL_HEADERS.includes(h));
  let nameIdx = firstRow.findIndex((h) => NAME_HEADERS.includes(h));
  let gradeIdx = firstRow.findIndex((h) => GRADE_HEADERS.includes(h));

  const hasHeader =
    emailIdx !== -1 || nameIdx !== -1 || gradeIdx !== -1;

  if (hasHeader) {
    if (nameIdx === -1) nameIdx = 0;
    if (emailIdx === -1) {
      // Pick the first column that is not name/grade.
      emailIdx = [0, 1, 2].find((i) => i !== nameIdx && i !== gradeIdx) ?? 1;
    }
    if (gradeIdx === -1) {
      gradeIdx = [0, 1, 2].find((i) => i !== nameIdx && i !== emailIdx) ?? 2;
    }
    return { nameIdx, emailIdx, gradeIdx, hasHeader: true };
  }

  // 2. Content-based detection when there is no header.
  const sample = matrix.slice(0, Math.min(20, matrix.length));
  let bestEmailIdx = 1;
  let bestEmailScore = 0;
  for (let col = 0; col < width; col++) {
    let score = 0;
    for (const row of sample) {
      const v = normalizeHeader(row[col]);
      if (v && isEmailLike(v)) score++;
    }
    if (score > bestEmailScore) {
      bestEmailScore = score;
      bestEmailIdx = col;
    }
  }

  // Among the remaining columns, classify each as "grade-like" (numeric or
  // "score/total" pattern) or "name-like" (mostly text). Pick the strongest
  // candidate for each so misordered columns are still detected correctly.
  let detectedName = -1;
  let detectedGrade = -1;
  let bestNameScore = 0;
  let bestGradeScore = 0;
  for (let col = 0; col < width; col++) {
    if (col === bestEmailIdx) continue;
    let textCount = 0;
    let gradeCount = 0;
    for (const row of sample) {
      const v = normalizeHeader(row[col]);
      if (!v) continue;
      if (isEmailLike(v)) continue;
      // Grade-like: pure number, or "a/b", or ends with "%".
      if (/^\d+(\.\d+)?$/.test(v) || /^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(v) || /^\d+(\.\d+)?%?$/.test(v)) {
        gradeCount++;
      } else {
        textCount++;
      }
    }
    if (textCount > bestNameScore) {
      bestNameScore = textCount;
      detectedName = col;
    }
    if (gradeCount > bestGradeScore) {
      bestGradeScore = gradeCount;
      detectedGrade = col;
    }
  }

  // Fallbacks when only one non-email column exists.
  if (detectedName === -1) detectedName = bestEmailIdx === 0 ? 1 : 0;
  if (detectedGrade === -1) {
    for (let col = 0; col < width; col++) {
      if (col !== bestEmailIdx && col !== detectedName) {
        detectedGrade = col;
        break;
      }
    }
  }
  // Avoid name == grade collision.
  if (detectedName === detectedGrade) {
    for (let col = 0; col < width; col++) {
      if (col !== bestEmailIdx && col !== detectedName) {
        detectedGrade = col;
        break;
      }
    }
  }

  return {
    nameIdx: detectedName,
    emailIdx: bestEmailIdx,
    gradeIdx: detectedGrade,
    hasHeader: false,
  };
}

export function parseExcelBuffer(buffer: ArrayBuffer | Buffer): ParsedSheet {
  const workbook = xlsx.read(buffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { rows: [], count: 0, headers: [] };
  }
  const sheet = workbook.Sheets[firstSheetName];
  const matrix = xlsx.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });

  if (matrix.length === 0) {
    return { rows: [], count: 0, headers: [] };
  }

  const { nameIdx, emailIdx, gradeIdx, hasHeader } = detectColumns(matrix);

  const headers = hasHeader
    ? (matrix[0] as unknown[])
        .map((cell) => (cell == null ? "" : String(cell).trim()))
        .filter((cell) => cell.length > 0)
    : [];

  const dataRows = hasHeader ? matrix.slice(1) : matrix;
  const rows: StudentRow[] = [];
  for (const raw of dataRows) {
    const cells = (raw as unknown[]).map((cell) =>
      cell == null ? "" : String(cell).trim(),
    );
    // Skip fully empty rows.
    if (cells.every((cell) => cell === "")) continue;
    const name = cells[nameIdx] ?? "";
    const email = cells[emailIdx] ?? "";
    const grade = cells[gradeIdx] ?? "";
    const extras = cells
      .map((c, i) => (i !== nameIdx && i !== emailIdx && i !== gradeIdx && c !== "" ? c : null))
      .filter((c): c is string => c !== null);
    if (!email && !name && !grade) continue;
    rows.push({ name, email, grade, extras });
  }

  return { rows, count: rows.length, headers };
}

/**
 * Find a student row by email (case-insensitive, trims whitespace).
 */
export function findStudentByEmail(
  parsed: ParsedSheet,
  email: string,
): StudentRow | null {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  return (
    parsed.rows.find((row) => row.email.trim().toLowerCase() === normalized) ??
    null
  );
}

export interface GradeInfo {
  /** Raw grade text as stored in the file, e.g. "15/20". */
  text: string;
  /** Computed percentage (0-100) when computable, else null. */
  percent: number | null;
  /** Numerator when the grade is "a/b", else null. */
  score: number | null;
  /** Denominator when the grade is "a/b", else null. */
  total: number | null;
}

/**
 * Parse a grade cell. Supports "score/total" and bare numeric grades.
 * When `maxScoreOverride` is provided and the cell is a bare number, the
 * percentage is computed against it.
 */
export function parseGrade(
  gradeStr: string,
  maxScoreOverride?: number | null,
): GradeInfo {
  const text = (gradeStr ?? "").toString().trim();
  if (!text) {
    return { text: "", percent: null, score: null, total: null };
  }

  // "score/total" pattern.
  if (text.includes("/")) {
    const parts = text.split("/");
    const score = parseFloat(parts[0].trim().replace(",", "."));
    const total = parseFloat(parts[1].trim().replace(",", "."));
    if (
      !Number.isNaN(score) &&
      !Number.isNaN(total) &&
      total !== 0
    ) {
      const percent = Math.round((score / total) * 100);
      return { text, percent, score, total };
    }
  }

  // Bare numeric grade.
  const numeric = parseFloat(text.replace(",", "."));
  if (!Number.isNaN(numeric)) {
    if (maxScoreOverride && maxScoreOverride > 0) {
      const percent = Math.round((numeric / maxScoreOverride) * 100);
      return { text, percent, score: numeric, total: maxScoreOverride };
    }
    // Assume the number is already a percentage when it's <= 100.
    if (numeric <= 100) {
      return { text, percent: Math.round(numeric), score: numeric, total: 100 };
    }
  }

  return { text, percent: null, score: null, total: null };
}

export interface GradeBand {
  min: number;
  max: number;
  ar: string;
  en: string;
  color: string;
}

/** Default grade bands used when an exam has no custom configuration. */
export const DEFAULT_GRADE_BANDS: GradeBand[] = [
  { min: 0, max: 50, ar: "ضعيف", en: "Fail", color: "#ef4444" },
  { min: 50, max: 60, ar: "مقبول", en: "Pass", color: "#f97316" },
  { min: 60, max: 75, ar: "جيد", en: "Good", color: "#eab308" },
  { min: 75, max: 85, ar: "جيد جداً", en: "Very Good", color: "#0ea5e9" },
  { min: 85, max: 101, ar: "ممتاز", en: "Excellent", color: "#22c55e" },
];

/**
 * Resolve the grade band that applies to a given percentage.
 * Falls back to DEFAULT_GRADE_BANDS when no custom bands are supplied.
 */
export function resolveGradeBand(
  percent: number | null,
  customBands?: GradeBand[] | null,
): GradeBand | null {
  if (percent === null) return null;
  const bands = customBands && customBands.length > 0 ? customBands : DEFAULT_GRADE_BANDS;
  return (
    bands.find((band) => percent >= band.min && percent < band.max) ??
    bands[bands.length - 1] ??
    null
  );
}

/** Safely parse a JSON string of grade bands, returning null on failure. */
export function parseGradeBands(json: string | null): GradeBand[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter(
        (band): band is GradeBand =>
          typeof band === "object" &&
          band !== null &&
          typeof band.min === "number" &&
          typeof band.max === "number" &&
          typeof band.ar === "string" &&
          typeof band.en === "string" &&
          typeof band.color === "string",
      )
      .sort((a, b) => a.min - b.min);
  } catch {
    return null;
  }
}
