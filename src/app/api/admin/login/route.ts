import { NextResponse } from "next/server";
import {
  createAdminSession,
  verifyCredentials,
} from "@/lib/exam/auth";
import { ADMIN_EMAIL } from "@/lib/exam/config";

interface LoginBody {
  email?: string;
  password?: string;
}

/**
 * POST /api/admin/login
 * Body: { email, password }
 * Sets an httpOnly session cookie on success.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LoginBody;
    const email = (body.email ?? "").trim();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json(
        { error: "missing_fields" },
        { status: 400 },
      );
    }

    if (!verifyCredentials(email, password)) {
      // Slight delay to blunt brute-force attempts.
      await new Promise((resolve) => setTimeout(resolve, 400));
      return NextResponse.json(
        { error: "invalid_credentials" },
        { status: 401 },
      );
    }

    await createAdminSession();
    return NextResponse.json({ ok: true, email: ADMIN_EMAIL });
  } catch (error) {
    console.error("[POST /api/admin/login] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
