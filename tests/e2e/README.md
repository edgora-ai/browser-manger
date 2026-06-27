# E2E test suite

Drives the **real CloakLite Electron app** via [Playwright's Electron API]
(`playwright._electron`). Each journey launches the app with an isolated
`--user-data-dir`, exercises a full user path, and tears down all spawned
Chromium processes.

## Layout

```
tests/e2e/
  journey.test.ts            # fast smoke (10 steps, ~10s) — runs in `npm test`
  j1-profile-launch.test.ts  # J1: create → launch → CDP fingerprint verify → stop
  j2-batch-profiles.test.ts  # J2: bulk-import 3 → Start All → distinct ports/dirs/fp → Stop All
  j3-extensions.test.ts      # J3: add Chrome ext → enable → launch → --load-extension (network-gated)
  j4-agent-stream.test.ts    # J4: mock LLM → config → chat → stream → persist after restart
  helpers/
    app.ts                   # setupTestApp / closeApp / wizard-dismiss / stopAllProfiles
    cdp.ts                   # CDP client (ws) — Browser.getVersion, Runtime.evaluate, target polling
    mock-llm.ts              # OpenAI-compatible SSE mock server on a free port
    diag.ts                  # screenshots, closeAllDialogs, console-error filtering
    find.ts                  # language-agnostic locators (data-tab, data-cmd)
  screenshots/               # PNG evidence per step
  userdata/                  # per-journey isolated Electron userData (j1/j2/j3/j4/journey)
```

## Run

```bash
# Fast suite: unit + smoke + core journey (~10s)
npm test

# All deep journeys (J1, J2, J4; J3 auto-skips without network)
npm run test:e2e

# One journey at a time
npm run test:e2e:j1
npm run test:e2e:j2
npm run test:e2e:j3   # needs Chrome Web Store network → set E2E_EXTENSION_NETWORK=1
npm run test:e2e:j4
```

## What each journey verifies

| Journey | Asserts |
|---------|---------|
| **J1** | `Browser.getVersion` UA contains `Windows NT 10.0`; `navigator.platform === "Win32"`; CDP port closes after stop |
| **J2** | 3 distinct CDP ports; 3 isolated `--user-data-dir`; 3 distinct `--fingerprint=<seed>`; all ports refuse connections after Stop All |
| **J3** | `manifest.json` on disk; `--load-extension=` + `--disable-extensions-except=` in `ps aux`; path references the extension id |
| **J4** | ≥3 `agent:stream-chunk` events; full text rendered; mock received exactly 1 request with `"hi"`; conversation + assistant reply persist after app restart |

## Prerequisites

- **CloakBrowser binary** cached at `~/.cloakbrowser/chromium-<ver>/` (or set
  `CLOAKBROWSER_BINARY_PATH`). `setupTestApp` auto-detects it so launches don't
  re-download or re-verify checksums (which need network to cloakbrowser.dev).
- **J3 only**: needs to reach `clients2.google.com`. Either:
  - `E2E_EXTENSION_NETWORK=1` — host has direct internet, OR
  - `E2E_TEST_PROXY=http://host:port` (or `socks5://...`) — host can't reach
    Google directly but a proxy can. The app's default proxy is configured via
    IPC so the CRX download routes through it (the real product path).
  - Otherwise J3 is skipped.
- Runs **serially** (no file parallelism) — only one Electron app at a time, or
  the CDP port allocator and MCP port 26581 collide.

## Troubleshooting

- **`EADDRINUSE 26581`** / **`launch success: false`**: orphaned Electron from a
  previous run. Kill with `pkill -9 -f Chromium; pkill -9 -f "MacOS/Electron"`,
  then rerun.
- **J2 `launched.length === 0`**: same cause — orphaned Chromium holds the CDP
  ports. Clean and rerun.
- Flaky failures usually mean a process leaked; `closeApp` SIGKILLs orphans via
  `pkill -f` on the userData dir + `.cloakbrowser`.
