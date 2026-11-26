import { describe, expect, it } from "vitest";
import { fullArtReason } from "./fullArt";

describe("fullArtReason", () => {
  it("reads English rarity names", () => {
    for (const rarity of ["Special illustration rare", "Illustration rare", "Ultra Rare", "Hyper rare", "Secret Rare", "Rare Rainbow", "Full Art Trainer"]) {
      expect(fullArtReason({ rarity })).toMatch(/rarity/);
    }
  });
  it("reads Japanese rarity codes as whole words", () => {
    for (const rarity of ["SAR", "SR", "AR", "HR", "UR", "CHR", "CSR", "SSR"]) expect(fullArtReason({ rarity })).toMatch(/rarity/);
    expect(fullArtReason({ rarity: "RR" })).toBeNull();
    expect(fullArtReason({ rarity: "ARCEUS" })).toBeNull();
  });
  it("leaves ordinary rarities alone", () => {
    for (const rarity of ["Common", "Uncommon", "Rare", "Double rare", "Rare Holo", "None", undefined]) expect(fullArtReason({ rarity })).toBeNull();
  });
  it("uses the card number when the rarity says nothing (Japanese cards often report None)", () => {
    expect(fullArtReason({ rarity: "None", localId: "211", setOfficialCount: 187 })).toMatch(/past the set/);
    expect(fullArtReason({ rarity: "None", localId: "187", setOfficialCount: 187 })).toBeNull();
    expect(fullArtReason({ localId: "TG05", setOfficialCount: 150 })).toBeNull();
    expect(fullArtReason({ localId: "12" })).toBeNull();
    expect(fullArtReason(undefined)).toBeNull();
  });
});
