import type { Metadata, Viewport } from "next";
import { Inter, Source_Serif_4 } from "next/font/google";
import { SITE_CONFIG } from "@/lib/config/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-source-serif",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.canonicalUrl || "https://www.dabcloud.in"),
  title: {
    default: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    template: `%s | ${SITE_CONFIG.name}`,
  },
  description: SITE_CONFIG.metaDescription,
  keywords: [
    "business acquisitions",
    "buy a business",
    "sell small business",
    "verified financials",
    "SaaS acquisition",
    "M&A marketplace",
    "due diligence",
    "Baton",
    "dabcloud",
  ],
  authors: [{ name: "Baton" }],
  creator: "Baton",
  publisher: "Baton",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_CONFIG.canonicalUrl || "https://www.dabcloud.in",
    title: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    description: SITE_CONFIG.metaDescription,
    siteName: SITE_CONFIG.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_CONFIG.name} | ${SITE_CONFIG.tagline}`,
    description: SITE_CONFIG.metaDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${sourceSerif.variable}`}
    >
      <body className="min-h-screen bg-cloud font-sans text-16 text-ink">
        {children}
      </body>
    </html>
  );
}
