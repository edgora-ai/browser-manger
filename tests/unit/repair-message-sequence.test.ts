import { describe, it, expect } from "vitest";
import { repairMessageSequence } from "../../src/main/ipc/agent.js";
import type { LlmMessage } from "../../src/main/services/local-agent.js";

const u = (c: string): LlmMessage => ({ role: "user", content: c });
const a = (c: string): LlmMessage => ({ role: "assistant", content: c });

describe("repairMessageSequence", () => {
  it("passes a clean alternating history through unchanged", () => {
    const msgs = [u("hi"), a("hello"), u("again")];
    expect(repairMessageSequence(msgs).map((m) => m.content)).toEqual(["hi", "hello", "again"]);
    expect(repairMessageSequence(msgs).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("collapses consecutive user turns (the failed-run orphan case)", () => {
    // Three failed retries left [u, u, u] with no assistant in between.
    const msgs = [u("打开百度"), u("打开百度"), u("打开百度")];
    const out = repairMessageSequence(msgs);
    expect(out.length).toBe(1);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toContain("打开百度");
  });

  it("merges distinct consecutive user content with a separator", () => {
    const out = repairMessageSequence([u("first"), u("second")]);
    expect(out.length).toBe(1);
    expect(out[0].content).toBe("first\n\nsecond");
  });

  it("merges consecutive assistant turns", () => {
    const out = repairMessageSequence([u("q"), a("p1"), a("p2")]);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(out[1].content).toBe("p1\n\np2");
  });

  it("drops orphaned tool messages with no matching upstream tool_call", () => {
    const msgs: any[] = [
      u("q"),
      { role: "tool", tool_call_id: "call_ghost", content: "orphan" },
      a("reply"),
    ];
    const out = repairMessageSequence(msgs);
    expect(out.some((m: any) => m.role === "tool")).toBe(false);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("keeps tool messages whose id matches an upstream assistant tool_call", () => {
    const msgs: any[] = [
      u("q"),
      { role: "assistant", content: "", tool_calls: [{ id: "call_1" }] },
      { role: "tool", tool_call_id: "call_1", content: "result" },
    ];
    const out = repairMessageSequence(msgs);
    expect(out.some((m: any) => m.role === "tool" && m.tool_call_id === "call_1")).toBe(true);
  });

  it("strips a trailing assistant turn that has unsatisfied tool_calls", () => {
    // A truncated history ends on an assistant tool_call with no following tool
    // result — the next user turn can't satisfy it, so drop it.
    const msgs: any[] = [
      u("q"),
      { role: "assistant", content: "", tool_calls: [{ id: "call_x" }] },
    ];
    const out = repairMessageSequence(msgs);
    expect(out[out.length - 1].role).toBe("user");
    expect(out.some((m: any) => Array.isArray(m.tool_calls) && m.tool_calls.length)).toBe(false);
  });

  it("returns an empty array for empty input", () => {
    expect(repairMessageSequence([])).toEqual([]);
  });
});
