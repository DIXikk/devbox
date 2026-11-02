// Invented demo data for the demo devd (tools/demo/server.ts).
//
// EVERYTHING here is fictional: the `acme` / `labs` organisations, repos, hostnames
// (*.example.com), IPs (192.0.2.0/24 TEST-NET-1 and 100.64.0.0/10 CGNAT examples) and
// numbers. Shapes follow devd/src/api.ts and dashboard/src/api.ts; values are generated
// from a fixed seed relative to "now", so every run looks the same (modulo the clock).

import type { AgentName, SessionRow } from "../../devd/src/db";
import type { TmuxSession } from "../../devd/src/tmux";
import type { TreeProject } from "../../devd/src/tree";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const GB = 1024 ** 3;

/** Deterministic PRNG (mulberry32) — same seed, same "random" charts. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/* ------------------------------------------------------------------ tree */

interface RepoDef { folder: string; project: string; repo: string; agent?: AgentName | null }
const REPOS: RepoDef[] = [
  { folder: "acme", project: "acme", repo: "web", agent: "claude" },
  { folder: "acme", project: "acme", repo: "api", agent: "codex" },
  { folder: "acme", project: "acme", repo: "mobile", agent: "claude" },
  { folder: "acme", project: "acme", repo: "docs" },
  { folder: "acme", project: "acme", repo: "infra" },
  { folder: "labs", project: "labs", repo: "ml-pipeline", agent: "claude-gemini" },
  { folder: "labs", project: "labs", repo: "notebooks" },
];

export function tree(): TreeProject[] {
  const byProject = new Map<string, TreeProject>();
  for (const r of REPOS) {
    const key = `${r.folder}/${r.project}`;
    if (!byProject.has(key)) byProject.set(key, { folder: r.folder, project: r.project, repos: [], soloAgent: null });
    byProject.get(key)!.repos.push({
      name: r.repo, cloneUrl: `git@github.com:${r.project}/${r.repo}.git`, provider: "github",
      cloned: r.repo !== "notebooks", bare: true, agent: r.agent ?? null,
    });
  }
  return [...byProject.values()];
}

/* -------------------------------------------------------------- sessions */

export interface DemoSession extends SessionRow {
  claudeState: "working" | "waiting" | "idle";
  cpuPct: number; memBytes: number; dindMemBytes: number;
  accountId: string | null;
  tmux: TmuxSession[];
  cost: number; tokens: number;
}

const T0 = Date.now();

function mk(i: number, p: Partial<DemoSession> & { project: string; repo: string; suffix?: string }): DemoSession {
  const id = `dev-${p.project}-${p.repo}${p.suffix ?? ""}`;
  const port_base = 40100 + i * 20;
  return {
    id, folder: p.folder ?? p.project, project: p.project, repo: p.repo, container: id,
    port_base, status: p.status ?? "running", solo: 0,
    created_at: p.created_at ?? T0 - 3 * HOUR, last_active_at: p.last_active_at ?? T0 - 2 * MIN,
    important: p.important ?? 0, name: p.name ?? null, critic: p.critic ?? 0, agent: p.agent ?? "claude",
    auto_end: 0, worktree: `/srv/dev/_sessions/${id}`, branch: p.branch ?? `agent/${p.repo}`, host: "vps",
    claudeState: p.claudeState ?? "idle", cpuPct: p.cpuPct ?? 0, memBytes: p.memBytes ?? 0, dindMemBytes: p.dindMemBytes ?? 0,
    accountId: p.accountId === undefined ? "primary" : p.accountId,
    tmux: p.tmux ?? [{ name: "main", label: null, agent: p.agent ?? "claude", title: null, attached: 1 }],
    cost: p.cost ?? 0, tokens: p.tokens ?? 0,
  };
}

