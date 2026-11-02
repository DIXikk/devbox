#!/usr/bin/env bun
// Screenshots of the dashboard served by the demo devd (tools/demo/server.ts).
//
//   bun run capture.mjs [--base http://127.0.0.1:4399] [--out ../../docs/assets]
//
// Plain JS on purpose: the root `tsc` typechecks everything outside dashboard/, and
// `playwright` is only installed here (tools/demo/node_modules), not in the workspace.

import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BASE = arg("base", "http://127.0.0.1:4399");
const OUT = resolve(arg("out", join(import.meta.dir, "../../docs/assets")));
mkdirSync(OUT, { recursive: true });

/** Each shot: file name, hash route, optional extra preparation, settle time. */
const SHOTS = [
  { name: "dashboard-overview", route: "/" , wait: 2500 },
  { name: "dashboard-sessions", route: "/sessions", wait: 2500 },
  { name: "dashboard-terminal", route: "/terminal/dev-acme-web", wait: 7500 },
  {
    name: "dashboard-stats", route: "/stats", wait: 2500,
    prepare: async (page) => { await page.getByRole("button", { name: "30 days" }).first().click(); },
  },
  { name: "dashboard-ssh-approvals", route: "/ssh-approvals", wait: 2000 },
  { name: "dashboard-prod-writes", route: "/prod-writes", wait: 2000 },
  { name: "dashboard-hardware", route: "/hardware", wait: 3000 },
];

// Playwright's pinned Chromium may not be downloaded; fall back to any cached build.
function fallbackChromium() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), "Library/Caches/ms-playwright");
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort().reverse()) {
    for (const sub of readdirSync(join(cache, dir))) {
      const bin = join(cache, dir, sub, "chrome-headless-shell");
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}

async function launch() {
  try { return await chromium.launch(); }
  catch (e) {
    const executablePath = process.env.CHROMIUM_PATH ?? fallbackChromium();
    if (!executablePath) throw e;
    console.warn(`bundled chromium unavailable, using ${executablePath}`);
    return chromium.launch({ executablePath });
  }
}

const browser = await launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: "dark",
  locale: "en-US", timezoneId: "UTC",
});
await ctx.addInitScript(() => { try { localStorage.setItem("devbox-theme", "dark"); } catch {} });

const only = process.argv.slice(2).filter((a) => !a.startsWith("--") && !a.includes("://") && !a.includes("/"));
for (const shot of SHOTS.filter((s) => only.length === 0 || only.includes(s.name))) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${shot.route}`, { waitUntil: "networkidle" });
  if (shot.prepare) { await page.waitForTimeout(800); await shot.prepare(page); }
  await page.waitForTimeout(shot.wait);
  const file = join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file });
  console.log(`saved ${file}`);
  await page.close();
}
await browser.close();
