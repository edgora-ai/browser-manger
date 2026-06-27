import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";

// Validate a profile dirId to prevent path traversal and shell injection.
// Chrome profiles: 32-char hex UUID (no dashes). Firefox: ff_<base36>_<random>.
const VALID_DIR_ID = /^[a-zA-Z0-9_-]{1,80}$/;

export function validateDirId(dirId: string): void {
  if (!dirId || !VALID_DIR_ID.test(dirId) || dirId === "__proto__" || dirId === "prototype" || dirId === "constructor") {
    throw new Error(`Invalid profile ID: ${JSON.stringify(dirId)}`);
  }
}

export async function getDirectorySizeAsync(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const tasks = entries.map(async entry => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return getDirectorySizeAsync(fullPath);
      } else if (entry.isFile()) {
        try {
          const stat = await fsPromises.stat(fullPath);
          return stat.size;
        } catch {
          return 0;
        }
      }
      return 0;
    });
    const sizes = await Promise.all(tasks);
    size = sizes.reduce((acc, val) => acc + val, 0);
  } catch { /* ignore */ }
  return size;
}

export async function getLatestModifiedAsync(dirPath: string): Promise<number> {
  let latest = 0;
  try {
    const stat = await fsPromises.stat(dirPath);
    latest = Math.floor(stat.mtimeMs);
    if (!stat.isDirectory()) return latest;

    const entries = await fsPromises.readdir(dirPath, { withFileTypes: true });
    const tasks = entries.map(async entry => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        return getLatestModifiedAsync(entryPath);
      } else {
        try {
          const entryStat = await fsPromises.stat(entryPath);
          return Math.floor(entryStat.mtimeMs);
        } catch {
          return 0;
        }
      }
    });
    const mtimes = await Promise.all(tasks);
    for (const mtime of mtimes) {
      if (mtime > latest) latest = mtime;
    }
  } catch {
    // ignore
  }
  return latest;
}

