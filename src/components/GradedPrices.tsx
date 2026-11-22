"use client";

import { useAssessments } from "@/lib/db";
import { gradedLinks, gradedSearchQuery } from "@/lib/graded-links";
import type { CardDetail } from "@/lib/types";
import { ListGroup, ListRow } from "./ui";

/**
 * "PSA prices" on the card page. MimiBinder has no graded price data yet, so this links to recent graded
 * sales on other sites, searched for this exact card, plus the centering check (centering caps the grade).
 */
export function GradedPrices({ card }: { card: CardDetail }) {
  const q = gradedSearchQuery(card);
  const saved = useAssessments(card.id);
  const latest = saved?.[0];
  return (
    <ListGroup
      title="PSA prices"
      footer={
        <>
          Recent graded sales on other sites, searched for “{q}”. Opens in a new tab; check the listing matches your
          card (set, number and language). Graded prices aren&apos;t stored in MimiBinder yet.
        </>
      }
    >
      {gradedLinks(card).map((l) => (
        <ListRow key={l.href} href={l.href} external title={l.label} subtitle={l.hint} ariaLabel={`${l.label} (opens in a new tab)`} />
      ))}
      <ListRow
        href={`/centering?card=${encodeURIComponent(card.id)}`}
        title="What grade could my copy get?"
        subtitle={
          latest
            ? `${saved!.length} saved ${saved!.length === 1 ? "check" : "checks"}${latest.probableCeiling != null ? `: latest probable ceiling PSA ${latest.probableCeiling}` : ""}${latest.actual ? `, PSA returned ${latest.actual.grade || "Authentic"}` : ""}`
            : "Check centering, corners and edges from photos: the best PSA grade they allow"
        }
      />
    </ListGroup>
  );
}
