import type { MetadataRoute } from "next";
import { BRAND } from "../../config/brand";

/** The web app manifest (v18): the Ladle name, the charcoal page, the primary mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: `${BRAND.tagline} ${BRAND.secondLine}`,
    start_url: "/",
    display: "standalone",
    background_color: "#15110E",
    theme_color: "#15110E",
    icons: [
      { src: "/icon.png", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
      { src: BRAND.assets.avatar, sizes: "1000x1000", type: "image/png", purpose: "any" },
    ],
  };
}
