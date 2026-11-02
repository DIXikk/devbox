// Renders social-preview.html to docs/assets/social-preview.png (upload it in the repository
// settings → Social preview; GitHub has no API for it).
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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

const here = fileURLToPath(new URL(".", import.meta.url));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 640 } });
await page.goto(`file://${here}social-preview.html`);
await page.waitForLoadState("networkidle");
await page.screenshot({ path: `${here}../../docs/assets/social-preview.png` });
await browser.close();
