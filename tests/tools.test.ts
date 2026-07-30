import { describe, it, expect } from "vitest";
import { FetchPageMarkdownSchema, ExtractMetadataSchema, ExtractLinksSchema } from "../src/types.js";

describe("Input validation schemas", () => {
  describe("FetchPageMarkdownSchema", () => {
    it("validates correct input", () => {
      const input = {
        url: "https://example.com",
        includeMetadata: true,
        timeout: 5000,
      };
      const result = FetchPageMarkdownSchema.parse(input);
      expect(result.url).toBe("https://example.com");
      expect(result.includeMetadata).toBe(true);
      expect(result.timeout).toBe(5000);
    });

    it("applies default values", () => {
      const input = { url: "https://example.com" };
      const result = FetchPageMarkdownSchema.parse(input);
      expect(result.includeMetadata).toBe(false);
      expect(result.timeout).toBe(10000);
    });

    it("rejects invalid URLs", () => {
      expect(() => FetchPageMarkdownSchema.parse({ url: "not-a-url" })).toThrow();
      expect(() => FetchPageMarkdownSchema.parse({ url: "" })).toThrow();
    });

    it("validates timeout range", () => {
      expect(() =>
        FetchPageMarkdownSchema.parse({
          url: "https://example.com",
          timeout: 500,
        })
      ).toThrow();

      expect(() =>
        FetchPageMarkdownSchema.parse({
          url: "https://example.com",
          timeout: 35000,
        })
      ).toThrow();
    });
  });

  describe("ExtractMetadataSchema", () => {
    it("validates correct input", () => {
      const input = {
        url: "https://example.com",
        timeout: 8000,
      };
      const result = ExtractMetadataSchema.parse(input);
      expect(result.url).toBe("https://example.com");
      expect(result.timeout).toBe(8000);
    });

    it("rejects invalid URLs", () => {
      expect(() => ExtractMetadataSchema.parse({ url: "not-a-url" })).toThrow();
    });
  });

  describe("ExtractLinksSchema", () => {
    it("validates correct input", () => {
      const input = {
        url: "https://example.com",
        includeExternal: false,
        includeInternal: true,
        timeout: 7000,
      };
      const result = ExtractLinksSchema.parse(input);
      expect(result.url).toBe("https://example.com");
      expect(result.includeExternal).toBe(false);
      expect(result.includeInternal).toBe(true);
      expect(result.timeout).toBe(7000);
    });

    it("applies default values", () => {
      const input = { url: "https://example.com" };
      const result = ExtractLinksSchema.parse(input);
      expect(result.includeExternal).toBe(true);
      expect(result.includeInternal).toBe(true);
      expect(result.timeout).toBe(10000);
    });
  });
});
