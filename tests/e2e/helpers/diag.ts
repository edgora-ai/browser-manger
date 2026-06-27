// Diagnostic helpers — screenshots, dialog cleanup, console-error filtering.
import * as fs from "node:fs";
import * as path from "node:path";
import type { Page } from "playwright";

const SCREENSHOTS_DIR = path.resolve(__dirname, "..", "screenshots");
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

export async function shot(page: Page, name: string, opts?: { dir?: string }): Promise<string> {
  const dir = opts?.dir ?? SCREENSHOTS_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name + ".png");
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

export async function closeAllDialogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.querySelectorAll("dialog").forEach((d) => {
      try {
        if ((d as HTMLDialogElement).open) (d as HTMLDialogElement).close();
      } catch (_) {
        /* ignore */
      }
    });
  });
}

export async function collectOpenDialogs(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("dialog"))
      .filter((d) => (d as HTMLDialogElement).open)
      .map((d) => d.id || d.tagName),
  );
}

const BENIGN_PATTERNS = [
  /EADDRINUSE/i,
  /MCP server/i,
  /DevTools/i,
  /favicon/i,
  /punycode/i,
  /Electron Security Warning/i,
];

export function filterKnownConsoleErrors(errors: string[]): string[] {
  return errors.filter((e) => !BENIGN_PATTERNS.some((re) => re.test(e)));
}
