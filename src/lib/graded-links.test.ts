import { describe, expect, it } from "vitest";
import { gradedLinks, gradedSearchQuery, printedNumber } from "./graded-links";

const charizard = { id: "sv03.5-199", name: "Charizard ex", localId: "199", setOfficialCount: 165, setName: "151" };
const bulbasaur = { ...charizard, id: "sv03.5-001", name: "Bulbasaur", localId: "001" };
const zorua = { id: "svp-189", name: "N's Zorua", localId: "189", setOfficialCount: 225, setName: "SVP Black Star Promos" };
const espeon = { id: "ja:SV8a-211", name: "エーフィex", nameEn: "Espeon ex", localId: "211", setOfficialCount: 187, setName: "テラスタルフェスex" };

describe("graded search links", () => {
  it("prints numbers the way the card does", () => {
    expect(printedNumber(charizard)).toBe("199/165");
    expect(printedNumber(bulbasaur)).toBe("001/165");
    expect(printedNumber(zorua)).toBe("189");
    expect(printedNumber({ ...charizard, localId: "TG05" })).toBe("TG05");
  });

  it("builds the search people would type", () => {
    expect(gradedSearchQuery(charizard)).toBe("Charizard ex 199/165");
    expect(gradedSearchQuery(zorua)).toBe("N's Zorua 189 SVP Promos");
    expect(gradedSearchQuery(espeon)).toBe("Espeon ex 211/187 Japanese");
    expect(gradedSearchQuery({ ...espeon, nameEn: undefined })).toBe("エーフィex 211/187 Japanese");
  });

  it("links to eBay sold listings, PSA and PriceCharting", () => {
    const links = gradedLinks(charizard);
    const psa10 = new URL(links[0].href);
    expect(psa10.hostname).toBe("www.ebay.com");
    expect(psa10.searchParams.get("_nkw")).toBe("Charizard ex 199/165 PSA 10");
    expect(psa10.searchParams.get("LH_Sold")).toBe("1");
    expect(new URL(links[3].href).searchParams.get("q")).toBe("Charizard ex 199/165 pokemon");
    expect(new URL(links[4].href).hostname).toBe("www.pricecharting.com");
  });
});
