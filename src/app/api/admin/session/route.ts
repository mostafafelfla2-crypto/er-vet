import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/exam/auth";

/** GET /api/admin/session — returns whether the caller is authenticated. */
export async function GET() {
  try {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({ authenticated: true, email: session.email });
  } catch (error) {
    console.error("[GET /api/admin/session] error:", error);
    return NextResponse.json(
      { authenticated: false },
      { status: 500 },
    );
  }
}
