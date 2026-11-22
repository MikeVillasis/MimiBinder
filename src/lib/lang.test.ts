import { describe, expect, it } from "vitest";
import { joinId, langOf, parseLang, splitId } from "./lang";

describe("lang ids", () => {
  it("round-trips English and Japanese ids", () => {
    expect(joinId("sv03.5-001", "en")).toBe("sv03.5-001");
    expect(joinId("SV2a-001", "ja")).toBe("ja:SV2a-001");
    expect(joinId("ja:SV2a-001", "ja")).toBe("ja:SV2a-001");
    expect(splitId("ja:SV2a-001")).toEqual({ lang: "ja", raw: "SV2a-001" });
    expect(splitId("sv03.5-001")).toEqual({ lang: "en", raw: "sv03.5-001" });
    expect(langOf("ja:SV")).toBe("ja");
    expect(langOf("sv")).toBe("en");
    expect(parseLang("ja")).toBe("ja");
    expect(parseLang("fr")).toBe("en");
    expect(parseLang(null)).toBe("en");
  });
});
