import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAppDataDir } from "./config-manager.js";
import { validateDirId } from "./utils.js";

const heldLocks = new Map<string, { fd: number; token: string }>();
const STALE_LOCK_MS = 30 * 60 * 1000;

function getRestoreLockPath(dirId: string): string {
  validateDirId(dirId);
  return path.join(getAppDataDir(), "locks", `${dirId}.restore.lock`);
}

export function isRestoreLocked(dirId: string): boolean {
  validateDirId(dirId);
  if (heldLocks.has(dirId)) return true;
  const lockPath = getRestoreLockPath(dirId);
  if (!fs.existsSync(lockPath)) return false;
  const snapshot = readRestoreLock(lockPath);
  if (snapshot?.stale && removeRestoreLockIfTokenMatches(lockPath, snapshot.token)) return false;
  if (!snapshot) return false;
  return true;
}

function readRestoreLock(lockPath: string): { token: string; stale: boolean } | null {
  try {
    const stat = fs.statSync(lockPath);
    const parsed = JSON.parse(fs.readFileSync(lockPath, "utf-8")) as { pid?: number; token?: string };
    const token = typeof parsed.token === "string" ? parsed.token : "";
    if (!token) return { token, stale: true };
    if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) return { token, stale: true };
    if (!Number.isInteger(parsed.pid) || parsed.pid! <= 0) return { token, stale: true };
    try {
      process.kill(parsed.pid!, 0);
      return { token, stale: false };
    } catch {
      return { token, stale: true };
    }
  } catch (e: any) {
    if (e?.code === "ENOENT") return null;
    return { token: "", stale: true };
  }
}

function removeRestoreLockIfTokenMatches(lockPath: string, token: string): boolean {
  try {
    const current = readRestoreLock(lockPath);
    if (!current) return true;
    if (current.token !== token) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch (e) {
    console.error("[sync] failed to remove restore lock:", e);
    return false;
  }
}

export function acquireRestoreLock(dirId: string): () => void {
  validateDirId(dirId);
  if (heldLocks.has(dirId)) throw new Error(`Restore already in progress for ${dirId}`);
  const lockPath = getRestoreLockPath(dirId);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true, mode: 0o700 });
  let fd: number | null = null;
  const token = randomUUID();
  try {
    fd = fs.openSync(lockPath, "wx", 0o600);
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, dirId, token, createdAt: new Date().toISOString() }));
    heldLocks.set(dirId, { fd, token });
  } catch (e: any) {
    if (fd !== null) fs.closeSync(fd);
    if (e?.code === "EEXIST") {
      const snapshot = readRestoreLock(lockPath);
      if (snapshot?.stale) removeRestoreLockIfTokenMatches(lockPath, snapshot.token);
      throw new Error(`Restore already in progress for ${dirId}`);
    }
    try { fs.unlinkSync(lockPath); } catch (unlinkError: any) { if (unlinkError?.code !== "ENOENT") console.error(`[sync] failed to remove partial restore lock for ${dirId}:`, unlinkError); }
    throw e;
  }

  return () => {
    const current = heldLocks.get(dirId);
    heldLocks.delete(dirId);
    if (current !== undefined) {
      try { fs.closeSync(current.fd); } catch (e) { console.error(`[sync] failed to close restore lock for ${dirId}:`, e); }
      removeRestoreLockIfTokenMatches(lockPath, current.token);
    }
  };
}
