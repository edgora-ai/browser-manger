import { describe, it, expect } from "vitest";
import { PLATFORM_ADAPTERS, detectAdapter, getAdapter, renderAdapterCatalog } from "../../src/main/services/platform-adapters.js";

describe("platform adapters", () => {
  it("ships adapters for the core platforms + a generic fallback", () => {
    const ids = PLATFORM_ADAPTERS.map((a) => a.id);
    expect(ids).toContain("generic-web");
    expect(ids).toContain("amazon-seller");
    expect(ids).toContain("shopee-seller");
    expect(ids).toContain("facebook");
  });

  it("every adapter has a versioned loginCheck expression", () => {
    for (const a of PLATFORM_ADAPTERS) {
      expect(a.selectorVersion).toBeGreaterThanOrEqual(1);
      expect(a.capabilities.length).toBeGreaterThan(0);
      expect(Object.keys(a.selectors).length).toBeGreaterThan(0);
      expect(a.recipes.length).toBeGreaterThan(0);
      expect(a.lastVerifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(a.notes).toBeTruthy();
      expect(a.loginCheck).toBeTruthy();
      expect(a.loginCheck.length).toBeGreaterThan(20);
      expect(a.loginCheck).not.toContain("[aria-label*=Your profile i]");
    }
  });

  it("detectAdapter matches by domain substring", () => {
    expect(detectAdapter("https://sellercentral.amazon.com/home").id).toBe("amazon-seller");
    expect(detectAdapter("https://seller.shopee.ph/").id).toBe("shopee-seller");
    expect(detectAdapter("https://www.facebook.com/").id).toBe("facebook");
  });

  it("detectAdapter falls back to generic for unknown sites", () => {
    expect(detectAdapter("https://example.com/").id).toBe("generic-web");
    expect(detectAdapter("").id).toBe("generic-web");
  });

  it("getAdapter looks up by id", () => {
    expect(getAdapter("facebook")?.name).toBe("Facebook");
    expect(getAdapter("nope")).toBeUndefined();
  });

  it("renderAdapterCatalog advertises each platform in the prompt", () => {
    const text = renderAdapterCatalog();
    expect(text).toContain("amazon-seller");
    expect(text).toContain("browser_evaluate");
    expect(text).toContain("selectorVersion");
    expect(text).toContain("capabilities");
    expect(text).toContain("loginCheck:");
    expect(text).toContain("loginUrlHints:");
    expect(text).toContain("recipes:");
    expect(text).toContain('[aria-label*="Your profile" i]');
  });
});
