import "./site.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "../i18n/server";
import { TopBar } from "../components/hall/hud/TopBar";
import { Arr } from "../components/hall/sections/kit";

export const metadata: Metadata = { title: "Not found", robots: { index: false } };

/** The 404 (v21.1, §7.23): the inner top bar, then 5/7: a Display L line in one roman voice, one sentence, the way back; the hall poster at the right on a plate's corners. The rail sits below. */
export default async function NotFound() {
  const { t } = await getDict();
  return (
    <div className="nf-page relative flex flex-col">
      <TopBar solid />
      <main className="pg-site flex-1 [overflow-x:clip]">
        <section className="nf" aria-labelledby="nf-title">
          <div className="in">
            <div className="pg-split">
              <div className="c5 nf-txt">
                <span className="label">404</span>
                <h1 id="nf-title" className="display-l">{t("h.404.l1")} {t("h.404.l2")}</h1>
                <p className="body">{t("h.404.lead")}</p>
                <div><Link href="/" className="act">{t("h.404.home")}<Arr /></Link></div>
              </div>
              <div className="c7"><div className="poster" aria-hidden="true" /></div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
