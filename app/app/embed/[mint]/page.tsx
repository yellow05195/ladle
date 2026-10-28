import type { Metadata } from "next";
import { Suspense } from "react";
import { LiveProvider } from "../../../components/live/LiveProvider";
import { HallCanvas } from "../../../components/hall/HallCanvas";
import { RoomHud } from "../../../components/hall/hud/RoomHud";
import { gameFacts } from "../../../lib/game-facts";

export const metadata: Metadata = { title: "Embed", robots: { index: false } };

/**
 * The compact room for hosts (v21.1, §7.26), 360 to 420 px wide inside the
 * host's iframe: the top row (the 20 px mark, "Ladle" and the phone demo
 * tag), a hall band (drum assembly and ring A only, high tier off, DPR 1),
 * the phone round band with its progress stem, the stakes and the one main
 * key, the fee line with the host fee written out, and the conserved rail
 * on two lines. No chat: the host's own chat drives it. The parts are the
 * room HUD's (RoomHud with `embed`, styled in hall.css). Served with
 * frame-ancestors * (next.config.ts).
 */
export default async function EmbedPage({ params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  return (
    <div className="embed" data-mint={mint}>
      <LiveProvider>
        <HallCanvas compact />
        <Suspense fallback={null}><RoomHud facts={gameFacts()} embed /></Suspense>
      </LiveProvider>
    </div>
  );
}
