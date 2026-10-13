import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";
import { DEFAULT_LOCALE } from "@/i18n/translations";

export const metadata: Metadata = {
  title: "بوابة نتائج الامتحانات | Exam Results Portal",
  description:
    "بوابة إلكترونية لعرض نتائج الامتحانات بشكل آمن وسريع. A secure portal for viewing exam results.",
  keywords: [
    "نتائج",
    "امتحانات",
    "exams",
    "results",
    "students",
    "portal",
  ],
  icons: {
    icon: "/favicon.svg",
  },
};

// Default to Arabic + RTL before client hydration to avoid a flash.
export const viewport = {
  themeColor: "#0f766e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={DEFAULT_LOCALE} dir="rtl" suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground min-h-screen">
        <Providers>{children}</Providers>
        <Toaster />
        <SonnerToaster position="top-center" richColors />
      </body>
    </html>
  );
}
