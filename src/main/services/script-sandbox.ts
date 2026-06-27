// Sandboxed custom-js runtime — replaces the old `new Function(jsCode)` eval
// that ran ARBITRALITY code with full Node access in the Electron main process.
// Now runs in a `vm` sandbox with a deny-by-default context (no require /
// process / fs / child_process / global) and a synchronous-loop timeout. The
// caller's wall-clock timeout (JobGuard/withTimeout) still bounds pending
// promises, so setTimeout/Promise are provided for compatibility.
import * as vm from "node:vm";

export interface SandboxContext {
  logger?: (msg: string) => void;
  /** Extra read-only values exposed to the script (e.g. vars). */
  env?: Record<string, unknown>;
}

const SAFE_GLOBALS: Record<string, unknown> = {
  JSON, Math, Date, Array, Object, String, Number, Boolean, Map, Set, WeakMap, WeakSet,
  Promise, Symbol, Reflect, Proxy,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  setTimeout, clearTimeout, setInterval, clearInterval,
  queueMicrotask,
};

/**
 * Run user JS in a locked-down sandbox. Returns the script's return value
 * (or a Promise if it returns one). Throws on syntax errors, synchronous
 * runtime errors, or a synchronous-loop timeout.
 */
export function runSandboxed(code: string, ctx: SandboxContext = {}, timeoutMs = 30_000): unknown {
  if (typeof code !== "string" || code.trim() === "") throw new Error("empty script");
  const logger = typeof ctx.logger === "function" ? ctx.logger : () => {};
  const sandbox: Record<string, unknown> = {
    ...SAFE_GLOBALS,
    console: {
      log: (...a: unknown[]) => logger(a.map(stringify).join(" ")),
      warn: (...a: unknown[]) => logger("[warn] " + a.map(stringify).join(" ")),
      error: (...a: unknown[]) => logger("[error] " + a.map(stringify).join(" ")),
      info: (...a: unknown[]) => logger(a.map(stringify).join(" ")),
    },
    logger,
    env: ctx.env || {},
  };
  // Wrap in an IIFE so top-level `return` works (matches the old new Function shape).
  const wrapped = "(function(){\n" + code + "\n})();";
  // vm throws ERR_SCRIPT_EXECUTION_TIMEOUT on sync-loop overrun.
  return vm.runInNewContext(wrapped, sandbox, {
    filename: "automation-custom-js",
    timeout: Math.max(100, timeoutMs),
    microtaskMode: "afterEvaluate",
  });
}

function stringify(v: unknown): string {
  try {
    return typeof v === "string" ? v : JSON.stringify(v);
  } catch { return String(v); }
}
