"use client";

import { useEffect, useState } from "react";
import { useT } from "../../../i18n/client";
import { onSound, setSound, soundOn } from "../../../lib/sfx";
import { HIcon } from "../../ui/icons";

/** Sound (v21, §8.3 icon button): off by default; the choice is remembered; the first sound only after a click. */
export function SoundToggle() {
  const t = useT();
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(soundOn()); return onSound(setOn); }, []);
  return (
    <button type="button" className="icon-btn" aria-pressed={on} aria-label={on ? t("h.sound.on") : t("h.sound.off")} onClick={() => setSound(!on)}>
      <HIcon name={on ? "speaker" : "speaker-off"} />
    </button>
  );
}
