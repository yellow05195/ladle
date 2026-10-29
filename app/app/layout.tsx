import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BRAND } from "../../config/brand";
import { getDict } from "../i18n/server";
import { I18nProvider } from "../i18n/client";
import { WalletProviders } from "../components/wallet/WalletProviders";
import { ProfileProvider } from "../components/hall/profile/ProfileProvider";
import { ProfileFlow } from "../components/hall/profile/ProfileFlow";
import { ConservedBar } from "../components/hall/hud/ConservedBar";
import { DemoTag } from "../components/ui/DemoTag";
import { LightTag } from "../components/ui/LightTag";
import { ClosingNotice } from "../components/live/ClosingNotice";
import { InlineScript } from "../components/InlineScript";
import "./globals.css";
import "./hall.css";

/**
 * v21.1 type: one family, born from the wordmark. Figtree (OFL), self-hosted
 * from the full upstream variable file (wght 400-900, latin subset, built with
 * fontTools; app/public/assets/ASSETS.md), because the Google-served files
 * drop ss01 (the wordmark's single-storey a) and ss02. No italic is loaded.
 */
const figtree = localFont({
  src: [{ path: "../public/fonts/figtree-latin.woff", weight: "400 900", style: "normal" }],
  variable: "--font-figtree",
  display: "swap",
  fallback: ["system-ui", "Segoe UI", "Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: `${BRAND.tagline} ${BRAND.secondLine}`,
  applicationName: BRAND.name,
  metadataBase: new URL(`https://${BRAND.domain}`),
  openGraph: { siteName: BRAND.name, title: BRAND.name, description: `${BRAND.tagline} ${BRAND.secondLine}`, images: [{ url: "/og.png", width: 1200, height: 630, alt: `${BRAND.name}: ${BRAND.tagline}` }] },
  twitter: { card: "summary_large_image", site: `@${BRAND.xHandle}`, title: BRAND.name, description: BRAND.tagline, images: ["/og.png"] },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#16120F",
  colorScheme: "dark",
  viewportFit: "cover",
};

/** Repeat visits in the session: the server-rendered loader never flashes (read before the first paint). */
const LOADED_SCRIPT = `try{if(sessionStorage.getItem("ladle.loaded"))document.documentElement.dataset.loaded="1"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, dict } = await getDict();
  return (
    <html lang={locale} className={figtree.variable} suppressHydrationWarning>
      <head>
        <InlineScript html={LOADED_SCRIPT} />
      </head>
      <body>
        <I18nProvider locale={locale} dict={dict}>
          <WalletProviders>
            <ProfileProvider>
              {children}
              <ProfileFlow />
              <DemoTag />
              <LightTag />
              <ClosingNotice />
              <ConservedBar />
            </ProfileProvider>
          </WalletProviders>
        </I18nProvider>
      </body>
    </html>
  );
}
