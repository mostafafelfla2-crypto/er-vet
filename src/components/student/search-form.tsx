"use client";

import { useState } from "react";
import { Search, Loader2, MailWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/utils";
import type { ResultPayload } from "@/components/student/result-card";

interface SearchFormProps {
  examId: string;
  onResult: (result: ResultPayload | null, errorKey: string | null) => void;
}

/** Email search form. Calls /api/result and surfaces server errors as i18n keys. */
export function SearchForm({ examId, onResult }: SearchFormProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !examId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await fetch("/api/result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), examId }),
      });
      const data = await res.json();
      if (!res.ok) {
        const key = mapError(data.error);
        setErrorKey(key);
        onResult(null, key);
        return;
      }
      onResult(data as ResultPayload, null);
    } catch {
      setErrorKey("student.connectionError");
      onResult(null, "student.connectionError");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="student-email" className="text-sm font-medium">
          {t("student.emailLabel")}
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
          <Input
            id="student-email"
            type="email"
            required
            dir="ltr"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("student.emailPlaceholder")}
            className={cn(
              "h-11 rounded-xl bg-background text-sm ltr:pl-9 ltr:pr-3 rtl:pl-3 rtl:pr-9",
              errorKey && "border-destructive/60 focus-visible:ring-destructive/40",
            )}
          />
        </div>
      </div>

      <Button
        type="submit"
        disabled={loading}
        className="h-11 w-full gap-2 rounded-xl text-sm font-semibold shadow-soft"
      >
        {loading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {t("student.searching")}
          </>
        ) : (
          <>
            <Search className="size-4" />
            {t("student.submit")}
          </>
        )}
      </Button>

      {errorKey && (
        <Alert variant="destructive" className="mt-1 gap-2 rounded-xl">
          <MailWarning className="size-4" />
          <AlertTitle className="text-sm">
            {t("errors.serverError")}
          </AlertTitle>
          <AlertDescription className="text-xs">
            {t(errorKey as never)}
          </AlertDescription>
        </Alert>
      )}
    </form>
  );
}

/** Map server error codes to client-side translation keys. */
function mapError(code: string | undefined): string {
  switch (code) {
    case "missing_fields":
    case "invalid_email":
      return "errors.invalidEmail";
    case "exam_not_found":
      return "student.noDataFile";
    case "no_data_file":
      return "student.noDataFile";
    case "no_result":
      return "student.noResult";
    case "already_viewed":
      return "student.alreadyViewed";
    case "device_blocked":
      return "student.deviceBlocked";
    default:
      return "student.connectionError";
  }
}
