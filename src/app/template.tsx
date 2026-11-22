import type { ReactNode } from "react";

/**
 * Re-mounted on navigation, so each route fades in (opacity only, 160 ms, off under reduced motion).
 * No transform here on purpose: it would become the containing block for position:fixed children
 * (the sticky add bar, sheets).
 */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-fade">{children}</div>;
}
