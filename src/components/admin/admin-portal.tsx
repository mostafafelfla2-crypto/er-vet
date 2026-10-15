"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

interface AdminPortalProps {
  initialAuthed: boolean;
}

/**
 * Client-side wrapper that picks between the login screen and the dashboard.
 *
 * The initial state is taken from the server-rendered prop. On mount we poll
 * the session endpoint so a stale/expired cookie is detected gracefully (e.g.
 * the user returns to the page after the session TTL has elapsed).
 *
 * When `AdminLogin` succeeds it calls `onAuthenticated`, which flips `authed`
 * to `true` synchronously — the dashboard mounts instantly with no flash of
 * the login form and no manual page refresh required. `AdminLogin` separately
 * awaits `router.refresh()` so the server component's `initialAuthed` prop
 * stays in sync for future navigations.
 */
export function AdminPortal({ initialAuthed }: AdminPortalProps) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [checked, setChecked] = useState(false);

  const handleAuthenticated = useCallback(() => {
    setAuthed(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/session", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { authenticated?: boolean }) => {
        if (!cancelled) {
          setAuthed(Boolean(data.authenticated));
          setChecked(true);
        }
      })
      .catch(() => {
        if (!cancelled) setChecked(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Instant client-side switch after a successful login.
  if (authed) {
    return <AdminDashboard />;
  }
  // While we reconcile server vs client state, show the initial assumption
  // so there is no flash of the login form for already-authed admins.
  if (!checked && initialAuthed) {
    return null;
  }
  return <AdminLogin onAuthenticated={handleAuthenticated} />;
}
