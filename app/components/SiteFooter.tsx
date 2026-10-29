import Link from "next/link";
import { BRAND } from "../../config/brand";
import { getDict } from "../i18n/server";
import { DATA_SOURCE } from "../lib/data";
import { MAINNET } from "../lib/data/cluster";
import { Arr } from "./ui/house";

/**
 * The footer (v21.1, §7.24): on the deepest ground, no rules. The wordmark
 * and the tagline in the display voice; three link columns headed by plate
 * titles; the X account; one fine source line. The conserved sentence is the
 * rail's, never repeated here.
 */
export async function SiteFooter() {
  const { t } = await getDict();
  const [a, b] = (() => { const i = BRAND.tagline.indexOf(". "); return [BRAND.tagline.slice(0, i + 1), BRAND.tagline.slice(i + 2)]; })();
  const lists: Array<{ head: string; links: Array<{ href: string; label: string }> }> = [
    { head: t("h.foot.play"), links: [{ href: "/", label: t("h.foot.hall") }, { href: "/play?watch=1", label: t("h.play.watch") }] },
    { head: t("h.foot.learn"), links: [{ href: "/#how", label: t("h.nav.how") }, { href: "/odds", label: t("h.nav.odds") }, { href: "/window/latest", label: t("h.nav.verify") }, { href: "/security", label: t("h.nav.security") }] },
    { head: t("h.foot.build"), links: [{ href: "/integrate", label: t("h.nav.integrate") }, { href: "/brand", label: t("h.nav.brand") }, { href: "/about", label: t("h.nav.about") }] },
  ];
  return (
    <footer className="foot">
      <div className="in">
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BRAND.assets.wordmark} alt={BRAND.name} width={123} height={48} loading="lazy" />
          <p className="display-m"><span>{a}</span><span>{b}</span></p>
        </div>
        <nav className="cols" aria-label={t("h.foot.links")}>
          {lists.map((l) => (
            <div key={l.head}>
              <span className="title">{l.head}</span>
              <ul>{l.links.map((x) => <li key={x.href}><Link href={x.href}>{x.label}</Link></li>)}</ul>
            </div>
          ))}
        </nav>
        <div className="meta-row">
          <a className="act" href={BRAND.xUrl} target="_blank" rel="noreferrer">{t("h.foot.x", { x: BRAND.xHandle })}<Arr ch="↗" /></a>
          {/* the source line follows the build: demo, devnet (test SOL) or mainnet (real SOL) */}
          <span className="fine">{DATA_SOURCE === "demo" ? t("h.foot.demo") : MAINNET ? t("h.foot.mainnet") : t("h.foot.devnet")}</span>
        </div>
      </div>
    </footer>
  );
}