export const sessions: DemoSession[] = [
  mk(0, {
    project: "acme", repo: "web", name: "Checkout redesign", agent: "claude", claudeState: "working", important: 1, critic: 1,
    created_at: T0 - 5 * HOUR - 12 * MIN, last_active_at: T0 - 20_000, cpuPct: 184, memBytes: 3.4 * GB, dindMemBytes: 0.6 * GB,
    branch: "feat/checkout-redesign", cost: 18.42, tokens: 21_400_000,
    tmux: [
      { name: "main", label: "checkout", agent: "claude", title: "✳ Checkout redesign", attached: 1 },
      { name: "main-2", label: "e2e tests", agent: "claude", title: "✳ Playwright e2e", attached: 0 },
    ],
  }),
  mk(1, {
    project: "acme", repo: "api", name: "Rate limiter", agent: "codex", claudeState: "working", accountId: null,
    created_at: T0 - 2 * HOUR - 41 * MIN, last_active_at: T0 - 45_000, cpuPct: 96, memBytes: 2.1 * GB,
    branch: "feat/rate-limits", cost: 6.87, tokens: 9_800_000,
  }),
  mk(2, {
    project: "acme", repo: "mobile", name: "Push permissions", agent: "claude", claudeState: "waiting",
    created_at: T0 - 26 * HOUR, last_active_at: T0 - 6 * MIN, cpuPct: 4, memBytes: 1.6 * GB,
    branch: "fix/push-permissions", cost: 9.15, tokens: 12_300_000, accountId: "backup",
  }),
  mk(3, {
    project: "labs", repo: "ml-pipeline", name: "Feature store backfill", agent: "claude-gemini", claudeState: "working", accountId: null,
    created_at: T0 - 7 * HOUR, last_active_at: T0 - 90_000, cpuPct: 310, memBytes: 7.8 * GB,
    branch: "feat/backfill", cost: 4.32, tokens: 15_100_000,
  }),
  mk(4, {
    project: "acme", repo: "web", suffix: "-2", name: "Vite upgrade", agent: "grok", claudeState: "idle", accountId: null,
    created_at: T0 - 50 * MIN, last_active_at: T0 - 14 * MIN, cpuPct: 1, memBytes: 0.9 * GB,
    branch: "chore/upgrade-vite", cost: 1.12, tokens: 2_600_000,
  }),
  mk(5, {
    project: "acme", repo: "docs", agent: "claude", status: "stopped", claudeState: "idle",
    created_at: T0 - 3 * DAY, last_active_at: T0 - 9 * HOUR, branch: "docs/api-reference", cost: 2.4, tokens: 3_100_000,
  }),
  mk(6, {
    project: "acme", repo: "infra", agent: "codex", status: "stopped", claudeState: "idle", accountId: null,
    created_at: T0 - 5 * DAY, last_active_at: T0 - 2 * DAY, branch: "ops/terraform-1.9", cost: 0.86, tokens: 1_200_000,
  }),
];

const PORTS = (base: number) => Array.from({ length: 10 }, (_, i) => ({ host: base + i, container: 3000 + i }));

/** Row shape of GET /api/sessions (CLI) — SessionRow + ports (+ tmux on ?tmux=1). */
export function sessionInfo(s: DemoSession, withTmux: boolean) {
  const { claudeState, cpuPct: _c, memBytes: _m, dindMemBytes: _d, accountId: _a, tmux, cost: _co, tokens: _t, ...row } = s;
  return { ...row, ports: PORTS(s.port_base), claudeState, ...(withTmux ? { tmux } : {}), dockerHost: null };
}

/** Row shape of GET /api/stats/live (dashboard). */
export function sessionLive(s: DemoSession) {
  return {
    ...sessionInfo(s, false), claudeState: s.claudeState,
    cpuPct: s.status === "running" ? s.cpuPct : 0, memBytes: s.status === "running" ? s.memBytes : 0,
    workspace: s.worktree, accountId: s.accountId, tainted: false,
  };
}

let nextPort = 7;
export function addSession(folder: string, project: string, repo: string, agent: AgentName): DemoSession {
  const siblings = sessions.filter((s) => s.project === project && s.repo === repo).length;
  const s = mk(nextPort++, {
    folder, project, repo, suffix: siblings ? `-${siblings + 1}` : "", agent, claudeState: "idle",
    created_at: Date.now(), last_active_at: Date.now(), cpuPct: 2, memBytes: 0.4 * GB,
    branch: `agent/${repo}-${siblings + 1}`, accountId: agent === "claude" ? "primary" : null,
  });
  sessions.push(s);
  return s;
}

/* ----------------------------------------------------------------- stats */

