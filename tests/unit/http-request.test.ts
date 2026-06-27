import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";

const requestState = vi.hoisted(() => ({
  lastRequest: null as { protocol?: string; hostname?: string; method?: string; body?: string } | null,
  responseBody: JSON.stringify({ ok: true }),
}));

function mockRequest(options: any, callback: (resp: any) => void) {
  requestState.lastRequest = { protocol: options.protocol, hostname: options.hostname, method: options.method, body: "" };
  const req: any = new EventEmitter();
  req.write = (chunk: string) => { requestState.lastRequest!.body = (requestState.lastRequest!.body || "") + chunk; };
  req.end = () => {
    const resp: any = new EventEmitter();
    resp.statusCode = 200;
    resp.statusMessage = "OK";
    resp.headers = { "content-type": "application/json" };
    resp.destroy = () => resp.emit("error", new Error("destroyed"));
    resp.resume = () => {};
    callback(resp);
    queueMicrotask(() => {
      resp.emit("data", Buffer.from(requestState.responseBody));
      resp.emit("end");
    });
  };
  req.destroy = (err?: Error) => { if (err) req.emit("error", err); };
  return req;
}

vi.mock("node:https", () => ({ request: vi.fn(mockRequest) }));
vi.mock("node:http", () => ({ request: vi.fn(mockRequest) }));

import { agentHttpRequest } from "../../src/main/services/local-agent.js";

beforeEach(() => {
  requestState.lastRequest = null;
  requestState.responseBody = JSON.stringify({ ok: true });
});

afterEach(() => {
  vi.clearAllMocks();
});

const url = () => "https://93.184.216.34/hook";

describe("agentHttpRequest methods", () => {
  it("supports GET", async () => {
    const r: any = await agentHttpRequest({ method: "GET", url: url() });
    expect(r.status).toBe(200);
    expect(requestState.lastRequest?.method).toBe("GET");
    expect(requestState.lastRequest?.hostname).toBe("93.184.216.34");
  });

  it("supports POST with a body", async () => {
    await agentHttpRequest({ method: "POST", url: url(), body: '{"a":1}', headers: { "content-type": "application/json" } });
    expect(requestState.lastRequest?.method).toBe("POST");
    expect(requestState.lastRequest?.body).toBe('{"a":1}');
  });

  it("supports PUT", async () => {
    await agentHttpRequest({ method: "PUT", url: url(), body: "x" });
    expect(requestState.lastRequest?.method).toBe("PUT");
  });

  it("supports PATCH", async () => {
    await agentHttpRequest({ method: "PATCH", url: url(), body: "x" });
    expect(requestState.lastRequest?.method).toBe("PATCH");
  });

  it("supports DELETE", async () => {
    await agentHttpRequest({ method: "DELETE", url: url() });
    expect(requestState.lastRequest?.method).toBe("DELETE");
  });

  it("supports HEAD", async () => {
    await agentHttpRequest({ method: "HEAD", url: url() });
    expect(requestState.lastRequest?.method).toBe("HEAD");
  });

  it("falls back to GET for an unknown method (no injection)", async () => {
    await agentHttpRequest({ method: "BADCMD; rm -rf", url: url() });
    expect(requestState.lastRequest?.method).toBe("GET");
  });

  it("caps response bodies while streaming", async () => {
    requestState.responseBody = "x".repeat(1024 * 1024 + 10);
    const r = await agentHttpRequest({ method: "GET", url: url() });
    expect(r.body.length).toBe(1024 * 1024);
    expect(r.truncated).toBe(true);
  });

  it("blocks local and private network URLs before connecting", async () => {
    await expect(agentHttpRequest({ method: "GET", url: "http://127.0.0.1:3000/hook" })).rejects.toThrow(/local\/private/);
    await expect(agentHttpRequest({ method: "GET", url: "http://169.254.169.254/latest/meta-data" })).rejects.toThrow(/local\/private/);
    await expect(agentHttpRequest({ method: "GET", url: "http://localhost:3000/hook" })).rejects.toThrow(/localhost/);
    expect(requestState.lastRequest).toBeNull();
  });
});
