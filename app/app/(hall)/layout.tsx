import { preload } from "react-dom";
import { LiveProvider } from "../../components/live/LiveProvider";
import { HallCanvas } from "../../components/hall/HallCanvas";
import { HallLoader } from "../../components/hall/HallLoader";

/**
 * v21.4 (perf F10): the downloads the loader waits on start with the HTML, not after hydration and the canvas chunk
 * (they started about 0.6 s later): the environment HDR (wide screens only, roughly the high tier, so a phone never
 * fetches its 1.3 MB; low priority, so the page's own scripts go first), the drum's cradle, and the floor and marble
 * colour maps. Each request matches its loader's, or the browser downloads it twice: three's FileLoader (HDR, GLB) and
 * ImageBitmapLoader (the room's maps, components/hall/assets.ts) both fetch() in cors mode with same-origin credentials,
 * which is a fetch preload with crossorigin="anonymous". The URLs are the loaders' own (env.ts ENV_HDR, DrumAssembly,
 * HallScene).
 */
function preloadHall() {
  preload("/assets/hdri/warm_bar_1k.hdr", { as: "fetch", crossOrigin: "anonymous", media: "(min-width: 768px)", fetchPriority: "low" });
  preload("/assets/models/higgsfield/drum-cradle-1k.glb", { as: "fetch", crossOrigin: "anonymous" });
  preload("/assets/textures/WoodFloor064/WoodFloor064_color.webp", { as: "fetch", crossOrigin: "anonymous", fetchPriority: "low" });
  preload("/assets/textures/Marble016/Marble016_color.webp", { as: "fetch", crossOrigin: "anonymous", fetchPriority: "low" });
}

/**
 * The hall (v21): / and /play share one persistent canvas. Each route is a
 * camera shot on it, never a remount. The loader plays on the first visit
 * of the session. The conserved rail and the demo tag live in the root
 * layout, on every route.
 */
export default function HallLayout({ children }: { children: React.ReactNode }) {
  preloadHall();
  return (
    <LiveProvider>
      <HallCanvas />
      <HallLoader />
      <main id="main" className="relative">{children}</main>
    </LiveProvider>
  );
}