const PROJECT_WEIGHTS: [string, number][] = [["acme", 0.71], ["labs", 0.29]];
const REPO_WEIGHTS: [string, number][] = [["web", 0.36], ["api", 0.22], ["mobile", 0.15], ["ml-pipeline", 0.19], ["docs", 0.05], ["infra", 0.03]];
const MODEL_WEIGHTS: [string, number][] = [
  ["claude-opus-4-1", 0.48], ["claude-sonnet-4-5", 0.21], ["gpt-5-codex", 0.17], ["gemini-2.5-pro", 0.09], ["grok-code-fast-1", 0.05],
];

function dayValue(day: number, seed: number) {
  const r = rng(Math.floor(day / DAY) * 7 + seed);
  const wd = new Date(day).getDay();
  const weekend = wd === 0 || wd === 6 ? 0.35 : 1;
  const cost = round((22 + r() * 34) * weekend);
  return { day, cost, tokens: Math.round(cost * 1_150_000 * (0.8 + r() * 0.4)), hours: round((5 + r() * 6) * weekend, 1) };
}

export function statsRange(from: number, to: number, project: string | null, repo: string | null) {
  const now = Date.now();
  const end = Math.min(to, now);
  const scale = (project ? (PROJECT_WEIGHTS.find(([p]) => p === project)?.[1] ?? 0.1) : 1)
    * (repo ? (REPO_WEIGHTS.find(([r]) => r === repo)?.[1] ?? 0.1) : 1);
  const daily: { day: number; cost: number; tokens: number; hours: number }[] = [];
  for (let d = startOfDay(from); d < end; d += DAY) {
    const v = dayValue(d, 1);
    // Today is only partially done.
    const part = d === startOfDay(now) ? Math.min(1, (now - d) / DAY * 1.6) : 1;
    daily.push({ day: d, cost: round(v.cost * part * scale), tokens: Math.round(v.tokens * part * scale), hours: round(v.hours * part * scale, 1) });
  }
  const sum = (k: "cost" | "tokens" | "hours") => daily.reduce((a, b) => a + b[k], 0);
  const totals = { cost: round(sum("cost")), tokens: sum("tokens"), hours: round(sum("hours"), 1) };
  const previous = { cost: round(totals.cost * 0.83), tokens: Math.round(totals.tokens * 0.8), hours: round(totals.hours * 0.9, 1) };
  const r = rng(99);
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const w = h < 7 ? 0.05 : h < 9 ? 0.5 : h < 12 ? 1 : h < 13 ? 0.6 : h < 18 ? 0.95 : h < 23 ? 0.55 : 0.2;
    const c = round(totals.cost / 12 * w * (0.7 + r() * 0.6));
    return { hour: h, cost: c, hours: round(totals.hours / 12 * w, 2) };
  });
  const split = <K extends string>(rows: [string, number][], key: K) =>
    rows.map(([k, w]) => ({ [key]: k, cost: round(totals.cost * w), tokens: Math.round(totals.tokens * w) }) as Record<K, string> & { cost: number; tokens: number });
  const hostSplit = (h: string, w: number) => ({ key: h, cost: round(totals.cost * w), tokens: Math.round(totals.tokens * w), hours: round(totals.hours * w, 1) });
  return {
    from, to, project, repo,
    repoOptions: REPO_WEIGHTS.map(([r]) => r),
    totals, previous, daily, hourly,
    projects: split(PROJECT_WEIGHTS, "project"),
    models: split(MODEL_WEIGHTS, "model"),
    repos: split(REPO_WEIGHTS, "repo"),
    prompts: {
      chars: { count: Math.round(totals.hours * 9), avg: 412, p50: 238, p90: 1180 },
      waitMs: { count: Math.round(totals.hours * 9), avg: 6.1 * MIN, p50: 2.4 * MIN, p90: 17 * MIN },
    },
    hosts: [hostSplit("devbox", 0.82), hostSplit("mac", 0.18)],
    hostsPrevious: [hostSplit("devbox", 0.82 * 0.83), hostSplit("mac", 0.18 * 0.83)],
    accounts: [
      { key: "primary", ...pick(hostSplit("x", 0.58)) },
      { key: "backup", ...pick(hostSplit("x", 0.21)) },
      { key: "codex-pro", ...pick(hostSplit("x", 0.21)) },
    ],
    dailyByHost: [
      { host: "devbox", days: daily.map((d) => ({ ...d, cost: round(d.cost * 0.82), tokens: Math.round(d.tokens * 0.82), hours: round(d.hours * 0.8, 1) })) },
      { host: "mac", days: daily.map((d, i) => ({ ...d, cost: round(d.cost * (0.1 + (i % 3) * 0.06)), tokens: Math.round(d.tokens * 0.18), hours: round(d.hours * 0.2, 1) })) },
    ],
  };
}
const pick = (h: { cost: number; tokens: number; hours: number }) => ({ cost: h.cost, tokens: h.tokens, hours: h.hours });

