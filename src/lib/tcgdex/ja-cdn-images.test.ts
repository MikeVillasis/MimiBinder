import { describe, expect, it } from "vitest";
import { expandIds, jaCdnImage } from "./ja-cdn-images";
import { normalizeCardSummary } from "./normalize";

describe("Japanese CDN image fallback", () => {
  it("expands id runs keeping zero padding", () => {
    expect([...expandIds("001-003,010,TG05")]).toEqual(["001", "002", "003", "010", "TG05"]);
  });

  it("finds images the API leaves out, and skips the known-bad M1S range", () => {
    expect(jaCdnImage("M4", "001")).toBe("https://assets.tcgdex.net/ja/M/M4/001");
    expect(jaCdnImage("M1S", "056")).toBe("https://assets.tcgdex.net/ja/M/M1S/056");
    expect(jaCdnImage("M1S", "057")).toBeUndefined(); // CDN shows the wrong card from here (#2395)
    expect(jaCdnImage("M1L", "001")).toBeUndefined(); // not on the CDN at all
  });

  it("fills only Japanese cards that have no API image", () => {
    expect(normalizeCardSummary({ id: "M4-001", localId: "001", name: "ビードル" }, "ja").image).toBe(
      "https://assets.tcgdex.net/ja/M/M4/001",
    );
    expect(normalizeCardSummary({ id: "M4-001", localId: "001", name: "x", image: "https://a/b/c/" }, "ja").image).toBe("https://a/b/c");
    expect(normalizeCardSummary({ id: "M4-001", localId: "001", name: "Weedle" }, "en").image).toBeUndefined();
  });
});
