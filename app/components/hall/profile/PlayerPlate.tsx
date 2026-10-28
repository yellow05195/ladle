"use client";

import { formatGenesis } from "../../../lib/profile";
import { useProfile } from "./ProfileProvider";
import { thumbUrl } from "./thumb";

/**
 * The player plate (v21.1, §7.10): a 36 px round portrait on a well disc, the
 * name over the Genesis number. It opens the check-in sheet at the character
 * step. Phones show the portrait only.
 */
export function PlayerPlate({ full = false }: { full?: boolean }) {
  const { profile, openProfile } = useProfile();
  if (!profile) return null;
  const g = profile.genesis ? formatGenesis(profile.genesis).replace(/^#?/, "No. ") : null;
  return (
    <button type="button" className="pplate" onClick={openProfile} aria-label={`${profile.nickname}${g ? `, ${g}` : ""}: edit your character`}>
      <span className="face">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbUrl(profile.species, profile.scarf)} alt="" width={44} height={44} decoding="async" />
      </span>
      <span className="pplate-text" style={full ? { display: "grid" } : undefined}>
        <b>{profile.nickname}</b>
        {g ? <small>{g}</small> : null}
      </span>
    </button>
  );
}
