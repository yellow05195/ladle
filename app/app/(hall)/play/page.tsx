import type { Metadata } from "next";
import { Suspense } from "react";
import { RoomHud } from "../../../components/hall/hud/RoomHud";
import { gameFacts } from "../../../lib/game-facts";

export const metadata: Metadata = { title: "The game room" };

/** The game room (v20): the same hall, the camera closer; the round chat, the dock, the reveal. `?watch=1` opens it as a spectator. */
export default function PlayPage() {
  return (
    <Suspense fallback={null}>
      <RoomHud facts={gameFacts()} />
    </Suspense>
  );
}
