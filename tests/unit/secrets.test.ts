import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  encryptSecret, decryptSecret, decryptSecretOr, isEncrypted, usingEncryption,
} from "../../src/main/services/secrets.js";

// In the Node test runner, Electron safeStorage is unavailable, so the vault
// is in passthrough mode. These tests cover the logic + marker handling; the
// real encrypt/decrypt round-trip is proved in the Electron e2e (J34).

describe("secrets vault (passthrough mode — Node, no safeStorage)", () => {
  it("reports encryption unavailable outside Electron", () => {
    expect(usingEncryption()).toBe(false);
  });

  it("detects the encrypted-value marker", () => {
    expect(isEncrypted("v1:YWJj")).toBe(true);
    expect(isEncrypted("plain-text")).toBe(false);
    expect(isEncrypted("")).toBe(false);
    expect(isEncrypted(undefined)).toBe(false);
    expect(isEncrypted(null)).toBe(false);
  });

  it("passes plaintext through unchanged when encryption is unavailable", () => {
    expect(encryptSecret("sk-test")).toBe("sk-test");
    expect(decryptSecret("sk-test")).toBe("sk-test");
  });

  it("never double-encrypts an already-marked value", () => {
    expect(encryptSecret("v1:YWJj")).toBe("v1:YWJj");
  });

  it("decryptSecret throws on an encrypted value when the keychain is unavailable", () => {
    expect(() => decryptSecret("v1:YWJj")).toThrow(/keychain unavailable/);
  });

  it("decryptSecretOr falls back instead of throwing", () => {
    expect(decryptSecretOr("v1:YWJj", "fallback")).toBe("fallback");
    expect(decryptSecretOr("plain", "fallback")).toBe("plain");
  });

  it("null/undefined pass through safely", () => {
    expect(encryptSecret(null as any)).toBe(null);
    expect(decryptSecret(undefined as any)).toBe(undefined);
  });
});

// migrateSecrets is a no-op when encryption is unavailable (Node), so calling
// it must not corrupt config. We exercise it against a temp config via the
// config-manager singleton reset path is heavy; instead assert the contract
// directly through the function's guard.
describe("migrateSecrets contract (Node passthrough)", () => {
  it("is a no-op returning 0 when encryption is unavailable", async () => {
    // Lazy import so the module graph (which pulls electron) loads once.
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sec-")), "config.json");
    fs.writeFileSync(tmp, JSON.stringify({ llm: { apiKey: "plaintext-key" } }), "utf-8");
    const { migrateSecrets } = await import("../../src/main/services/config-manager.js");
    const n = migrateSecrets();
    expect(n).toBe(0);
  });
});
