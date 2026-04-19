import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:2003";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number; freq: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1.0, freq: "weekly" },
    { path: "/product", priority: 0.8, freq: "weekly" },
    { path: "/sectors", priority: 0.8, freq: "weekly" },
    { path: "/detectors", priority: 0.8, freq: "weekly" },
    { path: "/docs", priority: 0.7, freq: "monthly" },
  ];
  return routes.map(({ path, priority, freq }) => ({
    url: `${BASE}${path}`,
    lastModified: now,
    changeFrequency: freq,
    priority,
  }));
}
