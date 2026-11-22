// Links to graded (PSA) sales for a card on other sites (client-safe, pure). MimiBinder has no graded price
// data of its own yet, so the card page links out instead. Search pages only: nothing is fetched or copied.
import { langOf } from "./lang";
import type { CardDetail } from "./types";

export interface GradedLink {
  label: string;
  hint: string;
  href: string;
}

/** The card number as printed: "199/165", "001/165"; promos and lettered numbers stay as they are ("189", "TG05"). */
export function printedNumber(card: Pick<CardDetail, "localId" | "setOfficialCount" | "setName">): string {
  const id = card.localId;
  const total = card.setOfficialCount;
  if (!/^\d+$/.test(id) || !total || /promo/i.test(card.setName)) return id;
  return `${id}/${String(total).padStart(id.length, "0")}`;
}

/** What people type to find this card on eBay or PSA: "Charizard ex 199/165", "Espeon ex 211/187 Japanese". */
export function gradedSearchQuery(card: Pick<CardDetail, "id" | "name" | "nameEn" | "localId" | "setOfficialCount" | "setName">): string {
  const ja = langOf(card.id) === "ja";
  const name = ja ? (card.nameEn ?? card.name) : card.name;
  const promo = /promo/i.test(card.setName) ? ` ${ja ? "promo" : card.setName.replace(/\s*black star\s*/i, " ").replace(/\s+/g, " ").trim()}` : "";
  return `${name} ${printedNumber(card)}${promo}${ja ? " Japanese" : ""}`.replace(/\s+/g, " ").trim();
}

const ebaySold = (q: string) =>
  `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: q, LH_Sold: "1", LH_Complete: "1" })}`;

export function gradedLinks(card: Pick<CardDetail, "id" | "name" | "nameEn" | "localId" | "setOfficialCount" | "setName">): GradedLink[] {
  const q = gradedSearchQuery(card);
  return [
    { label: "PSA 10 sold on eBay", hint: "Recent sold listings", href: ebaySold(`${q} PSA 10`) },
    { label: "PSA 9 sold on eBay", hint: "Recent sold listings", href: ebaySold(`${q} PSA 9`) },
    { label: "All PSA grades sold on eBay", hint: "Every grade, recent sales", href: ebaySold(`${q} PSA`) },
    {
      label: "PSA auction prices",
      hint: "PSA's own record of sales by grade",
      href: `https://www.psacard.com/auctionprices/search?${new URLSearchParams({ q: `${q} pokemon` })}`,
    },
    {
      label: "PriceCharting",
      hint: "Price guide by grade",
      href: `https://www.pricecharting.com/search-products?${new URLSearchParams({ type: "prices", q })}`,
    },
  ];
}
