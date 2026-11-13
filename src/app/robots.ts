import type { MetadataRoute } from "next";
import { SITE_CONFIG } from "@/lib/config/site";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = SITE_CONFIG.canonicalUrl || "https://www.dabcloud.in";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/boost",
          "/boost/*",
          "/portal-admin",
          "/portal-admin/*",
          "/api/admin/*",
          "/api/portal-admin/*",
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
