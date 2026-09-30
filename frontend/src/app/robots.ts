import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

/** Arayuz ve hesap sayfalari taranmasin; API ve oturumlu sayfalar zaten kapali. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/hesap", "/odeme/", "/auth/"] }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
