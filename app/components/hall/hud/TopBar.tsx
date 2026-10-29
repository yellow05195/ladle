"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useEffect, useState } from "react";
import { BRAND } from "../../../../config/brand";
import { useT } from "../../../i18n/client";
import { HIcon } from "../../ui/icons";
import { PlayerPlate } from "../profile/PlayerPlate";
import { useProfile } from "../profile/ProfileProvider";
import { SoundToggle } from "./SoundToggle";
import { onScrollY, scrollState } from "../tour/scroll";

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
export const TopBar = memo(function TopBar({ solid = false, room = false }: { solid?: boolean; room?: boolean }) {
  const t = useT();
  const path = usePathname();
  const { pubkey, profile, takeSeat } = useProfile();
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [path]);
  // the home: the bar's Play appears once the playbill's own ticket is gone (faded on wide screens, scrolled under the bar when stacked).
  // v21.3: from the hall's one scroll reader against the ticket's measured place (measured on resize and when the playbill
  // changes size, never on a scroll frame)
  const home = path === "/" && !solid;
  const [past, setPast] = useState(false);
  useEffect(() => {
    if (!home) { setPast(false); return; }
    let keyBottom = -Infinity, barH = 80, wide = true, was: boolean | null = null;
    const put = (y: number) => {
      const v = Number.isFinite(keyBottom) && (wide ? y > 0.26 * (scrollState.vh || 800) : keyBottom - y < barH + 4);
      if (v !== was) { was = v; setPast(v); }
    };
    const measure = () => {
      const tk = document.querySelector(".playbill .key.main");
      barH = document.querySelector(".tb")?.getBoundingClientRect().height ?? 80;
      wide = window.innerWidth >= 1100;
      keyBottom = tk ? tk.getBoundingClientRect().bottom + window.scrollY : -Infinity;
      put(scrollState.y);
    };
    const off = onScrollY(put);
    measure();
    const ro = new ResizeObserver(measure);
    const pb = document.querySelector(".playbill");
    if (pb) ro.observe(pb);
    window.addEventListener("resize", measure);
    return () => { off(); ro.disconnect(); window.removeEventListener("resize", measure); };
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
          {/* the same six as the desktop nav (/brand stays in the footer) */}
          {[{ href: "/odds", k: "h.nav.odds" }, { href: "/window/latest", k: "h.nav.verify" }, { href: "/integrate", k: "h.nav.integrate" }, { href: "/security", k: "h.nav.security" }, { href: "/about", k: "h.nav.about" }].map((m) => (
            <Link key={m.href} className="m" href={m.href} aria-current={current(m.href)}>{t(m.k as Parameters<typeof t>[0])}</Link>
          ))}
          <div className="msh-foot">
            {seated ? <PlayerPlate full /> : <button type="button" className="key main wide" onClick={() => { setMenu(false); takeSeat(); }}>{t("h.nav.connect")}</button>}
          </div>
        </nav>
      ) : null}
    </header>
  );
});
