import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

const PATHS = ["", "/paketler", "/katalog", "/cekim-rehberi", "/bulten", "/destek", "/kvkk", "/gizlilik", "/kullanim-kosullari"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({ url: `${siteUrl()}${path}`, changeFrequency: path === "" ? "weekly" : "monthly" }));
}
