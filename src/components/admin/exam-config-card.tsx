"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Fingerprint,
  Link2,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useI18n } from "@/i18n/i18n-provider";
import type { ExamSummary } from "@/lib/exam/registry";
import { parseGradeBands, type GradeBand } from "@/lib/exam/excel";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface ExamConfigCardProps {
  exam: ExamSummary;
  onDelete: (id: string) => void;
  onSaved: () => void;
}

const DEFAULT_BANDS: GradeBand[] = [
  { min: 0, max: 50, ar: "ضعيف", en: "Fail", color: "#ef4444" },
  { min: 50, max: 60, ar: "مقبول", en: "Pass", color: "#f97316" },
  { min: 60, max: 75, ar: "جيد", en: "Good", color: "#eab308" },
  { min: 75, max: 85, ar: "جيد جداً", en: "Very Good", color: "#0ea5e9" },
  { min: 85, max: 101, ar: "ممتاز", en: "Excellent", color: "#22c55e" },
];

/** Full per-exam configuration card. */
export function ExamConfigCard({ exam, onDelete, onSaved }: ExamConfigCardProps) {
  const { t, locale } = useI18n();
  const [displayNameAr, setDisplayNameAr] = useState(exam.displayNameAr);
  const [displayNameEn, setDisplayNameEn] = useState(exam.displayNameEn);
  const [maxScore, setMaxScore] = useState<string>(
    exam.maxScore != null ? String(exam.maxScore) : "",
  );
  const [bands, setBands] = useState<GradeBand[]>(() => {
    const parsed = parseGradeBands(exam.gradeBandsJson);
    return parsed && parsed.length > 0 ? parsed : DEFAULT_BANDS.map((b) => ({ ...b }));
  });
  const [successGroupUrl, setSuccessGroupUrl] = useState(exam.successGroupUrl ?? "");
  const [successThreshold, setSuccessThreshold] = useState<string>(
    String(exam.successThreshold ?? 50),
  );
  const [viewOnceEnabled, setViewOnceEnabled] = useState(exam.viewOnceEnabled);
  const [deviceBindingEnabled, setDeviceBindingEnabled] = useState(
    exam.deviceBindingEnabled,
  );
  const [isActive, setIsActive] = useState(exam.isActive);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  // --- Tracking management state --------------------------------------------
  const [trackingResetting, setTrackingResetting] = useState(false);
  const [trackingExporting, setTrackingExporting] = useState(false);
  const [trackingImporting, setTrackingImporting] = useState(false);
  const [trackingCounts, setTrackingCounts] = useState<{
    views: number;
    bindings: number;
  } | null>(null);
  // Reset dialog checkboxes — which categories to clear.
  const [resetViews, setResetViews] = useState(true);
  const [resetBindings, setResetBindings] = useState(true);

  // Re-sync local state when the exam prop changes after a refetch.
  useEffect(() => {
    setDisplayNameAr(exam.displayNameAr);
    setDisplayNameEn(exam.displayNameEn);
    setMaxScore(exam.maxScore != null ? String(exam.maxScore) : "");
    const parsed = parseGradeBands(exam.gradeBandsJson);
    setBands(parsed && parsed.length > 0 ? parsed : DEFAULT_BANDS.map((b) => ({ ...b })));
    setSuccessGroupUrl(exam.successGroupUrl ?? "");
    setSuccessThreshold(String(exam.successThreshold ?? 50));
    setViewOnceEnabled(exam.viewOnceEnabled);
    setDeviceBindingEnabled(exam.deviceBindingEnabled);
    setIsActive(exam.isActive);
  }, [exam]);

  function updateBand(index: number, patch: Partial<GradeBand>) {
    setBands((prev) =>
      prev.map((band, i) => (i === index ? { ...band, ...patch } : band)),
    );
  }

  function addBand() {
    setBands((prev) => [
      ...prev,
      { min: 0, max: 0, ar: "", en: "", color: "#64748b" },
    ]);
  }

  function removeBand(index: number) {
    setBands((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const cleanedBands = bands
        .filter((b) => b.ar.trim() || b.en.trim())
        .map((b) => ({
          min: Number(b.min) || 0,
          max: Number(b.max) || 0,
          ar: b.ar.trim(),
          en: b.en.trim(),
          color: b.color || "#64748b",
        }))
        .sort((a, b) => a.min - b.min);

      const res = await fetch(`/api/admin/exams/${exam.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayNameAr,
          displayNameEn,
          maxScore: maxScore.trim() === "" ? null : Number(maxScore),
          gradeBands: cleanedBands.length > 0 ? cleanedBands : null,
          successGroupUrl: successGroupUrl.trim() || null,
          successThreshold: Number(successThreshold) || 0,
          viewOnceEnabled,
          deviceBindingEnabled,
          isActive,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(
          data.error === "invalid_url"
            ? t("admin.saveError")
            : data.error === "invalid_threshold"
              ? t("admin.saveError")
              : t("admin.saveError"),
        );
        return;
      }
      toast.success(t("admin.saveSuccess"));
      onSaved();
    } catch {
      toast.error(t("admin.saveError"));
    } finally {
      setSaving(false);
    }
  }

  // --- Tracking: fetch counts (called when the section is opened/hovered) --
  // Always force a fresh fetch so counts stay accurate after reset/import.
  // The endpoint is cheap (two COUNT queries) and we pass cache: "no-store".
  async function fetchTrackingCounts(force = false) {
    if (!force && trackingCounts) return; // already loaded (non-forced)
    try {
      const res = await fetch(`/api/admin/exams/${exam.id}/tracking`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = await res.json();
      setTrackingCounts({
        views: data.stats?.totalViews ?? 0,
        bindings: data.stats?.totalBindings ?? 0,
      });
    } catch {
      // non-fatal — the section just shows "—" instead of counts
    }
  }

  // --- Tracking: reset (clear all views + bindings) -----------------------
  async function handleTrackingReset() {
    // Safety: if neither category is selected, do nothing.
    if (!resetViews && !resetBindings) {
      toast.error(
        locale === "ar"
          ? "اختر على الأقل فئة واحدة للمسح"
          : "Select at least one category to clear",
      );
      return;
    }
    setTrackingResetting(true);
    try {
      // Build query string so the server only deletes the selected categories.
      const params = new URLSearchParams();
      params.set("views", resetViews ? "true" : "false");
      params.set("bindings", resetBindings ? "true" : "false");
      const res = await fetch(
        `/api/admin/exams/${exam.id}/tracking?${params.toString()}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Show the ACTUAL error so the admin knows why it failed (401
        // session expired, 500 server error, etc.) instead of a generic
        // message.
        if (res.status === 401 || data.error === "unauthorized") {
          toast.error(
            locale === "ar"
              ? "انتهت الجلسة — سجّل دخول مرة أخرى"
              : "Session expired — please log in again",
          );
          // Force a reload to the login screen.
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
        toast.error(
          data.detail
            ? `${data.error}: ${data.detail}`
            : locale === "ar"
              ? `فشل المسح (${res.status}): ${data.error ?? "خطأ غير معروف"}`
              : `Reset failed (${res.status}): ${data.error ?? "unknown"}`,
        );
        return;
      }
      // Build a descriptive toast based on what was actually cleared.
      const parts: string[] = [];
      if (resetViews) {
        parts.push(
          locale === "ar"
            ? `${data.deleted.views} مشاهدة`
            : `${data.deleted.views} views`,
        );
      }
      if (resetBindings) {
        parts.push(
          locale === "ar"
            ? `${data.deleted.bindings} ربط`
            : `${data.deleted.bindings} bindings`,
        );
      }
      toast.success(
        locale === "ar"
          ? `تم مسح ${parts.join(" و ")}`
          : `Cleared ${parts.join(" and ")}`,
      );
      // Update the displayed counts — only zero out the cleared categories.
      setTrackingCounts((prev) => ({
        views: resetViews ? 0 : prev?.views ?? 0,
        bindings: resetBindings ? 0 : prev?.bindings ?? 0,
      }));
      onSaved();
    } catch (err) {
      toast.error(
        locale === "ar"
          ? `فشل الاتصال: ${(err as Error).message ?? "خطأ"}`
          : `Connection failed: ${(err as Error).message ?? "error"}`,
      );
    } finally {
      setTrackingResetting(false);
    }
  }

  // --- Tracking: export (download JSON) ------------------------------------
  async function handleTrackingExport() {
    setTrackingExporting(true);
    try {
      const res = await fetch(`/api/admin/exams/${exam.id}/tracking`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 401 || data.error === "unauthorized") {
          toast.error(
            locale === "ar"
              ? "انتهت الجلسة — سجّل دخول مرة أخرى"
              : "Session expired — please log in again",
          );
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
        toast.error(
          locale === "ar"
            ? `فشل التصدير (${res.status}): ${data.error ?? "خطأ"}`
            : `Export failed (${res.status}): ${data.error ?? "error"}`,
        );
        return;
      }
      const data = await res.json();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeSlug = exam.slug.replace(/[^a-z0-9-]/gi, "-");
      a.download = `tracking-${safeSlug}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      // Update the counts from the export payload (it includes stats).
      if (data.stats) {
        setTrackingCounts({
          views: data.stats.totalViews ?? 0,
          bindings: data.stats.totalBindings ?? 0,
        });
      }
      toast.success(
        locale === "ar" ? "تم تصدير بيانات التتبع" : "Tracking data exported",
      );
    } catch (err) {
      toast.error(
        locale === "ar"
          ? `فشل التصدير: ${(err as Error).message ?? "خطأ"}`
          : `Export failed: ${(err as Error).message ?? "error"}`,
      );
    } finally {
      setTrackingExporting(false);
    }
  }

  // --- Tracking: import (upload JSON) --------------------------------------
  async function handleTrackingImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setTrackingImporting(true);
    try {
      const text = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        toast.error(
          locale === "ar"
            ? "ملف JSON غير صالح"
            : "Invalid JSON file",
        );
        return;
      }
      const res = await fetch(`/api/admin/exams/${exam.id}/tracking`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401 || data.error === "unauthorized") {
          toast.error(
            locale === "ar"
              ? "انتهت الجلسة — سجّل دخول مرة أخرى"
              : "Session expired — please log in again",
          );
          if (typeof window !== "undefined") window.location.reload();
          return;
        }
        toast.error(
          data.detail
            ? `${data.error}: ${data.detail}`
            : locale === "ar"
              ? `فشل الاستيراد (${res.status}): ${data.error ?? "خطأ"}`
              : `Import failed (${res.status}): ${data.error ?? "error"}`,
        );
        return;
      }
      toast.success(
        locale === "ar"
          ? `تم استيراد ${data.imported.views.total} مشاهدة و ${data.imported.bindings.total} ربط`
          : `Imported ${data.imported.views.total} views and ${data.imported.bindings.total} bindings`,
      );
      // Force a fresh fetch of counts so the UI reflects the new totals.
      setTrackingCounts(null);
      await fetchTrackingCounts(true);
      onSaved();
    } catch (err) {
      toast.error(
        locale === "ar"
          ? `فشل الاستيراد: ${(err as Error).message ?? "خطأ"}`
          : `Import failed: ${(err as Error).message ?? "error"}`,
      );
    } finally {
      setTrackingImporting(false);
      // Reset the input so the same file can be selected again.
      if (e.target) e.target.value = "";
    }
  }

  const createdLabel = new Intl.DateTimeFormat(
    locale === "ar" ? "ar-EG" : "en-GB",
    { dateStyle: "medium", timeStyle: "short" },
  ).format(new Date(exam.createdAt));

  return (
    <Card className="overflow-hidden border-border/70 shadow-card">
      {/* Header / summary row */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 bg-muted/30 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold sm:text-base">
              {locale === "ar" ? exam.displayNameAr : exam.displayNameEn}
            </h3>
            <Badge
              variant={isActive ? "default" : "secondary"}
              className={
                isActive
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                  : ""
              }
            >
              {isActive ? t("admin.active") : t("admin.inactive")}
            </Badge>
            {viewOnceEnabled && (
              <Badge variant="outline" className="gap-1">
                <Eye className="size-3" />
                {locale === "ar" ? "مرة واحدة" : "View Once"}
              </Badge>
            )}
            {deviceBindingEnabled && (
              <Badge variant="outline" className="gap-1">
                <Fingerprint className="size-3" />
                {locale === "ar" ? "ربط جهاز" : "Device Bound"}
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-[11px] text-muted-foreground" dir="ltr">
            {exam.fileName}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t("admin.createdLabel")}: {createdLabel}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
            className="gap-1.5"
          >
            <Settings2 className="size-4" />
            <span className="hidden sm:inline">
              {open ? t("admin.collapseConfig") : t("admin.expandConfig")}
            </span>
            <ChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label={t("common.delete")}
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("common.delete")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("admin.deleteConfirm")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(exam.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Collapsible config */}
      {open && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CardContent className="space-y-2 pt-5">
            <Accordion type="multiple" defaultValue={["display"]} className="w-full">
              {/* Display + status */}
              <AccordionItem value="display" className="border-border/60">
                <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Settings2 className="size-4 text-primary" />
                    {t("admin.configTitle")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label={t("admin.displayNameArLabel")}>
                      <Input
                        value={displayNameAr}
                        onChange={(e) => setDisplayNameAr(e.target.value)}
                        className="h-10 rounded-lg"
                        dir="rtl"
                      />
                    </Field>
                    <Field label={t("admin.displayNameEnLabel")}>
                      <Input
                        value={displayNameEn}
                        onChange={(e) => setDisplayNameEn(e.target.value)}
                        className="h-10 rounded-lg"
                        dir="ltr"
                      />
                    </Field>
                  </div>
                  <ToggleRow
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    title={t("admin.active")}
                    desc={locale === "ar" ? "إظهار الامتحان في البوابة" : "Show exam in the portal"}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Grading */}
              <AccordionItem value="grading" className="border-border/60">
                <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Palette className="size-4 text-primary" />
                    {t("admin.gradingTitle")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <Field
                    label={t("admin.maxScoreLabel")}
                    hint={t("admin.maxScoreHint")}
                  >
                    <Input
                      type="number"
                      min={0}
                      step="0.1"
                      value={maxScore}
                      onChange={(e) => setMaxScore(e.target.value)}
                      placeholder="20"
                      className="h-10 rounded-lg"
                      dir="ltr"
                    />
                  </Field>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {t("admin.gradeBandsLabel")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("admin.gradeBandsHint")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={addBand}
                        className="h-8 gap-1.5"
                      >
                        {t("admin.addBand")}
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {bands.map((band, index) => (
                        <div
                          key={index}
                          className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-12 sm:items-center"
                        >
                          <Input
                            type="number"
                            value={band.min}
                            onChange={(e) =>
                              updateBand(index, { min: Number(e.target.value) })
                            }
                            placeholder={t("admin.bandMin")}
                            className="h-9 rounded-md sm:col-span-2"
                            dir="ltr"
                          />
                          <Input
                            type="number"
                            value={band.max}
                            onChange={(e) =>
                              updateBand(index, { max: Number(e.target.value) })
                            }
                            placeholder={t("admin.bandMax")}
                            className="h-9 rounded-md sm:col-span-2"
                            dir="ltr"
                          />
                          <Input
                            value={band.ar}
                            onChange={(e) =>
                              updateBand(index, { ar: e.target.value })
                            }
                            placeholder={t("admin.bandAr")}
                            className="h-9 rounded-md sm:col-span-3"
                            dir="rtl"
                          />
                          <Input
                            value={band.en}
                            onChange={(e) =>
                              updateBand(index, { en: e.target.value })
                            }
                            placeholder={t("admin.bandEn")}
                            className="h-9 rounded-md sm:col-span-3"
                            dir="ltr"
                          />
                          <div className="flex items-center gap-1 sm:col-span-2">
                            <input
                              type="color"
                              value={band.color}
                              onChange={(e) =>
                                updateBand(index, { color: e.target.value })
                              }
                              className="h-9 w-10 shrink-0 cursor-pointer rounded-md border border-border bg-background p-1"
                              aria-label={t("admin.bandColor")}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-9 text-destructive hover:bg-destructive/10"
                              onClick={() => removeBand(index)}
                              aria-label={t("common.delete")}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Success group */}
              <AccordionItem value="success" className="border-border/60">
                <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Link2 className="size-4 text-primary" />
                    {t("admin.successGroupTitle")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4 pt-2">
                  <Field label={t("admin.successUrlLabel")}>
                    <Input
                      type="url"
                      value={successGroupUrl}
                      onChange={(e) => setSuccessGroupUrl(e.target.value)}
                      placeholder={t("admin.successUrlPlaceholder")}
                      className="h-10 rounded-lg"
                      dir="ltr"
                    />
                  </Field>
                  <Field
                    label={t("admin.thresholdLabel")}
                    hint={t("admin.thresholdHint")}
                  >
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={successThreshold}
                      onChange={(e) => setSuccessThreshold(e.target.value)}
                      className="h-10 rounded-lg"
                      dir="ltr"
                    />
                  </Field>
                </AccordionContent>
              </AccordionItem>

              {/* Security */}
              <AccordionItem value="security" className="border-border/60">
                <AccordionTrigger className="text-sm font-semibold hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Fingerprint className="size-4 text-primary" />
                    {t("admin.securityTitle")}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  <ToggleRow
                    checked={viewOnceEnabled}
                    onCheckedChange={setViewOnceEnabled}
                    icon={<Eye className="size-4" />}
                    title={t("admin.viewOnceLabel")}
                    desc={t("admin.viewOnceDesc")}
                  />
                  <ToggleRow
                    checked={deviceBindingEnabled}
                    onCheckedChange={setDeviceBindingEnabled}
                    icon={<Fingerprint className="size-4" />}
                    title={t("admin.deviceBindingLabel")}
                    desc={t("admin.deviceBindingDesc")}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* Tracking management — reset / export / import */}
              <AccordionItem
                value="tracking"
                className="border-border/60"
                onMouseEnter={() => fetchTrackingCounts()}
              >
                <AccordionTrigger
                  className="text-sm font-semibold hover:no-underline"
                  onClick={() => fetchTrackingCounts(true)}
                >
                  <span className="flex items-center gap-2">
                    <RotateCcw className="size-4 text-primary" />
                    {locale === "ar" ? "إدارة التتبع" : "Tracking Management"}
                    {trackingCounts && (trackingCounts.views > 0 || trackingCounts.bindings > 0) && (
                      <Badge variant="secondary" className="ml-1 gap-1 text-[10px]">
                        {trackingCounts.views + trackingCounts.bindings}
                      </Badge>
                    )}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pt-2">
                  {/* Counts summary */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-center">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {locale === "ar" ? "المشاهدات" : "Views"}
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {trackingCounts?.views ?? "—"}
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-center">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                        {locale === "ar" ? "ربط الأجهزة" : "Bindings"}
                      </p>
                      <p className="mt-1 text-lg font-bold">
                        {trackingCounts?.bindings ?? "—"}
                      </p>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* Reset */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={trackingResetting}
                          className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          {trackingResetting ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="size-3.5" />
                          )}
                          {locale === "ar" ? "إعادة تعيين" : "Reset"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {locale === "ar"
                              ? "إعادة تعيين التتبع"
                              : "Reset Tracking"}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {locale === "ar"
                              ? "اختر ما تريد مسحه. لا يمكن التراجع عن هذا الإجراء."
                              : "Select what to clear. This cannot be undone."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>

                        {/* Category checkboxes */}
                        <div className="space-y-3 py-2">
                          <label
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/40"
                            htmlFor={`reset-views-${exam.id}`}
                          >
                            <Checkbox
                              id={`reset-views-${exam.id}`}
                              checked={resetViews}
                              onCheckedChange={(v) =>
                                setResetViews(v === true)
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <span className="block text-sm font-medium">
                                {locale === "ar"
                                  ? "سجلات المشاهدات (View Once)"
                                  : "View logs (View Once)"}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {locale === "ar"
                                  ? "مسحها يسمح للطلاب بمشاهدة نتائجهم مرة أخرى"
                                  : "Clearing lets students view their results again"}
                              </span>
                            </div>
                          </label>

                          <label
                            className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-muted/40"
                            htmlFor={`reset-bindings-${exam.id}`}
                          >
                            <Checkbox
                              id={`reset-bindings-${exam.id}`}
                              checked={resetBindings}
                              onCheckedChange={(v) =>
                                setResetBindings(v === true)
                              }
                              className="mt-0.5"
                            />
                            <div className="min-w-0">
                              <span className="block text-sm font-medium">
                                {locale === "ar"
                                  ? "ربط الأجهزة (Anti-sharing)"
                                  : "Device bindings (Anti-sharing)"}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {locale === "ar"
                                  ? "مسحها يسمح بالبحث من أي جهاز جديد"
                                  : "Clearing allows searching from any new device"}
                              </span>
                            </div>
                          </label>
                        </div>

                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("common.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleTrackingReset}
                            disabled={!resetViews && !resetBindings}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                          >
                            {t("common.confirm")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Export */}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleTrackingExport}
                      disabled={trackingExporting}
                      className="gap-1.5"
                    >
                      {trackingExporting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Download className="size-3.5" />
                      )}
                      {locale === "ar" ? "تصدير" : "Export"}
                    </Button>

                    {/* Import */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={trackingImporting}
                      onClick={() => {
                        const input = document.getElementById(
                          `tracking-import-${exam.id}`,
                        ) as HTMLInputElement | null;
                        input?.click();
                      }}
                      className="gap-1.5"
                    >
                      {trackingImporting ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      {locale === "ar" ? "استيراد" : "Import"}
                    </Button>
                    <input
                      id={`tracking-import-${exam.id}`}
                      type="file"
                      accept="application/json,.json"
                      className="sr-only"
                      onChange={handleTrackingImport}
                    />
                  </div>

                  <p className="text-[11px] text-muted-foreground">
                    {locale === "ar"
                      ? "تصدير يحفظ بيانات التتبع كملف JSON. استيراد يستعيد البيانات من ملف JSON. إعادة تعيين يمسح كل البيانات."
                      : "Export saves tracking data as a JSON file. Import restores data from a JSON file. Reset clears all data."}
                  </p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2 rounded-lg"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                {t("common.save")}
              </Button>
            </div>
          </CardContent>
        </motion.div>
      )}

      {/* When collapsed, show a quick summary chip */}
      {!open && (
        <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3 text-primary" />
            {t("admin.thresholdLabel")}: {successThreshold}%
          </span>
          {successGroupUrl && (
            <span className="inline-flex items-center gap-1">
              <Link2 className="size-3" />
              {locale === "ar" ? "رابط مُفعّل" : "Link set"}
            </span>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  checked,
  onCheckedChange,
  title,
  desc,
  icon,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  title: string;
  desc: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-background p-3">
      <div className="flex items-start gap-2.5">
        {icon && (
          <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
        )}
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-[11px] text-muted-foreground">{desc}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
