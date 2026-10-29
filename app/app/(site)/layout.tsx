import "../site.css";
import "../deco.css";
import { TopBar } from "../../components/hall/hud/TopBar";
import { SiteFooter } from "../../components/SiteFooter";
import { ScrollRefresh } from "../../components/motion/ScrollRefresh";
import { ScrollReveal } from "../../components/motion/ScrollReveal";
import { Shortcuts } from "../../components/fx/Shortcuts";

/** The inner pages (v21.1, §7.23): the solid top bar, the page on one flat ground, the footer. No canvas. The conserved rail and the demo tag come from the root layout. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col">
      <ScrollRefresh />
      <ScrollReveal />
      <Shortcuts />
      <TopBar solid />
      <main id="main" className="pg-site pg-site-main">{children}</main>
      <SiteFooter />
    </div>
  );
}
