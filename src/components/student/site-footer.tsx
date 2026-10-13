"use client";

import { ShieldCheck } from "lucide-react";
import { useI18n } from "@/i18n/i18n-provider";

/** Site footer. Sticks to the bottom on short pages, pushed down on long ones. */
export function SiteFooter() {
  const { t, locale } = useI18n();
  const year = new Date().getFullYear();
  return (
    <footer className="mt-auto w-full border-t border-border/60 bg-background/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-5 text-center sm:flex-row sm:text-start">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" />
          <span>
            {locale === "ar"
              ? "نتائجك محمية بآلية تحقق وتشفير. يُمنع مشاركة بياناتك."
              : "Your results are protected with verification & encryption. Do not share your data."}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          © {year} · {t("common.appName")}
        </p>
      </div>
    </footer>
  );
}
