"use client";

import { Languages, Moon, Sun, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useI18n } from "@/i18n/i18n-provider";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  /** Optional trailing slot (e.g. admin back-link). */
  trailing?: React.ReactNode;
  /** Hide the brand mark — used on the admin login screen. */
  compact?: boolean;
}

/**
 * Application header shared by student and admin surfaces.
 * - Right side (RTL): brand mark + name
 * - Left side (RTL): theme + language toggles
 */
export function SiteHeader({ trailing, compact }: SiteHeaderProps) {
  const { t, locale, toggleLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();

  return (
    <TooltipProvider delayDuration={200}>
      <header
        className={cn(
          "sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-md",
          "supports-[backdrop-filter]:bg-background/60",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3",
            compact && "py-2.5",
          )}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-soft">
              <GraduationCap className="size-5" />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold tracking-tight sm:text-base">
                {t("common.appName")}
              </p>
              <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
                {locale === "ar"
                  ? "Exam Results Portal"
                  : "بوابة نتائج الامتحانات"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {trailing}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleTheme}
                  aria-label={t("theme.toggle")}
                  className="size-9 rounded-lg"
                >
                  {theme === "dark" ? (
                    <Sun className="size-4" />
                  ) : (
                    <Moon className="size-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === "dark" ? t("theme.light") : t("theme.dark")}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleLocale}
                  className="gap-1.5 rounded-lg px-2.5"
                  aria-label="Toggle language"
                >
                  <Languages className="size-4" />
                  <span className="text-xs font-medium">
                    {locale === "ar" ? "EN" : "ع"}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("language.toggle")}</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>
    </TooltipProvider>
  );
}
