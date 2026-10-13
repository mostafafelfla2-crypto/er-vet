"use client";

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  FileSpreadsheet,
  LayoutDashboard,
  LogOut,
  RotateCw,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/student/site-header";
import { SiteFooter } from "@/components/student/site-footer";
import { UploadCenter } from "@/components/admin/upload-center";
import { ExamConfigCard } from "@/components/admin/exam-config-card";
import { useI18n } from "@/i18n/i18n-provider";
import type { ExamSummary } from "@/lib/exam/registry";
import { toast } from "sonner";

interface StatsResponse {
  totalExams: number;
  activeExams: number;
  totalViews: number;
  totalBindings: number;
}

/** Main admin dashboard: stats + upload center + per-exam config cards. */
export function AdminDashboard() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const { data: examsData, isLoading: examsLoading } = useQuery<{
    exams: ExamSummary[];
  }>({
    queryKey: ["admin-exams"],
    queryFn: async () => {
      const res = await fetch("/api/admin/exams", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const exams = examsData?.exams ?? [];

  const refreshAll = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-exams"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] }),
      queryClient.invalidateQueries({ queryKey: ["exams"] }),
    ]);
    setRefreshing(false);
  }, [queryClient]);

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/admin/exams/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      toast.success(t("admin.deleteSuccess"));
      refreshAll();
    } catch {
      toast.error(t("admin.saveError"));
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
    } finally {
      router.refresh();
      router.replace("/admin-hidden-portal");
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        trailing={
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="gap-1.5 text-muted-foreground"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">{t("admin.logout")}</span>
          </Button>
        }
      />

      <main className="flex-1">
        <section className="border-b border-border/60 bg-muted/30">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5">
            <div>
              <h1 className="flex items-center gap-2 text-lg font-bold tracking-tight sm:text-xl">
                <LayoutDashboard className="size-5 text-primary" />
                {t("admin.title")}
              </h1>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("admin.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshAll}
                className="gap-1.5"
              >
                <RotateCw
                  className={`size-4 ${refreshing ? "animate-spin" : ""}`}
                />
                <span className="hidden sm:inline">
                  {locale === "ar" ? "تحديث" : "Refresh"}
                </span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/")}
                className="gap-1.5"
              >
                {t("admin.backToPortal")}
              </Button>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:py-8">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              icon={<FileSpreadsheet className="size-4" />}
              label={t("admin.totalExams")}
              value={stats?.totalExams}
              accent="text-primary"
            />
            <StatCard
              icon={<Activity className="size-4" />}
              label={t("admin.activeExams")}
              value={stats?.activeExams}
              accent="text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              icon={<ScrollText className="size-4" />}
              label={t("admin.totalViews")}
              value={stats?.totalViews}
              accent="text-amber-600 dark:text-amber-400"
            />
            <StatCard
              icon={<Activity className="size-4" />}
              label={locale === "ar" ? "عمليات الربط" : "Device Bindings"}
              value={stats?.totalBindings}
              accent="text-sky-600 dark:text-sky-400"
            />
          </div>

          {/* Upload center */}
          <UploadCenter onUploaded={refreshAll} />

          {/* Exams list */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {t("admin.examsList")}{" "}
                <span className="text-foreground">({exams.length})</span>
              </h2>
            </div>

            {examsLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 w-full rounded-2xl" />
                ))}
              </div>
            ) : exams.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {t("admin.noExams")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <motion.div layout className="space-y-3">
                {exams.map((exam) => (
                  <ExamConfigCard
                    key={exam.id}
                    exam={exam}
                    onDelete={handleDelete}
                    onSaved={refreshAll}
                  />
                ))}
              </motion.div>
            )}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  accent: string;
}) {
  return (
    <Card className="border-border/70 shadow-soft">
      <CardContent className="py-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className={accent}>{icon}</span>
        </div>
        <p className="mt-1 text-2xl font-bold tracking-tight">
          {value ?? "—"}
        </p>
      </CardContent>
    </Card>
  );
}
