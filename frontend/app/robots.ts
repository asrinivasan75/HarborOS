import type { MetadataRoute } from "next";

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:2003";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/product", "/sectors", "/detectors", "/docs"],
        disallow: ["/dashboard", "/report"],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
