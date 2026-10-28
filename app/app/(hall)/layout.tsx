import { LiveProvider } from "../../components/live/LiveProvider";
import { HallCanvas } from "../../components/hall/HallCanvas";
import { HallLoader } from "../../components/hall/HallLoader";

/**
 * The hall (v21): / and /play share one persistent canvas. Each route is a
 * camera shot on it, never a remount. The loader plays on the first visit
 * of the session. The conserved rail and the demo tag live in the root
 * layout, on every route.
 */
export default function HallLayout({ children }: { children: React.ReactNode }) {
  return (
    <LiveProvider>
      <HallCanvas />
      <HallLoader />
      <main id="main" className="relative">{children}</main>
    </LiveProvider>
  );
}
