"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  ChevronDown,
  FileWarning,
  Inbox,
  LockKeyhole,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SiteHeader } from "@/components/student/site-header";
import { SiteFooter } from "@/components/student/site-footer";
import { SearchForm } from "@/components/student/search-form";
import { ResultCard, type ResultPayload } from "@/components/student/result-card";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";

interface ExamTab {
  id: string;
  slug: string;
  displayNameAr: string;
  displayNameEn: string;
  createdAt: string;
}

interface ExamsResponse {
  exams: ExamTab[];
}

export default function HomePage() {
  const { t, locale } = useI18n();
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [result, setResult] = useState<ResultPayload | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<ExamsResponse>({
    queryKey: ["exams"],
    queryFn: async () => {
      const res = await fetch("/api/exams", { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      return res.json();
    },
  });

  const exams = data?.exams ?? [];

  // Derive the effective active exam: prefer the user's selection, but fall
  // back to the most recent exam when nothing is selected or the selection
  // no longer exists (e.g. after deletion). This avoids effect-driven renders.
  const activeExamId = useMemo(() => {
    if (exams.length === 0) return null;
    if (selectedExamId && exams.find((e) => e.id === selectedExamId)) {
      return selectedExamId;
    }
    return exams[0].id; // list is already newest-first
  }, [exams, selectedExamId]);

  const activeExam = useMemo(
    () => exams.find((e) => e.id === activeExamId) ?? null,
    [exams, activeExamId],
  );

  // Reset the displayed result whenever the active exam changes — done inline
  // in the change handler rather than via an effect.
  const handleExamChange = (id: string) => {
    setSelectedExamId(id);
    setResult(null);
    setErrorKey(null);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border/60">
          <div className="absolute inset-0 -z-10 bg-grid bg-grid-fade opacity-60" />
          <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-primary/10 via-transparent to-transparent" />
          <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
            <div className="mx-auto max-w-2xl text-center">
              <Badge
                variant="secondary"
                className="mb-4 gap-1.5 rounded-full border-primary/20 bg-primary/10 px-3 py-1 text-primary"
              >
                <Sparkles className="size-3.5" />
                {locale === "ar"
                  ? "نتائج فورية وآمنة"
                  : "Instant & secure results"}
              </Badge>
              <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-4xl">
                {t("student.title")}
              </h1>
              <p className="mt-3 text-balance text-sm text-muted-foreground sm:text-base">
                {t("student.subtitle")}
              </p>
            </div>
          </div>
        </section>

        {/* Body */}
        <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-10">
          {isLoading ? (
            <LoadingSkeleton />
          ) : isError ? (
            <EmptyState
              icon={<FileWarning className="size-6" />}
              title={t("student.connectionError")}
            />
          ) : exams.length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-6" />}
              title={t("student.noExams")}
            />
          ) : (
            <div className="space-y-6">
              {/* Exam tabs (desktop) / select (mobile) */}
              <ExamSwitcher
                exams={exams}
                activeExamId={activeExamId}
                onChange={handleExamChange}
              />

              {/* Search + result */}
              <Card className="overflow-hidden border-border/70 shadow-card">
                <CardHeader className="gap-2 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                        <LockKeyhole className="size-4 text-primary" />
                        {activeExam
                          ? locale === "ar"
                            ? activeExam.displayNameAr
                            : activeExam.displayNameEn
                          : t("student.selectExam")}
                      </CardTitle>
                      {activeExam && (
                        <CardDescription className="mt-1 flex items-center gap-1.5 text-xs">
                          <CalendarClock className="size-3.5" />
                          {new Intl.DateTimeFormat(
                            locale === "ar" ? "ar-EG" : "en-GB",
                            { dateStyle: "medium" },
                          ).format(new Date(activeExam.createdAt))}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5">
                  {activeExam ? (
                    <SearchForm
                      examId={activeExam.id}
                      onResult={(r, err) => {
                        setResult(r);
                        setErrorKey(err);
                      }}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      {t("student.selectExam")}
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Result / error */}
              <AnimatePresence mode="wait">
                {result && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <ResultCard result={result} />
                  </motion.div>
                )}
                {errorKey && !result && (
                  <motion.div
                    key="error"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                  >
                    <ErrorBlock errorKey={errorKey} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

/** Desktop tab strip + mobile select — same data, two affordances. */
function ExamSwitcher({
  exams,
  activeExamId,
  onChange,
}: {
  exams: ExamTab[];
  activeExamId: string | null;
  onChange: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-2">
      {/* Mobile dropdown */}
      <div className="sm:hidden">
        <Select
          value={activeExamId ?? undefined}
          onValueChange={onChange}
        >
          <SelectTrigger className="h-11 w-full rounded-xl">
            <SelectValue placeholder={t("student.selectExam")} />
          </SelectTrigger>
          <SelectContent>
            {exams.map((exam) => (
              <SelectItem key={exam.id} value={exam.id}>
                {locale === "ar" ? exam.displayNameAr : exam.displayNameEn}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop tabs */}
      <Tabs
        value={activeExamId ?? undefined}
        onValueChange={onChange}
        className="hidden sm:block"
      >
        <TabsList className="flex h-auto w-full flex-wrap gap-1 rounded-xl bg-muted/60 p-1.5">
          {exams.map((exam) => {
            const label =
              locale === "ar" ? exam.displayNameAr : exam.displayNameEn;
            return (
              <TabsTrigger
                key={exam.id}
                value={exam.id}
                className="gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-soft sm:text-sm"
              >
                {label}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-11 animate-pulse rounded-xl bg-muted" />
      <div className="h-48 animate-pulse rounded-2xl bg-muted/70" />
    </div>
  );
}

function EmptyState({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <Card className="border-dashed bg-muted/30">
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <p className="max-w-sm text-sm text-muted-foreground">{title}</p>
      </CardContent>
    </Card>
  );
}

function ErrorBlock({ errorKey }: { errorKey: string }) {
  const { t, locale } = useI18n();
  const isDeviceBlocked = errorKey === "student.deviceBlocked";
  const isAlreadyViewed = errorKey === "student.alreadyViewed";
  const icon = isDeviceBlocked ? (
    <ShieldAlert className="size-5" />
  ) : (
    <FileWarning className="size-5" />
  );
  return (
    <Card
      className={cn(
        "border-destructive/30 bg-destructive/5",
        isAlreadyViewed && "border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20",
      )}
    >
      <CardContent className="flex items-start gap-3 py-5">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl",
            isAlreadyViewed
              ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            {isAlreadyViewed
              ? locale === "ar"
                ? "تمت المشاهدة"
                : "Already Viewed"
              : locale === "ar"
                ? "تعذّر عرض النتيجة"
                : "Cannot show result"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(errorKey as never)}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
