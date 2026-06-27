// CDP helpers — connect to running Chromium and verify fingerprint state.
import * as http from "node:http";
import WebSocket from "ws";

export interface CdpVersion {
  Browser?: string;
  "Protocol-Version"?: string;
  "User-Agent"?: string;
  "V8-Version"?: string;
  "WebKit-Version"?: string;
  webSocketDebuggerUrl?: string;
}

export interface CdpBrowserVersion {
  browser: string;
  protocolVersion: string;
  userAgent: string;
  v8Version: string;
  webKitVersion: string;
}

export interface CdpTarget {
  id: string;
  type: string;
  title?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export class CdpClient {
  private ws: WebSocket;
  private nextId = 1;
  private pending = new Map<number, (resp: any) => void>();
  private sessionId?: string;
  private ready: Promise<void>;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.ready = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", reject);
    });
    ws.on("message", (raw: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.id && this.pending.has(msg.id)) {
          this.pending.get(msg.id)!(msg);
          this.pending.delete(msg.id);
        }
      } catch (_) {
        /* ignore */
      }
    });
  }

  async send<T = any>(method: string, params?: Record<string, unknown>): Promise<T> {
    await this.ready;
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, (msg) => {
        if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
        else resolve(msg.result as T);
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch (_) {
      /* ignore */
    }
  }
}

function httpGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }),
      );
    });
    req.on("error", reject);
    req.setTimeout(3000, () => req.destroy(new Error("http timeout")));
  });
}

export async function getJsonVersion(port: number): Promise<CdpVersion> {
  const r = await httpGet(`http://127.0.0.1:${port}/json/version`);
  if (r.status !== 200) throw new Error(`/json/version status=${r.status} body=${r.body}`);
  return JSON.parse(r.body) as CdpVersion;
}

export async function listTargets(port: number): Promise<CdpTarget[]> {
  const r = await httpGet(`http://127.0.0.1:${port}/json`);
  if (r.status !== 200) throw new Error(`/json status=${r.status} body=${r.body}`);
  return JSON.parse(r.body) as CdpTarget[];
}

export async function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = require("node:net").createConnection({ port, host: "127.0.0.1" });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(1000, () => done(false));
  });
}

export async function waitForCdpPort(port: number, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortListening(port)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP port ${port} not listening after ${timeoutMs}ms`);
}

export async function waitForPortClosed(port: number, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await isPortListening(port))) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP port ${port} still listening after ${timeoutMs}ms`);
}

export async function connectBrowserCdp(port: number): Promise<CdpClient> {
  const v = await getJsonVersion(port);
  if (!v.webSocketDebuggerUrl) throw new Error(`no webSocketDebuggerUrl on port ${port}`);
  const ws = new WebSocket(v.webSocketDebuggerUrl, { perMessageDeflate: false });
  return new CdpClient(ws);
}

export async function connectPageCdp(
  port: number,
  matcher?: (t: CdpTarget) => boolean,
): Promise<CdpClient> {
  const targets = await listTargets(port);
  const page = targets.find((t) => t.type === "page" && (!matcher || matcher(t)));
  if (!page || !page.webSocketDebuggerUrl) {
    throw new Error(
      `no page target on port ${port} (found ${targets.length} targets: ${targets.map((t) => t.type).join(",")})`,
    );
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  return new CdpClient(ws);
}

export async function getBrowserVersion(port: number): Promise<CdpBrowserVersion> {
  const c = await connectBrowserCdp(port);
  try {
    const r = await c.send<{
      protocolVersion: string;
      product: string;
      revision: string;
      userAgent: string;
      jsVersion: string;
    }>("Browser.getVersion");
    return {
      browser: r.product,
      protocolVersion: r.protocolVersion,
      userAgent: r.userAgent,
      v8Version: r.jsVersion,
      webKitVersion: "",
    };
  } finally {
    c.close();
  }
}

export async function evaluateInPage<T = unknown>(
  port: number,
  expression: string,
  matcher?: (t: CdpTarget) => boolean,
): Promise<T> {
  const c = await connectPageCdp(port, matcher);
  try {
    await c.send("Runtime.enable");
    const r = await c.send<{ result: { value: T } }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result.value;
  } finally {
    c.close();
  }
}

export async function waitForPageUrl(
  port: number,
  urlSubstring: string,
  timeoutMs = 15000,
): Promise<string> {
  const start = Date.now();
  let last = "";
  while (Date.now() - start < timeoutMs) {
    try {
      const targets = await listTargets(port);
      const t = targets.find((t) => t.type === "page" && (t.url || "").includes(urlSubstring));
      if (t && t.url) return t.url;
      last = targets.map((t) => t.url).join(" | ");
    } catch (_) {
      /* keep polling */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(
    `no page target with URL containing "${urlSubstring}" after ${timeoutMs}ms (last=${last})`,
  );
}
