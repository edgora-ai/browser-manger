import { ipcMain } from "electron";
import { startMcpServer, stopMcpServer, getMcpPort, getMcpToken, isMcpServerRunning } from "../services/mcp-server.js";

export function registerMcpHandlers(): void {
  ipcMain.handle("mcp:status", async () => {
    return {
      running: isMcpServerRunning(),
      port: getMcpPort(),
      url: `http://127.0.0.1:${getMcpPort()}`,
      mcpEndpoint: `http://127.0.0.1:${getMcpPort()}/mcp`,
      sseEndpoint: `http://127.0.0.1:${getMcpPort()}/sse`,
      hasToken: Boolean(getMcpToken()),
    };
  });

  ipcMain.handle("mcp:restart", async () => {
    try {
      await stopMcpServer();
      const started = startMcpServer();
      await started.ready;
      return { running: isMcpServerRunning(), port: getMcpPort(), hasToken: Boolean(getMcpToken()) };
    } catch (e: any) {
      return { running: false, port: getMcpPort(), hasToken: Boolean(getMcpToken()), error: e.message || String(e) };
    }
  });

  ipcMain.handle("mcp:reveal-token", async () => {
    const token = getMcpToken();
    if (!token) return { token: null };
    // Return the token explicitly — this is an explicit user request (e.g. clicking "Copy MCP Token")
    return { token };
  });
}
