import { NextResponse } from "next/server";
import { destroyAdminSession } from "@/lib/exam/auth";

/** POST /api/admin/logout — clears the admin session cookie. */
export async function POST() {
  try {
    await destroyAdminSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/admin/logout] error:", error);
    return NextResponse.json(
      { error: "server_error" },
      { status: 500 },
    );
  }
}