export function workHours(from: number, to: number) {
  const s = statsRange(from, to, null, null);
  const total = round(s.totals.hours * 1.35, 1);
  return {
    totalHours: total,
    byProject: [
      { project: "acme", hours: round(total * 0.68, 1), cappedHours: round(total * 0.64, 1) },
      { project: "labs", hours: round(total * 0.32, 1), cappedHours: round(total * 0.3, 1) },
    ],
    daily: s.daily.map((d) => ({ day: d.day, hours: round(d.hours * 1.35, 1) })),
  };
}

export function totals() {
  const today = statsRange(startOfDay(Date.now()), startOfDay(Date.now()) + DAY, null, null);
  const month = statsRange(Date.now() - 30 * DAY, Date.now(), null, null);
  return {
    hoursToday: today.totals.hours, tokensToday: today.totals.tokens, costToday: today.totals.cost,
    costMonth: month.totals.cost, commitsToday: 23, unpushed: 4,
  };
}

/* ----------------------------------------------------------------- usage */

/** GET /api/usage — weekly quota history per account (shared/usage.ts). */
export function usage(from: number, to: number) {
  const mkAcc = (provider: "claude" | "codex" | "grok", accountId: string, accountLabel: string, base: number, slope: number, seed: number) => {
    const r = rng(seed);
    const lastReset = startOfDay(Date.now()) - 3 * DAY + 9 * HOUR;
    const nextReset = lastReset + 7 * DAY;
    const history: { window: string; percentUsed: number; resetsAt: number; sampledAt: number }[] = [];
    for (let t = from; t <= Math.min(to, Date.now()); t += 20 * MIN) {
      const sinceReset = t >= lastReset ? t - lastReset : t - (lastReset - 7 * DAY);
      // Usage only grows within a quota week (it drops back at the reset).
      const raw = Math.min(99, base + (sinceReset / DAY) * slope * (0.92 + r() * 0.16));
      const prev = history.at(-1);
      const pct = prev && prev.resetsAt === (t >= lastReset ? nextReset : lastReset) ? Math.max(prev.percentUsed, raw) : raw;
      history.push({ window: "seven_day", percentUsed: Math.round(pct), resetsAt: t >= lastReset ? nextReset : lastReset, sampledAt: t });
    }
    const last = history.at(-1);
    return {
      provider, accountId, accountLabel, identityKey: `${provider}:${accountId}`, state: "ok" as const, detail: "",
      latest: last ? [{ ...last, sampledAt: Date.now() - 4 * MIN }] : [], history,
      resets: [{ window: "seven_day", resetsAt: lastReset }],
    };
  };
  return {
    from, to,
    accounts: [
      mkAcc("claude", "primary", "Max · primary", 2, 13.5, 11),
      mkAcc("claude", "backup", "Max · backup", 1, 6.2, 12),
      mkAcc("codex", "codex-pro", "Pro", 3, 9.8, 13),
    ],
  };
}

export function accounts() {
  const now = Date.now();
  const acc = (id: string, label: string, five: number, seven: number) => ({
    id, label, disabled: false, quarantined: false,
    fiveHourPct: five, fiveHourResetsAt: now + 2 * HOUR + 14 * MIN, sevenDayPct: seven, sevenDayResetsAt: now + 4 * DAY,
    limits: [], fetchedAt: now - 3 * MIN, error: null, errorCount: 0, orgId: `org-${id}`, observedOrgId: `org-${id}`,
    leases: sessions.filter((s) => s.accountId === id && s.status === "running")
      .map((s) => ({ client: "devbox" as const, sessionId: s.id, label: s.name ?? null, createdAt: s.created_at })),
  });
  return {
    accounts: [acc("primary", "Max · primary", 41, 47), acc("backup", "Max · backup", 12, 22)],
    pool: { thresholdPct: 90, spilloverPct: 80, preferredAccountId: "primary", projectAccounts: {}, soloAccountId: null },
  };
}

