import "../site.css";
import "../tour.css";
import { getDict } from "../../i18n/server";
import { HomeHud } from "../../components/hall/hud/HomeHud";
import { TourDriver } from "../../components/hall/tour/TourDriver";
import { BooksChapter, CurveChapter, GenesisChapter, HostsChapter, HowChapter, QuestionsChapter, RoomChapter, ScoopChapter, TourScrim } from "../../components/hall/tour/Chapters";
import { SiteFooter } from "../../components/SiteFooter";
import { formatInt } from "../../lib/format";
import { maxHostFeeBps, platformFeeBps } from "../../lib/measurements";

/**
 * The home (v21, v21.1): the hall is the first screen (the playbill and the
 * main key, HomeHud); below it the page is a tour of the live hall. The canvas
 * stays fixed behind the whole page and keeps playing; as the reader
 * scrolls, the camera visits what each chapter talks about (tour.ts) and
 * the chapter's text scrolls over it on a side scrim (TourScrim), never on
 * a card: the drum (how a round plays), the crowd (the room), the ladle
 * (the scoop), the floor ticker (the curve), the bear host (open books),
 * the stands and the door (hosts), the scarves (Genesis), then the whole
 * room, dimmed, for the questions and the footer. The conserved rail stays
 * fixed.
 */
export default async function HomePage() {
  const { t, locale } = await getDict();
  const fee = platformFeeBps();
  const hostFee = maxHostFeeBps();
  // five questions on the tour (the risks first); all ten are on /about#questions
  const risk = (i: 1 | 2 | 4) => ({ q: t(`h.faq.r${i}q`), a: t(`h.faq.r${i}a`) });
  const faq = (i: 3 | 5) => ({ q: t(`faq.q${i}`), a: t(`faq.a${i}`, { bps: formatInt(fee.value, locale), host: formatInt(hostFee.value, locale) }) });
  return (
    <>
      <TourDriver />
      <TourScrim />
      <HomeHud />
      <div className="tour">
        <HowChapter />
        <RoomChapter />
        <ScoopChapter />
        <CurveChapter />
        <BooksChapter />
        <HostsChapter />
        <GenesisChapter />
        <QuestionsChapter items={[risk(2), risk(1), risk(4), faq(5), faq(3)]} />
        <div className="tour-foot"><SiteFooter /></div>
      </div>
    </>
  );
}
