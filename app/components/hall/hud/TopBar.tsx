"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import { HIcon } from "../../ui/icons";
import { PlayerPlate } from "../profile/PlayerPlate";
import { useProfile } from "../profile/ProfileProvider";
import { SoundToggle } from "./SoundToggle";

/**
 * The top bar (v21.1, §7.10). Hall routes: no surface (the top scrim reads
 * it), the 34 px wordmark (the demo tag sits 22 px right of it), the nav,
 * the speaker and "Connect wallet" (a secondary key) or the player plate;
 * /play keeps only the speaker and the plate. Inner pages: a solid deepest
 * band, the current page marked by a 4 px cream stem under the word. Phones:
 * 56 px, solid, the wordmark, the speaker and a menu plate down to the rail.
 * On the home, once the playbill (and its Play key) has scrolled away, a
 * compact Play key joins the bar, so the main action stays one press away.
 */
export function TopBar({ solid = false, room = false }: { solid?: boolean; room?: boolean }) {
  const t = useT();
  const path = usePathname();
  const { pubkey, profile, takeSeat } = useProfile();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  // the home: the bar's Play appears once the playbill's own ticket is gone (faded on wide screens, scrolled under the bar when stacked)
  const home = path === "/" && !solid;
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!home) { setPast(false); return; }
    let raf = 0;
    const put = () => {
      raf = 0;
      const tk = document.querySelector(".playbill .key.main");
      if (!tk) { setPast(false); return; }
      const top = document.querySelector(".tb")?.getBoundingClientRect().height ?? 80;
      setPast(window.innerWidth >= 1100 ? window.scrollY > 0.26 * window.innerHeight : tk.getBoundingClientRect().bottom < top + 4);
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(put); };
    put();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => { window.removeEventListener("scroll", on); window.removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, [home]);
  useEffect(() => {
    if (!menu) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [menu]);
  const nav = solid
    ? [{ href: "/#how", label: t("h.nav.how") }, { href: "/odds", label: t("h.nav.odds") }, { href: "/window/latest", label: t("h.nav.verify") }, { href: "/integrate", label: t("h.nav.integrate") }, { href: "/security", label: t("h.nav.security") }, { href: "/about", label: t("h.nav.about") }]
    : [{ href: "#how", label: t("h.nav.how") }, { href: "/odds", label: t("h.nav.odds") }, { href: "/window/latest", label: t("h.nav.verify") }];
  const current = (href: string) => (path === href || (href.startsWith("/window") && path?.startsWith("/window")) ? "page" : undefined);
  const seated = !!(pubkey && profile);
  return (
    <header className={`tb ${solid ? "inner" : "hall"}`}>
      <Link href="/" className="tb-mark" aria-label={t("h.nav.home")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={BRAND.assets.wordmark} alt={BRAND.name} width={87} height={34} />
      </Link>
      <div className="tb-right">
        {!room ? (
          <nav className="tb-nav" aria-label="Main">
            {nav.map((n) => <Link key={n.href} href={n.href} aria-current={current(n.href)}>{n.label}</Link>)}
          </nav>
        ) : null}
        <div className="tb-tools">
          {home && past ? <button type="button" className="key main s tb-play" onClick={takeSeat}>{t("h.nav.play")}</button> : null}
          {!solid ? <SoundToggle /> : null}
          {seated ? <PlayerPlate /> : <button type="button" className="key sec s" onClick={takeSeat}>{t("h.nav.connect")}</button>}
          <button type="button" className="icon-btn only-phone" aria-label={t("h.nav.menu")} aria-expanded={menu} aria-controls="menu-sheet" onClick={() => setMenu((m) => !m)}>
            <HIcon name={menu ? "close" : "menu"} />
          </button>
        </div>
      </div>
      {menu ? (
        <nav id="menu-sheet" className="menu-sheet" aria-label={t("h.nav.menu")}>
          <Link className="m" href="/#how">{t("h.nav.how")}</Link>
          {[{ href: "/odds", k: "h.nav.odds" }, { href: "/window/latest", k: "h.nav.verify" }, { href: "/integrate", k: "h.nav.integrate" }, { href: "/security", k: "h.nav.security" }, { href: "/about", k: "h.nav.about" }, { href: "/brand", k: "h.nav.brand" }].map((m) => (
            <Link key={m.href} className="m" href={m.href} aria-current={current(m.href)}>{t(m.k as Parameters<typeof t>[0])}</Link>
          ))}
          <div className="msh-foot">
            {seated ? <PlayerPlate full /> : <button type="button" className="key main wide" onClick={() => { setMenu(false); takeSeat(); }}>{t("h.nav.connect")}</button>}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