/* -------------------------------------------------------------- hardware */

function series(id: string, range: string) {
  const span = range === "1h" ? HOUR : range === "6h" ? 6 * HOUR : range === "7d" ? 7 * DAY : DAY;
  const n = 120;
  const r = rng(id === "devbox" ? 5 : 6);
  const now = Date.now();
  const heavy = id === "devbox";
  return Array.from({ length: n }, (_, i) => {
    const at = Math.round(now - span + (span / (n - 1)) * i);
    const wave = Math.sin(i / 9) * 0.5 + 0.5;
    const cpu = round((heavy ? 22 : 8) + wave * (heavy ? 28 : 10) + r() * 9, 1);
    const memTotal = heavy ? 64 : 32;
    const memUsed = round(memTotal * ((heavy ? 0.48 : 0.31) + wave * 0.08 + r() * 0.02), 1);
    const diskTotal = heavy ? 1950 : 480;
    const diskUsed = heavy ? 612 + i * 0.02 : 138;
    return {
      at, cpu, memPct: round(memUsed / memTotal * 100, 1), memUsedGb: memUsed, memTotalGb: memTotal,
      swapPct: 1.2, swapUsedGb: 0.1, swapTotalGb: 8,
      diskPct: round(diskUsed / diskTotal * 100, 1), diskUsedGb: round(diskUsed, 1), diskTotalGb: diskTotal,
      diskReadMbs: round(2 + r() * 18 * wave, 1), diskWriteMbs: round(4 + r() * 26 * wave, 1),
      netUpKbs: round(120 + r() * 900 * wave), netDownKbs: round(300 + r() * 2400 * wave),
      load1: round(cpu / 12, 2), load5: round(cpu / 13, 2), load15: round(cpu / 14, 2),
    };
  });
}
export { series as hardwareSeries };

export function hardware() {
  const now = Date.now();
  const logins = (ip: string) => Array.from({ length: 6 }, (_, i) => ({ at: now - (i * 47 + 12) * MIN, user: "dev", ip, method: "publickey" }));
  const backup = (hoursAgo: number, original: number, stored: number) => ({
    state: "success", startedAt: now - hoursAgo * HOUR, finishedAt: now - hoursAgo * HOUR + 7 * MIN, nextAt: now + (24 - hoursAgo) * HOUR,
    message: null,
    repo: {
      archives: Array.from({ length: 7 }, (_, i) => ({ name: `devbox-${new Date(now - (i * 24 + hoursAgo) * HOUR).toISOString().slice(0, 10)}`, at: now - (i * 24 + hoursAgo) * HOUR, id: `a${i}f3c9e${i}` })),
      lastArchiveAt: now - hoursAgo * HOUR, originalBytes: original * GB, storedBytes: stored * GB,
    },
    pull: [{ label: "Latest archive", command: "borg extract ::latest srv/dev" }],
  });
  return {
    updatedAt: now - 20_000,
    machines: [
      {
        id: "devbox", label: "devbox",
        beszel: { id: "b1", name: "devbox", status: "up", agentVersion: "0.12.7", uptimeSec: 19 * 86400 + 4 * 3600, cpu: 38.4, memPct: 54.1, diskPct: 31.4 },
        host: {
          hostname: "devbox.example.com", os: "Debian GNU/Linux 13 (trixie)", kernel: "6.12.48+deb13-amd64",
          uptimeSec: 19 * 86400 + 4 * 3600, bootedAt: now - (19 * 86400 + 4 * 3600) * 1000,
          disk: { totalBytes: 1950 * GB, usedBytes: 612 * GB }, rebootRequired: false, rebootPkgs: [],
          updates: [{ pkg: "openssl", from: "3.5.1-1", to: "3.5.1-2" }, { pkg: "tzdata", from: "2025b-4", to: "2025c-1" }],
          logins: logins("100.64.12.7"),
          packages: [
            { at: now - 2 * DAY, action: "upgrade", pkg: "docker-ce", version: "5:28.4.0-1~debian.13" },
            { at: now - 2 * DAY, action: "upgrade", pkg: "containerd.io", version: "1.7.28-1" },
            { at: now - 6 * DAY, action: "install", pkg: "btop", version: "1.4.4-1" },
          ],
        },
        backup: backup(5, 540, 212), upgrade: { state: "success", startedAt: now - 2 * DAY, finishedAt: now - 2 * DAY + 3 * MIN, nextAt: now + 5 * DAY, message: null },
        checkedAt: now - 20_000, errors: [],
      },
      {
        id: "runner", label: "ci-runner",
        beszel: { id: "b2", name: "ci-runner", status: "up", agentVersion: "0.12.7", uptimeSec: 41 * 86400, cpu: 11.2, memPct: 33.6, diskPct: 28.7 },
        host: {
          hostname: "runner.example.com", os: "Ubuntu 24.04.3 LTS", kernel: "6.8.0-85-generic",
          uptimeSec: 41 * 86400, bootedAt: now - 41 * 86400 * 1000,
          disk: { totalBytes: 480 * GB, usedBytes: 138 * GB }, rebootRequired: true, rebootPkgs: ["linux-image-6.8.0-87-generic"],
          updates: [], logins: logins("192.0.2.44").slice(0, 3), packages: [],
        },
        backup: backup(3, 96, 41), upgrade: null, checkedAt: now - 25_000, errors: [],
      },
    ],
    monitors: [
      ["Dashboard", "https://devbox.example.com", 99.98, 41, 74],
      ["acme web (staging)", "https://staging.acme.example.com", 99.91, 128, 51],
      ["acme API", "https://api.acme.example.com/health", 100, 63, 51],
      ["Git mirror", "https://git.example.com", 99.95, 88, 33],
      ["Status page", "https://status.example.com", 100, 52, 74],
      ["Docs", "https://docs.acme.example.com", 99.99, 39, 51],
    ].map(([name, url, up, ms, cert], i) => ({
      id: `m${i}`, name, type: "http", url, hostname: null, tag: i < 2 ? "devbox" : "acme",
      up: true, uptime1d: 100, uptime30d: up, uptime365d: (up as number) - 0.03, responseMs: ms, certDaysLeft: cert,
    })),
    storageBox: { usedBytes: 253 * GB, totalBytes: 1000 * GB },
    errors: [],
  };
}

