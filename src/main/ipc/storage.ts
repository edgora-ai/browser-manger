import { ipcMain } from "electron";
import { storageMonitor } from "../services/storage-monitor.js";
import type { StorageInfo } from "../types.js";

export function registerStorageHandlers(): void {
  ipcMain.handle("storage:info", async (): Promise<StorageInfo> => {
    return storageMonitor.getInfo();
  });

  ipcMain.handle("storage:clear-cache", async (_event, dirId?: string): Promise<{ freed: number }> => {
    return storageMonitor.clearCache(dirId);
  });

  ipcMain.handle("storage:available-disk", async (): Promise<number> => {
    return storageMonitor.getAvailableDiskSpace();
  });
}
