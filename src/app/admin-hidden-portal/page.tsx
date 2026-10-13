import { getAdminSession } from "@/lib/exam/auth";
import { AdminPortal } from "@/components/admin/admin-portal";

/**
 * Hidden admin route.
 *
 * URL: /admin-hidden-portal
 *
 * The server component checks the session cookie. The client child then
 * renders either the login form or the dashboard. We do a hard server-side
 * gate so the dashboard markup is never shipped to unauthenticated browsers.
 *
 * This route is intentionally not linked from the public UI — it is meant to
 * be discovered only by the operator.
 */
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getAdminSession();
  return <AdminPortal initialAuthed={session !== null} />;
}