export function resources() {
  const running = sessions.filter((s) => s.status === "running");
  return {
    sessions: running.map((s) => ({ id: s.id, label: s.name ?? `${s.project}/${s.repo}`, project: s.project, cpuPct: s.cpuPct, memBytes: s.memBytes, dindMemBytes: s.dindMemBytes })),
    otherContainers: { count: 9, cpuPct: 14.2, memBytes: 4.2 * GB },
    codexMemBytes: 1.1 * GB, hostOtherBytes: 3.6 * GB,
    host: { totalBytes: 64 * GB, usedBytes: 34.6 * GB },
  };
}

export function disk() {
  return { usedBytes: 612 * GB, totalBytes: 1950 * GB, growthPerDay: 3.8 * GB, daysLeft: 352 };
}

/* ------------------------------------------------------------- approvals */

export function sshApprovals() {
  const now = Date.now();
  return [
    {
      id: "sa_7f2c", session_id: "dev-acme-api", title: "Deploy rate limiter to staging",
      why: "Run the migration and restart the API container on the staging host so the new rate-limit middleware can be smoke-tested.",
      target: "deploy@staging.acme.example.com", cwd: "/workspace", project: "acme", repo: "api", server: "acme-staging",
      status: "pending", decided_by: null, created_at: now - 2 * MIN, decided_at: null, expires_at: now + 13 * MIN, grant_until: null, grant_permanent: 0,
    },
  ];
}
export function sshGrants() {
  const now = Date.now();
  return [
    {
      id: "sa_51aa", session_id: "dev-labs-ml-pipeline", title: "Read GPU node metrics",
      why: "Check nvidia-smi on the training node while the backfill runs.", target: "ml@gpu-1.labs.example.com", cwd: "/workspace",
      project: "labs", repo: "ml-pipeline", server: "labs-gpu", status: "activated", decided_by: "ios",
      created_at: now - 54 * MIN, decided_at: now - 53 * MIN, expires_at: now - 38 * MIN, grant_until: now + 66 * MIN, grant_permanent: 0,
    },
  ];
}
export function sshKeys() {
  return {
    keys: [
      { title: "acme-deploy", vault: "Devbox", servers: [{ name: "acme-staging", user: "deploy", host: "staging.acme.example.com", port: 22 }, { name: "acme-prod", user: "deploy", host: "app.acme.example.com", port: 22 }] },
      { title: "labs-gpu", vault: "Devbox", servers: [{ name: "labs-gpu", user: "ml", host: "gpu-1.labs.example.com", port: 22 }] },
    ],
  };
}

