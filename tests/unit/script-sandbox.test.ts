import { describe, it, expect } from "vitest";
import { runSandboxed } from "../../src/main/services/script-sandbox.js";

describe("script-sandbox", () => {
  it("returns a plain value", () => {
    expect(runSandboxed("return 'ok';")).toBe("ok");
    expect(runSandboxed("return 1 + 2;")).toBe(3);
  });

  it("can use Promise + setTimeout (compat with existing rules)", async () => {
    const r = await Promise.resolve(runSandboxed("return new Promise(function(res){ setTimeout(function(){ res('done'); }, 5); });"));
    expect(r).toBe("done");
  });

  it("routes console.log to the injected logger", () => {
    const logs: string[] = [];
    runSandboxed("console.log('hello', 42); return 1;", { logger: (m) => logs.push(m) });
    expect(logs[0]).toContain("hello");
    expect(logs[0]).toContain("42");
  });

  it("exposes injected env values read-only-ish", () => {
    const r = runSandboxed("return env.foo + '_' + env.bar;", { env: { foo: "a", bar: "b" } });
    expect(r).toBe("a_b");
  });

  it("BLOCKS access to require (no module escape)", () => {
    expect(() => runSandboxed("return require('fs');")).toThrow();
  });

  it("BLOCKS access to process", () => {
    expect(() => runSandboxed("return process.env;")).toThrow();
  });

  it("BLOCKS access to the global object / main-thread globals", () => {
    // In a fresh vm context, globalThis is the sandbox — process is unreachable
    // (undefined), proving no escape to the Node main global.
    expect(runSandboxed("return typeof globalThis.process;")).toBe("undefined");
    expect(runSandboxed("return typeof globalThis.require;")).toBe("undefined");
  });

  it("kills a synchronous infinite loop via the timeout", () => {
    expect(() => runSandboxed("while(true){}", {}, 200)).toThrow();
  });

  it("throws on empty script", () => {
    expect(() => runSandboxed("   ")).toThrow(/empty/i);
  });

  it("propagates a thrown error", () => {
    expect(() => runSandboxed("throw new Error('boom-sentinel');")).toThrow(/boom-sentinel/);
  });
});
