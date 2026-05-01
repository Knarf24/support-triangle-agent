import { describe, it, expect } from "vitest";
import { normalizeRetrievedDocs } from "../lib/normalize-docs";

describe("normalizeRetrievedDocs", () => {
  describe("non-array input", () => {
    it("returns [] for null", () => {
      expect(normalizeRetrievedDocs(null)).toEqual([]);
    });

    it("returns [] for undefined", () => {
      expect(normalizeRetrievedDocs(undefined)).toEqual([]);
    });

    it("returns [] for a plain object", () => {
      expect(normalizeRetrievedDocs({ title: "x", content: "y" })).toEqual([]);
    });

    it("returns [] for a string", () => {
      expect(normalizeRetrievedDocs("not an array")).toEqual([]);
    });

    it("returns [] for a number", () => {
      expect(normalizeRetrievedDocs(42)).toEqual([]);
    });
  });

  describe("valid object entries", () => {
    it("maps a full entry with url", () => {
      const input = [{ title: "My Title", content: "Some content", url: "https://example.com" }];
      const result = normalizeRetrievedDocs(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        title: "My Title",
        content: "Some content",
        url: "https://example.com",
      });
    });

    it("maps an entry without url and omits the url field", () => {
      const input = [{ title: "No URL Doc", content: "Content here" }];
      const result = normalizeRetrievedDocs(input);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ title: "No URL Doc", content: "Content here" });
      expect("url" in result[0]).toBe(false);
    });

    it("falls back to empty string when content is missing", () => {
      const input = [{ title: "Title Only" }];
      const result = normalizeRetrievedDocs(input);
      expect(result[0].content).toBe("");
    });

    it("derives title from content when title is missing", () => {
      const content = "Q: How do I reset my password?";
      const input = [{ content }];
      const result = normalizeRetrievedDocs(input);
      expect(result[0].title).toBe("How do I reset my password?");
    });

    it("derives title from content when title is an empty string", () => {
      const content = "Short content";
      const input = [{ title: "", content }];
      const result = normalizeRetrievedDocs(input);
      expect(result[0].title).toBe("Short content");
    });

    it("handles multiple entries correctly", () => {
      const input = [
        { title: "First", content: "A", url: "https://a.com" },
        { title: "Second", content: "B" },
      ];
      const result = normalizeRetrievedDocs(input);
      expect(result).toHaveLength(2);
      expect(result[0].url).toBe("https://a.com");
      expect("url" in result[1]).toBe(false);
    });
  });

  describe("non-object entries in array", () => {
    it("throws a descriptive error for a null entry", () => {
      expect(() => normalizeRetrievedDocs([null])).toThrowError(
        "Retrieved doc entry must be an object, got: object",
      );
    });

    it("throws a descriptive error for a string entry", () => {
      expect(() => normalizeRetrievedDocs(["oops"])).toThrowError(
        "Retrieved doc entry must be an object, got: string",
      );
    });

    it("throws a descriptive error for a number entry", () => {
      expect(() => normalizeRetrievedDocs([42])).toThrowError(
        "Retrieved doc entry must be an object, got: number",
      );
    });

    it("throws on the first bad entry even when earlier entries are valid", () => {
      const input = [{ title: "ok", content: "fine" }, "bad"];
      expect(() => normalizeRetrievedDocs(input)).toThrowError(
        "Retrieved doc entry must be an object, got: string",
      );
    });
  });
});
