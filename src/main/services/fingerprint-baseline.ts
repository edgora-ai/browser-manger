// Fingerprint baseline + drift detection — the trust foundation the scenario
// eval flagged ("可信反检测 = 可证明稳定"). Capture a per-profile signature of
// the live browser fingerprint (UA / platform / languages / hardware / screen /
// timezone / WebGL / canvas), store it as the profile's baseline, and diff
// subsequent captures so drift is visible/auditable before it causes account
// loss. Pure logic for capture/diff (testable); CDP connection injected.
import { cdpConnect, cdpEvaluate } from "./local-agent.js";

/** The in-page expression that collects the fingerprint signature. */
export const CAPTURE_EXPRESSION = `(function(){
  var o = {};
  try { o.userAgent = navigator.userAgent; } catch(e){}
  try { o.platform = navigator.platform; } catch(e){}
  try { o.language = navigator.language; } catch(e){}
  try { o.languages = (navigator.languages || []).join(","); } catch(e){}
  try { o.hardwareConcurrency = navigator.hardwareConcurrency; } catch(e){}
  try { o.deviceMemory = navigator.deviceMemory; } catch(e){}
  try { o.screenW = screen.width; o.screenH = screen.height; } catch(e){}
  try { o.availW = screen.availWidth; o.availH = screen.availHeight; } catch(e){}
  try { o.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch(e){}
  try { o.tzOffset = new Date().getTimezoneOffset(); } catch(e){}
  try { o.uaPlatform = navigator.userAgentData ? navigator.userAgentData.platform : null; } catch(e){}
  try {
    var c = document.createElement("canvas");
    var gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (gl) {
      o.glVendor = gl.getParameter(gl.VENDOR);
      var dbg = gl.getExtension("WEBGL_debug_renderer_info");
      o.glRenderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null;
    }
  } catch(e){}
  try {
    var c2 = document.createElement("canvas"); c2.width = 64; c2.height = 16;
    var x = c2.getContext("2d"); x.textBaseline = "top"; x.font = "12px Arial";
    x.fillText("CloakLite-FP", 2, 2);
    o.canvasLen = c2.toDataURL().length;
  } catch(e){}
  return JSON.stringify(o);
})()`;

export type Fingerprint = Record<string, string | number | null | boolean>;

/** Capture the live fingerprint from a running profile via CDP. */
export async function captureFingerprint(cdpPort: number): Promise<Fingerprint> {
  const client = await cdpConnect(cdpPort);
  try {
    const raw = await cdpEvaluate(client, CAPTURE_EXPRESSION);
    const value = typeof raw === "string" ? raw : raw?.value;
    return typeof value === "string" ? JSON.parse(value) : (value || {});
  } finally {
    try { (client as any).ws?.close?.(); } catch { /* ignore */ }
  }
}

export interface FingerprintDrift {
  field: string;
  baseline: unknown;
  current: unknown;
}

/** Compare two fingerprints; return the changed fields (drift). */
export function diffFingerprints(baseline: Fingerprint | null | undefined, current: Fingerprint): FingerprintDrift[] {
  if (!baseline) return [];
  const drift: FingerprintDrift[] = [];
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const k of keys) {
    const b = (baseline as any)[k];
    const c = (current as any)[k];
    if (b === undefined && c === undefined) continue;
    if (String(b ?? "") !== String(c ?? "")) {
      drift.push({ field: k, baseline: b ?? null, current: c ?? null });
    }
  }
  return drift;
}

/** True if the drift contains a high-risk signal field. */
export function hasRiskyDrift(drift: FingerprintDrift[]): boolean {
  const risky = new Set(["userAgent", "platform", "uaPlatform", "tz", "tzOffset", "glVendor", "glRenderer", "hardwareConcurrency", "deviceMemory", "screenW", "screenH"]);
  return drift.some((d) => risky.has(d.field));
}
