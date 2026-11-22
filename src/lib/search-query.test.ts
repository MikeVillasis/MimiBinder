import { describe, expect, it } from "vitest";
import { matchesCardNumber, parseCardQuery } from "./search-query";

describe("parseCardQuery", () => {
  it("splits a name and a trailing number", () => {
    expect(parseCardQuery("N's Zorua 189")).toEqual({ name: "N's Zorua", number: { key: "189", prefix: "", num: 189 } });
    expect(parseCardQuery("zorua #189")).toEqual({ name: "zorua", number: { key: "189", prefix: "", num: 189 } });
  });

  it("reads set totals and lettered numbers", () => {
    expect(parseCardQuery("charizard 199/165").number).toEqual({ key: "199", prefix: "", num: 199, total: 165 });
    expect(parseCardQuery("097/086").number).toEqual({ key: "97", prefix: "", num: 97, total: 86 });
    expect(parseCardQuery("Pikachu TG05").number).toEqual({ key: "TG5", prefix: "TG", num: 5 });
    expect(parseCardQuery("gg69")).toEqual({ name: "", number: { key: "GG69", prefix: "GG", num: 69 } });
    expect(parseCardQuery("SWSH050").number?.prefix).toBe("SWSH");
  });

  it("leaves names alone", () => {
    expect(parseCardQuery("Porygon2")).toEqual({ name: "Porygon2" });
    expect(parseCardQuery("Mr. Mime")).toEqual({ name: "Mr. Mime" });
    expect(parseCardQuery("  ")).toEqual({ name: "" });
    expect(parseCardQuery("Pikachu")).toEqual({ name: "Pikachu" });
  });

  it("uses only the last number-like token", () => {
    expect(parseCardQuery("25 Pikachu 4")).toEqual({ name: "25 Pikachu", number: { key: "4", prefix: "", num: 4 } });
  });
});

describe("matchesCardNumber", () => {
  const n = (q: string) => parseCardQuery(q).number!;
  it("ignores zero padding and case", () => {
    expect(matchesCardNumber("001", n("1"))).toBe(true);
    expect(matchesCardNumber("1", n("#001"))).toBe(true);
    expect(matchesCardNumber("189", n("189/159"))).toBe(true);
    expect(matchesCardNumber("TG05", n("tg5"))).toBe(true);
    expect(matchesCardNumber("GG69", n("GG69"))).toBe(true);
    expect(matchesCardNumber("SWSH050", n("swsh50"))).toBe(true);
  });
  it("rejects other numbers and prefixes", () => {
    expect(matchesCardNumber("018", n("189"))).toBe(false);
    expect(matchesCardNumber("1890", n("189"))).toBe(false);
    expect(matchesCardNumber("TG05", n("5"))).toBe(false);
    expect(matchesCardNumber("005", n("TG5"))).toBe(false);
  });
});
