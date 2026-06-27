// Data export IPC — pull structured JSON of the user's data (profiles/proxies/
// accounts/runs/jobs/db). Secrets are never exported.
import { ipcMain } from "electron";
import { exportData } from "../services/data-export.js";

export function registerDataHandlers(): void {
  ipcMain.handle("data:export", async (_event, scope: string) => {
    try { return { ok: true, ...exportData((scope as any) || "all") }; }
    catch (e: any) { return { ok: false, error: e.message || String(e) }; }
  });
}
