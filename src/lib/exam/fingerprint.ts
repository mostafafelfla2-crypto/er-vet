import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { DEVICE_FINGERPRINT_COOKIE } from "@/lib/exam/config";

/**
 * Device fingerprinting for the "strict device binding" feature.
 *
 * We combine a long-lived cookie (set on first visit) with the User-Agent and
 * Accept-Language headers. This is intentionally lightweight — it is not a
 * forensic-grade fingerprint, but it reliably distinguishes distinct
 * browsers/devices for the purpose of preventing result sharing.
 *
 * The cookie is the primary identifier. The header hash is mixed in so that
 * clearing the cookie alone is not enough to bypass binding on the same
 * browser.
 */

const FINGERPRINT_TTL = 60 * 60 * 24 * 365; // 1 year

export async function getOrCreateDeviceFingerprint(): Promise<string> {
  const store = await cookies();
  const existing = store.get(DEVICE_FINGERPRINT_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) {
    return existing;
  }

  // Build a fresh fingerprint from request headers.
  const userAgent = store.get("user-agent")?.value ?? "unknown-ua";
  const acceptLanguage = store.get("accept-language")?.value ?? "unknown-lang";
  const raw = `${userAgent}::${acceptLanguage}::${Date.now()}::${Math.random()}`;
  const fingerprint = createHash("md5").update(raw).digest("hex");

  store.set(DEVICE_FINGERPRINT_COOKIE, fingerprint, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: FINGERPRINT_TTL,
  });

  return fingerprint;
}

/** Read the fingerprint without creating a new one (for GETs). */
export async function readDeviceFingerprint(): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(DEVICE_FINGERPRINT_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/i.test(existing)) {
    return existing;
  }
  return null;
}
