// Canned ANSI replay for the dashboard's web terminal (WS /api/sessions/:id/terminal).
// It imitates an AI coding agent working on the fictional `acme/web` repo, so the
// terminal screenshot looks alive. Nothing here talks to a real container.

const ESC = "\x1b[";
const c = {
  reset: `${ESC}0m`, bold: `${ESC}1m`, dim: `${ESC}2m`, italic: `${ESC}3m`,
  fg: (n: number) => `${ESC}38;5;${n}m`,
  bg: (n: number) => `${ESC}48;5;${n}m`,
};
const ADDBG = `${ESC}48;2;20;58;32m`, DELBG = `${ESC}48;2;74;24;30m`;
const ORANGE = c.fg(209), GREEN = c.fg(114), GREY = c.fg(245), DARK = c.fg(240), WHITE = c.fg(255), BLUE = c.fg(111), RED = c.fg(203);

// Visible length (ANSI stripped).
const vlen = (s: string) => [...s.replace(/\x1b\[[0-9;]*m/g, "")].length;
const pad = (s: string, w: number) => s + " ".repeat(Math.max(0, w - vlen(s)));

function box(width: number, lines: string[], color = ORANGE): string[] {
  const inner = width - 2;
  return [
    `${color}╭${"─".repeat(inner)}╮${c.reset}`,
    ...lines.map((l) => `${color}│${c.reset}${pad(` ${l}`, inner)}${color}│${c.reset}`),
    `${color}╰${"─".repeat(inner)}╯${c.reset}`,
  ];
}

const tool = (name: string, arg: string) => `${GREEN}⏺${c.reset} ${c.bold}${name}${c.reset}(${arg})`;
const out = (s: string) => `  ${GREY}⎿${c.reset}  ${s}`;
const cont = (s: string) => `     ${s}`;
const say = (s: string) => `${WHITE}⏺${c.reset} ${s}`;
const add = (n: number, s: string, w: number) => `${ADDBG}${pad(`       ${GREY}${n}${c.reset}${ADDBG} ${GREEN}+${c.reset}${ADDBG}  ${s}`, w)}${c.reset}`;
const del = (n: number, s: string, w: number) => `${DELBG}${pad(`       ${GREY}${n}${c.reset}${DELBG} ${RED}-${c.reset}${DELBG}  ${s}`, w)}${c.reset}`;
const ctx = (n: number, s: string) => `       ${DARK}${n}${c.reset}    ${s}`;

/** The scrollback, as (delay ms before the line, line) pairs. */
function script(cols: number): [number, string][] {
  const w = Math.min(cols - 1, 110);
  const dw = Math.min(cols - 1, 96);
  const L: [number, string][] = [];
  const push = (ms: number, ...lines: string[]) => lines.forEach((l, i) => L.push([i === 0 ? ms : 25, l]));
  push(0, ...box(Math.min(w, 58), [
    `${ORANGE}✻${c.reset} ${c.bold}Welcome to Claude Code!${c.reset}`, "",
    `  ${GREY}${c.italic}/help for help, /status for your current setup${c.reset}`, "",
    `  ${GREY}cwd: /workspace  ·  branch: feat/checkout-redesign${c.reset}`,
  ]));
  push(150, "");
  push(80, `${GREY}>${c.reset} Redesign the checkout summary: group line items by seller, show a savings badge,`,
    `  and keep the e2e tests green. Commit when done.`, "");
  push(400, say("I'll start by mapping how the checkout summary is built today."), "");
  push(300, tool("Search", `pattern: "CheckoutSummary", path: "src"`), out(`Found ${c.bold}6${c.reset} files`), "");
  push(250, tool("Read", "src/checkout/CheckoutSummary.tsx"), out(`Read ${c.bold}184${c.reset} lines`), "");
  push(350, `${GREEN}⏺${c.reset} ${c.bold}Update Todos${c.reset}`,
    out(`${GREEN}☒${c.reset} ${DARK}${c.italic}Map the checkout summary data flow${c.reset}`),
    cont(`${GREEN}☒${c.reset} ${DARK}${c.italic}Group line items by seller${c.reset}`),
    cont(`${BLUE}☐${c.reset} ${c.bold}Add a SavingsBadge component${c.reset}`),
    cont(`☐ Update e2e tests for the new layout`), "");
  push(350, tool("Update", "src/checkout/CheckoutSummary.tsx"),
    out(`Updated ${c.bold}src/checkout/CheckoutSummary.tsx${c.reset} with ${GREEN}18 additions${c.reset} and ${RED}4 removals${c.reset}`),
    ctx(41, `  const { items, totals } = useCart();`),
    del(42, `  return items.map((item) => <LineItem key={item.id} item={item} />);`, dw),
    add(42, `  const groups = groupBy(items, (item) => item.seller.id);`, dw),
    add(43, `  return Object.entries(groups).map(([sellerId, lines]) => (`, dw),
    add(44, `    <SellerGroup key={sellerId} seller={lines[0].seller}>`, dw),
    add(45, `      {lines.map((item) => <LineItem key={item.id} item={item} />)}`, dw),
    add(46, `      {totals.savings > 0 && <SavingsBadge amount={totals.savings} />}`, dw),
    add(47, `    </SellerGroup>`, dw),
    add(48, `  ));`, dw),
    "");
  push(400, tool("Bash", "bun test src/checkout"),
    out(`${GREEN}✓${c.reset} groups line items by seller ${DARK}[3.1ms]${c.reset}`),
    cont(`${GREEN}✓${c.reset} renders one SavingsBadge per seller with a discount ${DARK}[2.4ms]${c.reset}`),
    cont(`${DARK}… +11 lines (ctrl+r to expand)${c.reset}`),
    cont(`${GREEN}${c.bold}14 pass${c.reset}  ${DARK}0 fail · 38 expect() calls${c.reset}`), "");
  push(300, tool("Bash", "bunx playwright test e2e/checkout.spec.ts --update-snapshots"),
    out(`${GREEN}✓${c.reset}  1 [chromium] › checkout.spec.ts:12 › summary groups by seller ${DARK}(1.8s)${c.reset}`),
    cont(`${GREEN}✓${c.reset}  2 [chromium] › checkout.spec.ts:31 › savings badge is visible ${DARK}(1.2s)${c.reset}`),
    cont(`${ORANGE}…${c.reset}  3 [webkit]   › checkout.spec.ts:12 › summary groups by seller`), "");
  return L;
}

const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

function bottom(cols: number, frame: number, secs: number): string[] {
  const w = Math.min(cols - 1, 110);
  return [
    `${ORANGE}${SPIN[frame % SPIN.length]} Running e2e snapshots…${c.reset} ${GREY}(${secs}s · ↓ 3.4k tokens · esc to interrupt)${c.reset}`,
    "",
    ...box(w, [`${GREY}>${c.reset} `], DARK),
    `  ${c.fg(176)}⏵⏵ bypass permissions on${c.reset} ${DARK}(shift+tab to cycle)${c.reset}${" ".repeat(Math.max(1, w - 70))}${DARK}Context left until auto-compact: 61%${c.reset}`,
  ];
}

export interface Replay { resize(cols: number, rows: number): void; stop(): void }

/** Starts the replay on the first resize; `send` writes raw terminal output. */
export function terminalReplay(send: (data: string) => void): Replay {
  let started = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let spin: ReturnType<typeof setInterval> | null = null;
  let cols = 120, rows = 40;

  function render(animated: boolean) {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (spin) clearInterval(spin);
    const lines = script(cols);
    send(`${ESC}2J${ESC}3J${ESC}H`);
    let at = 0;
    lines.forEach(([ms, line], i) => {
      at += animated ? ms : 0;
      const write = () => send((i === 0 ? "" : "\r\n") + line);
      if (animated) timers.push(setTimeout(write, at)); else write();
    });
    const t0 = Date.now();
    const drawBottom = () => {
      const b = bottom(cols, 0, 48);
      send("\r\n\r\n" + b.join("\r\n"));
      const total = lines.length + 1 + b.length;
      const spinRow = (total > rows ? rows : total) - b.length + 1;
      const inputRow = spinRow + 3;
      let frame = 0;
      const tick = () => {
        frame++;
        const secs = 48 + Math.floor((Date.now() - t0) / 1000);
        send(`${ESC}s${ESC}${spinRow};1H${ESC}2K${bottom(cols, frame, secs)[0]}${ESC}u`);
      };
      send(`${ESC}${inputRow};5H`);
      spin = setInterval(tick, 120);
    };
    if (animated) timers.push(setTimeout(drawBottom, at + 300)); else drawBottom();
  }

  return {
    resize(c2, r2) {
      const changed = c2 !== cols || r2 !== rows;
      cols = c2; rows = r2;
      if (!started) { started = true; render(true); }
      else if (changed) render(false);
    },
    stop() { for (const t of timers) clearTimeout(t); if (spin) clearInterval(spin); },
  };
}
