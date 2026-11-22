import { describe, expect, it } from "vitest";
import { POKEDEX_EN } from "./pokedex-en";
import { hasJapanese, matchSpecies, MAX_SPECIES, speciesKey } from "./species";

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
