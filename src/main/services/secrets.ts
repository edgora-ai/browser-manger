// Credential vault — encrypt sensitive string fields at rest in config.json
// using Electron safeStorage (OS keychain on macOS/Windows). Falls back to
// passthrough when safeStorage is unavailable (plain Node / tests / headless),
// in which case `usingEncryption()` returns false and nothing is encrypted —
// the migration step is a no-op so the real app encrypts on first run.
//
// Threat model: protect config.json read off disk. List/get IPC already
// redacts these fields, so encryption is purely about the at-rest file.
//
// Stored format: "v1:" + base64(safeStorage.encryptString(plain).latin1).
import { safeStorage } from "electron";

const MARKER = "v1:";

/** True only when OS-backed encryption is actually available. */
export function usingEncryption(): boolean {
  try { return typeof safeStorage !== "undefined" && safeStorage.isEncryptionAvailable(); }
  catch { return false; }
}

export function isEncrypted(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(MARKER);
}

/** Encrypt a plaintext secret for at-rest storage. Passthrough when encryption
 *  is unavailable (so the value round-trips unchanged in tests/headless). */
export function encryptSecret(plain: string): string {
  if (plain == null) return plain;
  if (isEncrypted(plain)) return plain; // don't double-encrypt
  if (!usingEncryption()) return plain;  // passthrough — migration is a no-op
  try {
    const buf = safeStorage.encryptString(plain);
    return MARKER + Buffer.from(buf).toString("base64");
  } catch {
    return plain; // never break a save because encryption failed
  }
}

/** Decrypt a stored secret for use. Plaintext (unmarked) values pass through. */
export function decryptSecret(stored: string): string {
  if (stored == null) return stored;
  if (!isEncrypted(stored)) return stored;
  if (!usingEncryption()) {
    throw new Error("Encrypted secret present but OS keychain unavailable");
  }
  const b64 = stored.slice(MARKER.length);
  const buf = Buffer.from(b64, "base64");
  return safeStorage.decryptString(buf);
}

/** Decrypt if needed, never throw — returns fallback on failure (e.g. value
 *  corrupted). Use for consumption paths where a hard error would crash a run. */
export function decryptSecretOr(stored: string, fallback = ""): string {
  try { return decryptSecret(stored); } catch { return fallback; }
}

/** Encrypt a plaintext secret only if it isn't already encrypted. Returns the
 *  original value when encryption is unavailable. */
export function maybeEncrypt(plain: string): string {
  return encryptSecret(plain);
}
