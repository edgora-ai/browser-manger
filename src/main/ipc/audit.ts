// Audit IPC — expose the audit log to the UI (recent activity / governance view).
import { ipcMain } from "electron";
import { listAudit, clearAudit } from "../services/audit-log.js";

export function registerAuditHandlers(): void {
  ipcMain.handle("audit:list", async (_event, opts?: { limit?: number; category?: string; target?: string }) => {
    return listAudit(opts?.limit ?? 200, { category: opts?.category, target: opts?.target });
  });
  ipcMain.handle("audit:clear", async () => {
    clearAudit();
    return { success: true };
  });
}