export function prodWrites() {
  const now = Date.now();
  return [
    {
      id: 42, ts: now - 4 * MIN, session_id: "dev-acme-api", db: "acme-prod",
      sql: "UPDATE plans\n   SET rate_limit_per_min = 600\n WHERE tier = 'team'\n   AND rate_limit_per_min < 600;",
      status: "pending", decided_at: null, result: null, error: null, scope: "dml", exception: null, code: null, requestId: null,
      nextAction: "Review the SQL and approve or reject it.", access: null,
    },
    {
      id: 41, ts: now - 3 * HOUR, session_id: "dev-acme-web", db: "acme-prod",
      sql: "DELETE FROM carts WHERE updated_at < now() - interval '90 days' AND checked_out = false;",
      status: "executed", decided_at: now - 3 * HOUR + 2 * MIN, result: "DELETE 1834", error: null, scope: "dml",
    },
    {
      id: 40, ts: now - 26 * HOUR, session_id: "dev-acme-mobile", db: "acme-prod",
      sql: "UPDATE devices SET push_token = NULL;",
      status: "rejected", decided_at: now - 26 * HOUR + 5 * MIN, result: null, error: null, scope: "dml",
    },
  ];
}

/* ---------------------------------------------------------------- events */

export function events() {
  const now = Date.now();
  const e = (id: number, minsAgo: number, session: string | null, type: string, data: Record<string, unknown> | null = null) =>
    ({ id, ts: now - minsAgo * MIN, session_id: session, type, data: data ? JSON.stringify(data) : null });
  return [
    e(30, 2, "dev-acme-api", "ssh_key_requested", { title: "Deploy rate limiter to staging" }),
    e(29, 4, "dev-acme-api", "prod_write_proposed", { db: "acme-prod", id: 42 }),
    e(28, 6, "dev-acme-mobile", "agent_blocked"),
    e(27, 14, "dev-acme-web-2", "agent_done"),
    e(26, 31, "dev-acme-web", "critic_pass"),
    e(25, 50, "dev-acme-web-2", "open", { agent: "grok" }),
    e(24, 54, "dev-labs-ml-pipeline", "ssh_key_approved", { title: "Read GPU node metrics" }),
    e(23, 95, null, "cc_upgraded", { from: "2.0.30", to: "2.0.31" }),
    e(22, 160, "dev-acme-api", "open", { agent: "codex" }),
    e(21, 180, "dev-acme-web", "prod_write_executed", { db: "acme-prod", id: 41 }),
    e(20, 312, "dev-acme-web", "open", { agent: "claude" }),
    e(19, 420, "dev-labs-ml-pipeline", "worktree"),
    e(18, 540, "dev-acme-docs", "stop"),
  ];
}

/* ---------------------------------------------------------------- config */

export function config() {
  return {
    version: 1,
    settings: { autoStopHours: 12, portRangeStart: 40100, portsPerSession: 10, diskWarnPercent: 80 },
    folders: {
      acme: { provider: "github", owner: "acme", projects: {} },
      labs: { provider: "github", owner: "labs", projects: {} },
    },
    sshServers: [
      { name: "acme-staging", key: "acme-deploy", user: "deploy", host: "staging.acme.example.com", port: 22, note: "Staging app host" },
      { name: "acme-prod", key: "acme-deploy", user: "deploy", host: "app.acme.example.com", port: 22, note: "Production — approve with care" },
      { name: "labs-gpu", key: "labs-gpu", user: "ml", host: "gpu-1.labs.example.com", port: 22 },
    ],
  };
}

export function ccUpkeep() {
  return {
    latest: "2.0.31", image: "2.0.31",
    sessions: sessions.filter((s) => s.status === "running").map((s) => ({
      id: s.id, project: s.project, repo: s.repo, version: s.agent?.startsWith("claude") ? "2.0.31" : null,
      panes: s.tmux.length, stalePanes: 0, busyPct: s.claudeState === "working" ? 62 : 0,
    })),
  };
}
