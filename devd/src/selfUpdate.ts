import { planFor } from "../../infra/devbox-update";
import { parseUnitStatus, unitStatusScript, type UnitRun } from "./hardware";

// "Update now" in the dashboard. It starts the SAME unit as the nightly timer
// (devbox-update.service), so every safeguard of infra/devbox-update.ts still applies: only
// origin/main, only after CI passed, a dirty checkout is refused, and a devd that does not come up
// healthy is rolled back. The unit runs outside devd's cgroup, so the devd restart it may do
// does not kill it.

export const UPDATE_UNIT = "devbox-update";

export interface SelfUpdateStatus {
  /** Commit the running devd was started from. */
  running: string | null;
  /** Commit checked out on the server (what the next devd start would run). */
  deployed: string | null;
  /** origin/main after the last fetch. */
  latest: string | null;
  /** Commits on origin/main that are not deployed yet. */
  behind: number;
  /** The pending update restarts devd — the vault locks and has to be unlocked again. */
  restart: boolean;
  /** Changed infra files the update only reports (they need a manual setup.sh). */
  infra: string[];
  unit: UnitRun;
  /** Last JSON outcome line of devbox-update (`{"kind":…}`), or null when none was logged. */
  lastOutcome: { kind: string; [k: string]: unknown } | null;
  /** Why origin could not be fetched; the rest of the status is then from the previous fetch. */
  fetchError: string | null;
}

export interface SelfUpdateDeps {
  run: (cmd: string[], opts?: { cwd?: string; timeoutMs?: number }) => Promise<{ code: number; stdout: string; stderr: string }>;
  repoDir: string;
  runningCommit: string | null;
}

export function lastOutcome(journal: string): SelfUpdateStatus["lastOutcome"] {
  for (const line of journal.trim().split("\n").reverse()) {
    if (!line.startsWith("{\"kind\"")) continue;
    try { return JSON.parse(line); } catch { /* a truncated line — keep looking */ }
  }
  return null;
}

export async function selfUpdateStatus(d: SelfUpdateDeps): Promise<SelfUpdateStatus> {
  const git = (...args: string[]) => d.run(["git", "-C", d.repoDir, ...args], { cwd: d.repoDir, timeoutMs: 30_000 });
  const fetched = await git("fetch", "--quiet", "origin", "main");
  const fetchError = fetched.code === 0 ? null : fetched.stderr.trim() || `git fetch exited ${fetched.code}`;
  const rev = async (ref: string) => {
    const r = await git("rev-parse", "--verify", "--quiet", ref);
    return r.code === 0 ? r.stdout.trim() : null;
  };
  const deployed = await rev("HEAD");
  const latest = await rev("origin/main");
  let behind = 0;
  let plan = planFor([]);
  if (deployed && latest && deployed !== latest) {
    const count = await git("rev-list", "--count", `${deployed}..${latest}`);
    behind = count.code === 0 ? Number(count.stdout.trim()) || 0 : 0;
    const diff = await git("diff", "--name-only", `${deployed}..${latest}`);
    if (diff.code === 0) plan = planFor(diff.stdout.split("\n").filter(Boolean));
  }
  const unit = parseUnitStatus((await d.run(["sh", "-c", unitStatusScript(UPDATE_UNIT)])).stdout);
  const journal = await d.run(["journalctl", "-u", `${UPDATE_UNIT}.service`, "-n", "200", "-o", "cat", "--no-pager"]);
  return {
    running: d.runningCommit, deployed, latest, behind,
    restart: behind > 0 && plan.restart, infra: behind > 0 ? plan.infra : [],
    unit, lastOutcome: lastOutcome(journal.stdout), fetchError,
  };
}

/** Starts the update unit without waiting for it. null = it is already running. */
export async function startSelfUpdate(d: Pick<SelfUpdateDeps, "run">): Promise<{ ok: true } | null> {
  const active = await d.run(["systemctl", "is-active", "--quiet", `${UPDATE_UNIT}.service`]);
  if (active.code === 0) return null;
  const r = await d.run(["systemctl", "start", "--no-block", `${UPDATE_UNIT}.service`]);
  if (r.code !== 0) throw new Error(`systemctl start ${UPDATE_UNIT} failed: ${r.stderr.trim() || `exit ${r.code}`}`);
  return { ok: true };
}
