import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL,
  SESSION_SIGNING_SECRET,
} from "@/lib/exam/config";

/**
 * Lightweight admin authentication.
 *
 * We sign a payload of `{email, exp}` with an HMAC-SHA256 using a server-side
 * secret. The signed token is stored in an httpOnly cookie. There is no
 * database session table because this is a single-admin personal tool.
 *
 * For a multi-admin deployment, swap `verifyCredentials` for a DB lookup and
 * use a session table — the cookie interface stays the same.
 */

interface SessionPayload {
  email: string;
  exp: number; // unix seconds
}

function sign(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", SESSION_SIGNING_SECRET)
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
}

function verify(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  const expected = createHmac("sha256", SESSION_SIGNING_SECRET)
    .update(body)
    .digest("base64url");
  // Timing-safe comparison to avoid token oracle attacks.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as SessionPayload;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function verifyCredentials(email: string, password: string): boolean {
  const emailOk =
    email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
    email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase();
  const passwordOk =
    password.length === ADMIN_PASSWORD.length &&
    timingSafeEqual(Buffer.from(password), Buffer.from(ADMIN_PASSWORD));
  return emailOk && passwordOk;
}

export async function createAdminSession(): Promise<void> {
  const payload: SessionPayload = {
    email: ADMIN_EMAIL,
    exp: Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL,
  };
  const token = sign(payload);
  const store = await cookies();
  store.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_TTL,
  });
}

export async function destroyAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_SESSION_COOKIE);
}

export async function getAdminSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(ADMIN_SESSION_COOKIE)?.value;
  if (!token) return null;
  return verify(token);
}

export async function requireAdmin(): Promise<SessionPayload> {
  const session = await getAdminSession();
  if (!session) {
    throw new Error("unauthorized");
  }
  return session;
}
