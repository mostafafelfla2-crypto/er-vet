"use client";

import { useEffect, useState } from "react";
import { AdminLogin } from "@/components/admin/admin-login";
import { AdminDashboard } from "@/components/admin/admin-dashboard";

interface AdminPortalProps {
  initialAuthed: boolean;
}

/**
 * Client-side wrapper that picks between the login screen and the dashboard.
 * The initial state is taken from the server-rendered prop, but we also poll
 * the session endpoint on mount so a stale cookie (e.g. after expiry) is
 * detected gracefully.
 */
export function AdminPortal({ initialAuthed }: AdminPortalProps) {
  const [authed, setAuthed] = useState(initialAuthed);
  const [checked, setChecked] = useState(false);

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

  // While we reconcile server vs client state, show the initial assumption
  // so there is no flash of the login form for already-authed admins.
  if (authed) {
    return <AdminDashboard />;
  }
  if (!checked && initialAuthed) {
    return null; // brief reconciling state
  }
  return <AdminLogin />;
}
