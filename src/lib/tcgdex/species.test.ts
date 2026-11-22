import { describe, expect, it } from "vitest";
import { POKEDEX_EN } from "./pokedex-en";
import { hasJapanese, matchSpecies, MAX_SPECIES, speciesKey, nameHasSuffix, splitSuffix } from "./species";
import { POKEDEX_JA } from "./pokedex-ja";

const names = ["Charmander", "Charmeleon", "Charizard", "Pikachu", "Raichu", "Flabébé", "Mr. Mime", "Char"];

describe("speciesKey", () => {
  it("strips case, accents and punctuation", () => {
    expect(speciesKey("Flabébé")).toBe("flabebe");
    expect(speciesKey("Mr. Mime")).toBe("mrmime");
    expect(speciesKey("Nidoran♀")).toBe("nidoran");
    expect(speciesKey("Farfetch'd")).toBe("farfetchd");
    expect(speciesKey("  PIKACHU ")).toBe("pikachu");
  });
});

describe("matchSpecies", () => {
  it("orders exact, then prefix, then substring matches", () => {
    // "Char" (8) exact, then the Char- prefixes in dex order; no substrings
    expect(matchSpecies("char", names)).toEqual([8, 1, 2, 3]);
    expect(matchSpecies("chu", names)).toEqual([4, 5]); // substrings only
    expect(matchSpecies("Pikachu", names)).toEqual([4]);
  });

  it("is case- and accent-insensitive", () => {
    expect(matchSpecies("FLABEBE", names)).toEqual([6]);
    expect(matchSpecies("flabébé", names)).toEqual([6]);
    expect(matchSpecies("mr mime", names)).toEqual([7]);
  });

  it("caps results and handles empty / punctuation-only queries", () => {
    expect(matchSpecies("a", names, 2)).toHaveLength(2);
    expect(matchSpecies("", names)).toEqual([]);
    expect(matchSpecies(" !? ", names)).toEqual([]);
    expect(matchSpecies("zzz", names)).toEqual([]);
  });

  it("works against the real Pokédex", () => {
    expect(POKEDEX_EN).toHaveLength(1025);
    expect(matchSpecies("pikachu")).toEqual([25]);
    expect(matchSpecies("charizard")).toEqual([6]);
    const char = matchSpecies("char");
    expect(char.slice(0, 3)).toEqual([4, 5, 6]);
    expect(char.length).toBeLessThanOrEqual(MAX_SPECIES);
    expect(matchSpecies("nidoran")).toEqual([29, 32]);
    expect(matchSpecies("flabebe")).toEqual([669]);
  });
});

describe("hasJapanese", () => {
  it("detects kana and kanji", () => {
    expect(hasJapanese("ピカチュウ")).toBe(true);
    expect(hasJapanese("ふしぎだね")).toBe(true);
    expect(hasJapanese("悪")).toBe(true);
    expect(hasJapanese("ﾋﾟｶﾁｭｳ")).toBe(true);
    expect(hasJapanese("pikachu")).toBe(false);
    expect(hasJapanese("Flabébé")).toBe(false);
  });
});

describe("card mechanic suffixes", () => {
  it("splits a trailing mechanic word off English queries", () => {
    expect(splitSuffix("Espeon ex")).toEqual({ base: "Espeon", suffix: "ex" });
    expect(splitSuffix("charizard VMAX")).toEqual({ base: "charizard", suffix: "vmax" });
    expect(splitSuffix("Zacian V")).toEqual({ base: "Zacian", suffix: "v" });
    expect(splitSuffix("espeon")).toEqual({ base: "espeon" });
    expect(splitSuffix("ex")).toEqual({ base: "ex" });
    expect(splitSuffix("Mr. Mime")).toEqual({ base: "Mr. Mime" });
  });

  it("matches the mechanic at the end of Japanese names", () => {
    expect(nameHasSuffix("エーフィex", "ex")).toBe(true);
    expect(nameHasSuffix("エーフィEX", "ex")).toBe(true);
    expect(nameHasSuffix("エーフィ", "ex")).toBe(false);
    expect(nameHasSuffix("リザードンVMAX", "vmax")).toBe(true);
    expect(nameHasSuffix("リザードンVMAX", "v")).toBe(false);
    expect(nameHasSuffix("ザシアンV", "v")).toBe(true);
    expect(nameHasSuffix("ザシアンＶ", "v")).toBe(true); // full-width V
  });
});

describe("Japanese name table", () => {
  it("translates species to Japanese", () => {
    expect(POKEDEX_JA).toHaveLength(1025);
    expect(POKEDEX_JA.every((n) => n.length > 0)).toBe(true);
    expect(POKEDEX_JA[195][0]).toBe("エーフィ"); // Espeon
    expect(POKEDEX_JA[24][0]).toBe("ピカチュウ"); // Pikachu
    expect(POKEDEX_JA[1016][0]).toBe("オーガポン"); // Ogerpon
  });
});
