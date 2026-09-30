import type { Metadata, Viewport } from "next";

import { siteUrl } from "@/lib/site-url";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * Tek bir aile: Inter. `latin-ext` alt kumesi Turkce karakterler (ğ ş ı İ ç ö ü)
 * icin gerekli — yalnizca `latin` ile bu harfler yedek yazi tipinden gelip
 * satir icinde gorunur bir bicim farki yaratiyor.
 */
const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const viewport: Viewport = {
  // Safari'nin ust cubugu ve telefonun durum cubugu siteyle ayni siyah.
  themeColor: "#0c0b0a",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  openGraph: { siteName: "Vitrin", locale: "tr_TR", type: "website" },
  twitter: { card: "summary_large_image" },
  title: "Vitrin — Kuyumcu ürün görseli",
  description:
    "Kuyum ürünü fotoğraflarının arka planını yapay zekâ ile kaldırın ve satışa hazır görseller elde edin.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="tr" className={`${sans.variable} h-full antialiased`}>
      <body className="bg-background text-foreground flex min-h-full flex-col">
        {children}
      </body>
    </html>
  );
}
