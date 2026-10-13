"use client";

import { motion } from "framer-motion";
import {
  Award,
  CheckCircle2,
  ExternalLink,
  Hash,
  IdCard,
  Mail,
  Printer,
  Share2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/i18n/i18n-provider";
import { toast } from "sonner";

export interface ResultPayload {
  exam: {
    id: string;
    displayNameAr: string;
    displayNameEn: string;
  };
  student: {
    name: string;
    email: string;
    grade: string;
    score: number | null;
    total: number | null;
    percent: number | null;
  };
  band: {
    ar: string;
    en: string;
    color: string;
    min: number;
    max: number;
  } | null;
  successGroupUrl: string | null;
  viewOnceEnabled: boolean;
  issuedAt: string;
}

interface ResultCardProps {
  result: ResultPayload;
}

/** Animated result card shown after a successful student lookup. */
export function ResultCard({ result }: ResultCardProps) {
  const { t, locale } = useI18n();
  const examName = locale === "ar" ? result.exam.displayNameAr : result.exam.displayNameEn;
  const bandText = result.band ? (locale === "ar" ? result.band.ar : result.band.en) : "";
  const bandColor = result.band?.color ?? "#64748b";
  const percent = result.student.percent;

  const issuedDate = new Date(result.issuedAt);
  const issuedLabel = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(issuedDate);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({
          title: t("student.resultCardTitle"),
          text: `${examName} — ${result.student.name}`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(locale === "ar" ? "تم نسخ الرابط" : "Link copied");
      }
    } catch {
      /* user dismissed share dialog */
    }
  };

  const handlePrint = () => {
    if (typeof window !== "undefined") window.print();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="print:shadow-none"
    >
      <Card className="overflow-hidden border-border/70 shadow-card print:border-0 print:shadow-none">
        {/* Banner */}
        <div
          className="relative px-5 py-4 text-white print:bg-primary"
          style={{
            background: `linear-gradient(135deg, ${bandColor}, ${bandColor}cc 60%, ${bandColor}99)`,
          }}
        >
          <div className="absolute inset-0 bg-grid bg-grid-fade opacity-20" />
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/20 backdrop-blur-sm">
                <Award className="size-5" />
              </div>
              <div className="leading-tight">
                <p className="text-[11px] uppercase tracking-wider text-white/80">
                  {t("student.resultCardTitle")}
                </p>
                <p className="text-base font-semibold sm:text-lg">{examName}</p>
              </div>
            </div>
            {result.viewOnceEnabled && (
              <Badge
                variant="secondary"
                className="border-white/30 bg-white/20 text-white hover:bg-white/20"
              >
                {locale === "ar" ? "مرة واحدة" : "View Once"}
              </Badge>
            )}
          </div>
        </div>

        <CardHeader className="gap-0 pb-3 pt-5">
          {/* Identity */}
          <div className="grid gap-3 sm:grid-cols-2">
            <IdentityRow
              icon={<IdCard className="size-4" />}
              label={t("student.studentName")}
              value={result.student.name || "—"}
            />
            <IdentityRow
              icon={<Mail className="size-4" />}
              label={t("student.email")}
              value={result.student.email}
              dir="ltr"
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <Separator />

          {/* Grade block */}
          <div className="rounded-2xl border border-border/60 bg-muted/40 p-5">
            <div className="flex flex-col items-center gap-1 text-center">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {t("student.grade")}
              </span>
              <strong
                className="text-3xl font-bold tracking-tight sm:text-4xl"
                dir="ltr"
                style={{ color: bandColor }}
              >
                {result.student.grade || "—"}
              </strong>
            </div>

            {percent !== null && (
              <div className="mt-5 space-y-2">
                <div className="flex items-center justify-between text-sm font-medium">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <TrendingUp className="size-4" />
                    {t("student.percentage")}
                  </span>
                  <span className="font-bold" style={{ color: bandColor }}>
                    {percent}%
                  </span>
                </div>
                <div
                  className="h-2.5 w-full overflow-hidden rounded-full bg-border/70"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                    className="h-full rounded-full"
                    style={{ backgroundColor: bandColor }}
                  />
                </div>
                {bandText && (
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Hash className="size-3.5" />
                      {t("student.status")}
                    </span>
                    <Badge
                      className="border-transparent font-semibold text-white"
                      style={{ backgroundColor: bandColor }}
                    >
                      {bandText}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Success group link */}
          {result.successGroupUrl && (
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.35, duration: 0.3 }}
              className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900/60 dark:bg-emerald-950/30"
            >
              <div className="flex items-start gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                    {t("student.successGroupTitle")}
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-200/70">
                    {t("student.successGroupDesc")}
                  </p>
                  <Button
                    asChild
                    size="sm"
                    className="mt-3 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    <a
                      href={result.successGroupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {t("student.joinGroup")}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Footer actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p className="text-[11px] text-muted-foreground">
              {t("student.printedOn")}: {issuedLabel}
            </p>
            <div className="flex items-center gap-2 print:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="gap-1.5"
              >
                <Share2 className="size-3.5" />
                {t("student.share")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrint}
                className="gap-1.5"
              >
                <Printer className="size-3.5" />
                {t("student.print")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function IdentityRow({
  icon,
  label,
  value,
  dir,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </span>
      <strong
        className="break-words text-sm font-semibold leading-snug sm:text-base"
        dir={dir}
      >
        {value}
      </strong>
    </div>
  );
}
