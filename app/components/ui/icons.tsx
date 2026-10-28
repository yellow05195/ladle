/**
 * The icon set (v21.1): drawn on a 24 px grid, 2 px stroke, butt caps
 * (flat-cut like the lettering) and round joins, in currentColor. No library,
 * no fills, no boxes (only the 36 px well circles hold one).
 */
export type HouseIcon = "speaker" | "speaker-off" | "menu" | "close" | "arrow-right" | "arrow-up" | "arrow-down" | "check" | "copy" | "external" | "enter";

const PATHS: Record<HouseIcon, string> = {
  speaker: "M4 9H8L13 5V19L8 15H4Z M16.5 9C17.8 10.4 17.8 13.6 16.5 15 M19 6.5C21.6 9.2 21.6 14.8 19 17.5",
  "speaker-off": "M4 9H8L13 5V19L8 15H4Z M16.5 9.5L21 14 M21 9.5L16.5 14",
  menu: "M4 9H20 M4 15H20",
  close: "M6 6L18 18 M18 6L6 18",
  "arrow-right": "M4 12H19 M13 6L19 12L13 18",
  "arrow-up": "M12 20V5 M6 11L12 5L18 11",
  "arrow-down": "M12 4V19 M6 13L12 19L18 13",
  check: "M5 12.5L10 17.5L19 7",
  copy: "M9 9H19V19H9Z M5 15V5H15",
  external: "M7 17L17 7 M9 7H17V15",
  enter: "M19 5V13H6 M10 9L6 13L10 17",
};

export function HIcon({ name, size = 20, className = "" }: { name: HouseIcon; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="butt" strokeLinejoin="round" className={className} aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
