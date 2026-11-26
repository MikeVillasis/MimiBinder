import type { GlitterTier } from "@/lib/fun";

/**
 * The glitter layer (fun layer; "Glitter" in globals.css): fixed specks (a CSS mask) over a light field that
 * slides with --gx / --gy. Place it inside a positioned, rounded box over the art; HoloCard does this for
 * thumbnails. `big` is the inspector's version: it travels further, follows --gs (how squarely the face
 * catches the light) and adds a rainbow wash on prismatic cards. Its own file so CardInspector and fun.tsx
 * can both use it without importing each other.
 */
export function Glitter({ tier, big = false }: { tier: GlitterTier; big?: boolean }) {
  if (tier === "none") return null;
  return (
    <>
      {big && tier === "prismatic" && <span className="glitter-wash" aria-hidden="true" />}
      <span className={big ? "holo-glitter glitter-big" : "holo-glitter"} data-glitter={tier} aria-hidden="true">
        <i />
      </span>
    </>
  );
}
