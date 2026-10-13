"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useI18n } from "@/i18n/i18n-provider";
import { SiteHeader } from "@/components/student/site-header";
import { SiteFooter } from "@/components/student/site-footer";

/** Admin login screen. Posts credentials to /api/admin/login. */
export function AdminLogin() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t("admin.loginError"));
        return;
      }
      // Force a fresh load so server-rendered state is reconciled.
      router.refresh();
      router.replace("/admin-hidden-portal");
    } catch {
      setError(t("admin.loginError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader compact />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card className="overflow-hidden border-border/70 shadow-card">
            <CardHeader className="space-y-3 border-b border-border/60 bg-muted/40 pb-6">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
                  <ShieldCheck className="size-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{t("admin.loginTitle")}</CardTitle>
                  <CardDescription className="text-xs">
                    {t("admin.subtitle")}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="admin-email" className="text-sm font-medium">
                    {t("admin.emailLabel")}
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
                    <Input
                      id="admin-email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t("admin.emailPlaceholder")}
                      dir="ltr"
                      className="h-11 rounded-xl ltr:pl-9 ltr:pr-3 rtl:pl-3 rtl:pr-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="admin-password" className="text-sm font-medium">
                    {t("admin.passwordLabel")}
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
                    <Input
                      id="admin-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("admin.passwordPlaceholder")}
                      dir="ltr"
                      className="h-11 rounded-xl ltr:pl-9 ltr:pr-3 rtl:pl-3 rtl:pr-9"
                    />
                  </div>
                </div>

                {error && (
                  <Alert variant="destructive" className="rounded-xl">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-11 w-full gap-2 rounded-xl text-sm font-semibold shadow-soft"
                >
                  {loading && <Loader2 className="size-4 animate-spin" />}
                  {t("admin.login")}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
      <SiteFooter />
    </div>
  );
}
