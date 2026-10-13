"use client";

import { useCallback, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useI18n } from "@/i18n/i18n-provider";
import { RESULTS_SECRET_CODE } from "@/lib/exam/config";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface UploadCenterProps {
  onUploaded: () => void;
}

/** Drag-and-drop + manual file picker for uploading exam Excel files. */
export function UploadCenter({ onUploaded }: UploadCenterProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [examName, setExamName] = useState("");
  const [displayNameAr, setDisplayNameAr] = useState("");
  const [displayNameEn, setDisplayNameEn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setExamName("");
    setDisplayNameAr("");
    setDisplayNameEn("");
    setFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const onFileSelected = (selected: File | null) => {
    setError(null);
    if (!selected) {
      setFile(null);
      return;
    }
    if (!/\.xlsx?$/i.test(selected.name)) {
      setError(t("admin.invalidExcel"));
      return;
    }
    setFile(selected);
  };

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const dropped = e.dataTransfer.files?.[0] ?? null;
      onFileSelected(dropped);
    },
    [],
  );

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError(t("admin.invalidExcel"));
      return;
    }
    if (!examName.trim()) {
      setError(t("admin.uploadError"));
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("examName", examName.trim());
      if (displayNameAr.trim()) formData.append("displayNameAr", displayNameAr.trim());
      if (displayNameEn.trim()) formData.append("displayNameEn", displayNameEn.trim());

      const res = await fetch("/api/admin/exams", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        const key =
          data.error === "invalid_excel"
            ? "admin.invalidExcel"
            : data.error === "invalid_format"
              ? "admin.invalidExcel"
              : "admin.uploadError";
        setError(t(key as never));
        return;
      }
      toast.success(t("admin.uploadSuccess"));
      reset();
      onUploaded();
    } catch {
      setError(t("admin.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className="border-border/70 shadow-card">
      <CardHeader className="gap-1.5 pb-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <UploadCloud className="size-4 text-primary" />
          {t("admin.uploadCenter")}
        </CardTitle>
        <CardDescription className="text-xs">{t("admin.uploadDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exam-name" className="text-sm font-medium">
                {t("admin.examNameLabel")}
              </Label>
              <Input
                id="exam-name"
                required
                value={examName}
                onChange={(e) => setExamName(e.target.value)}
                placeholder={t("admin.examNamePlaceholder")}
                className="h-10 rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="display-ar" className="text-sm font-medium">
                {t("admin.displayNameArLabel")}
              </Label>
              <Input
                id="display-ar"
                value={displayNameAr}
                onChange={(e) => setDisplayNameAr(e.target.value)}
                placeholder={t("admin.examNamePlaceholder")}
                className="h-10 rounded-lg"
                dir="rtl"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display-en" className="text-sm font-medium">
              {t("admin.displayNameEnLabel")}
            </Label>
            <Input
              id="display-en"
              value={displayNameEn}
              onChange={(e) => setDisplayNameEn(e.target.value)}
              placeholder={t("admin.examNamePlaceholder")}
              className="h-10 rounded-lg"
              dir="ltr"
            />
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={cn(
              "group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-muted/40",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="sr-only"
              onChange={(e) => onFileSelected(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <>
                <div className="grid size-11 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                  <FileSpreadsheet className="size-5" />
                </div>
                <div className="flex items-center gap-2">
                  <p className="max-w-[200px] truncate text-sm font-medium" dir="ltr">
                    {file.name}
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    className="grid size-6 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove file"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </>
            ) : (
              <>
                <div
                  className={cn(
                    "grid size-11 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary",
                  )}
                >
                  <UploadCloud className="size-5" />
                </div>
                <p className="text-sm font-medium">{t("admin.dropFile")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t("admin.supportedFormats")}
                </p>
              </>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-[11px] text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p>
              {t("admin.secretNote")}{" "}
              <code className="rounded bg-background px-1 py-0.5 font-mono text-[10px]">
                results-{"{"}
                {t("admin.examNameLabel")}
                {"}-"}
                {RESULTS_SECRET_CODE}.xlsx
              </code>
            </p>
          </div>

          {error && (
            <Alert variant="destructive" className="rounded-xl">
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="submit"
            disabled={uploading || !file || !examName.trim()}
            className="h-11 w-full gap-2 rounded-xl text-sm font-semibold shadow-soft sm:w-auto sm:px-8"
          >
            {uploading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("admin.uploading")}
              </>
            ) : (
              <>
                <UploadCloud className="size-4" />
                {t("admin.upload")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
