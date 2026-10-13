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
 * student rows. The first row is treated as a header and skipped.
 */
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

  const headers = (matrix[0] as unknown[])
    .map((cell) => (cell == null ? "" : String(cell).trim()))
    .filter((cell) => cell.length > 0);

  const dataRows = matrix.slice(1);
  const rows: StudentRow[] = [];
  for (const raw of dataRows) {
    const cells = (raw as unknown[]).map((cell) =>
      cell == null ? "" : String(cell).trim(),
    );
    // Skip fully empty rows.
    if (cells.every((cell) => cell === "")) continue;
    const name = cells[0] ?? "";
    const email = cells[1] ?? "";
    const grade = cells[2] ?? "";
    const extras = cells.slice(3).filter((cell) => cell !== "");
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
